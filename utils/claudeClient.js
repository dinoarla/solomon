require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Harga real Anthropic API (USD per 1M tokens)
const PRICING = {
  'claude-sonnet-4-6':         { input: 3.00,  output: 15.00 },
  'claude-haiku-4-5-20251001': { input: 0.80,  output: 4.00  },
};

// Default max_tokens — override via dashboard (sol_agent_config di DB)
const MODEL_CONFIG = {
  orchestrator:    { model: 'claude-sonnet-4-6',         maxTokens: 2048 },
  businessAnalyst: { model: 'claude-sonnet-4-6',         maxTokens: 2048 },
  contentCreator:  { model: 'claude-haiku-4-5-20251001', maxTokens: 4096 },
  monetization:    { model: 'claude-sonnet-4-6',         maxTokens: 2048 },
  trendAgent:      { model: 'claude-haiku-4-5-20251001', maxTokens: 2048 },
  seoAgent:        { model: 'claude-haiku-4-5-20251001', maxTokens: 2048 },
  distribution:    { model: 'claude-haiku-4-5-20251001', maxTokens: 1024 },
};

// Cache config dari DB (refresh setiap 60 detik)
let _configCache = null;
let _configCachedAt = 0;

async function getAgentConfig(db) {
  const now = Date.now();
  if (_configCache && (now - _configCachedAt) < 60000) return _configCache;
  try {
    const rows = await db.query('SELECT agent, model, max_tokens FROM sol_agent_config');
    if (rows?.length) {
      _configCache = {};
      rows.forEach(r => {
        _configCache[r.agent] = { model: r.model, maxTokens: parseInt(r.max_tokens) };
      });
      _configCachedAt = now;
    }
  } catch { /* DB tidak tersedia — pakai default */ }
  return _configCache;
}

function invalidateConfigCache() { _configCache = null; }

// Kurs IDR (update berkala)
const USD_TO_IDR = 16300;

function calcCostUsd(model, inputTokens, outputTokens) {
  const p = PRICING[model] || PRICING['claude-haiku-4-5-20251001'];
  return (inputTokens / 1_000_000) * p.input
       + (outputTokens / 1_000_000) * p.output;
}

function loadPrompt(agentName) {
  const p = path.join(__dirname, '../prompts', `${agentName}.txt`);
  if (!fs.existsSync(p)) throw new Error(`Prompt tidak ditemukan: ${p}`);
  return fs.readFileSync(p, 'utf8');
}

function fillVariables(text, vars = {}) {
  return Object.entries(vars).reduce(
    (t, [k, v]) => t.split(`{${k}}`).join(v || 'Tidak tersedia'),
    text
  );
}

function saveLog(agentName, usage, costUsd, output) {
  const dir = path.join(__dirname, '../logs');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const entry = JSON.stringify({
    ts: new Date().toISOString(),
    agent: agentName,
    tokens_in: usage.input_tokens,
    tokens_out: usage.output_tokens,
    cost_usd: costUsd.toFixed(6),
    preview: output.substring(0, 300),
  }) + '\n';
  fs.appendFileSync(path.join(dir, `${agentName}.log`), entry);
}

async function callAgent(agentName, variables = {}, db = null) {
  let cfg = MODEL_CONFIG[agentName] || MODEL_CONFIG.orchestrator;
  if (db) {
    const dbCfg = await getAgentConfig(db);
    if (dbCfg?.[agentName]) cfg = { ...cfg, ...dbCfg[agentName] };
  }
  const systemPrompt = fillVariables(loadPrompt(agentName), variables);

  console.log(`  → [${agentName}] calling Claude (${cfg.model}, max:${cfg.maxTokens})...`);
  const t0 = Date.now();

  const res = await client.messages.create({
    model:      cfg.model,
    max_tokens: cfg.maxTokens,
    system:     systemPrompt,
    messages:   [{ role: 'user', content: 'Jalankan tugasmu berdasarkan input di system prompt.' }],
  });

  const usage = {
    input_tokens:  res.usage.input_tokens,
    output_tokens: res.usage.output_tokens,
    total_tokens:  res.usage.input_tokens + res.usage.output_tokens,
  };

  const costUsd = calcCostUsd(cfg.model, usage.input_tokens, usage.output_tokens);
  const costIdr = Math.round(costUsd * USD_TO_IDR);
  const dur = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(`  ✓ [${agentName}] ${dur}s | in:${usage.input_tokens} out:${usage.output_tokens} | $${costUsd.toFixed(4)} (Rp${costIdr})`);

  const output = res.content[0].text;
  saveLog(agentName, usage, costUsd, output);

  // stop_reason check
  if (res.stop_reason === 'max_tokens') {
    console.warn(`  ⚠ [${agentName}] Output terpotong — max_tokens (${cfg.maxTokens}) tercapai`);
  }

  return { output, usage, costUsd, costIdr, model: cfg.model };
}

module.exports = { callAgent, calcCostUsd, USD_TO_IDR, invalidateConfigCache };