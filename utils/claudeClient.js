require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Model per agen — hemat biaya
const MODEL_CONFIG = {
  orchestrator:    { model: 'claude-sonnet-4-6',         maxTokens: 2048 },
  businessAnalyst: { model: 'claude-sonnet-4-6',         maxTokens: 2048 },
  contentCreator:  { model: 'claude-sonnet-4-6',         maxTokens: 4096 }, // turun dari 8192
  monetization:    { model: 'claude-sonnet-4-6',         maxTokens: 2048 },
  trendAgent:      { model: 'claude-haiku-4-5-20251001', maxTokens: 2048 },
  seoAgent:        { model: 'claude-haiku-4-5-20251001', maxTokens: 2048 },
  distribution:    { model: 'claude-haiku-4-5-20251001', maxTokens: 1024 },
};

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

function saveLog(agentName, tokens, output) {
  const dir = path.join(__dirname, '../logs');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const entry = JSON.stringify({
    ts: new Date().toISOString(),
    agent: agentName,
    tokens,
    preview: output.substring(0, 300),
  }) + '\n';
  fs.appendFileSync(path.join(dir, `${agentName}.log`), entry);
}

async function callAgent(agentName, variables = {}) {
  const cfg = MODEL_CONFIG[agentName] || MODEL_CONFIG.orchestrator;
  const systemPrompt = fillVariables(loadPrompt(agentName), variables);

  console.log(`  → [${agentName}] calling Claude (${cfg.model})...`);
  const t0 = Date.now();

  const res = await client.messages.create({
    model: cfg.model,
    max_tokens: cfg.maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: 'Jalankan tugasmu berdasarkan input di system prompt.' }],
  });

  const tokens = res.usage.input_tokens + res.usage.output_tokens;
  const dur = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`  ✓ [${agentName}] selesai ${dur}s | ${tokens} tokens`);

  const output = res.content[0].text;
  saveLog(agentName, tokens, output);
  return output;
}

module.exports = { callAgent };