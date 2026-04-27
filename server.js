require('dotenv').config();
const express = require('express');
const path    = require('path');
const crypto  = require('crypto');

// ── Database (opsional — graceful jika belum dikonfigurasi) ──
const db = require('./utils/db');
db.initDB().catch(err => console.warn('[DB] Init gagal:', err.message));

// ── Token cost estimation ──────────────────────────────────
const TOKEN_COST_PER_K = { 'haiku-4.5': 40, 'sonnet-4.6': 147 };
const AGENT_MODELS = {

function dbLog(agentId, topic, result, durationMs, req) {
  // result dapat berupa string (content agent) atau object dari callAgent {output, usage, costIdr}
  const isObj    = result && typeof result === 'object';
  const output   = isObj ? result.output || '' : result || '';
  const model    = isObj ? result.model  : (AGENT_MODELS[agentId] || 'haiku-4.5');
  const tokensIn  = isObj ? result.usage?.input_tokens  || 0 : 0;
  const tokensOut = isObj ? result.usage?.output_tokens || 0 : 0;
  const costIdr   = isObj ? result.costIdr || 0 : 0;
  const session   = getSessionToken(req);
  const ip        = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
  db.logRun({ agent:agentId, model, tokensIn, tokensOut, costIdr, durationMs,
    topic:(topic||'').slice(0,200), sessionToken:session, ip }).catch(()=>{});
  db.saveMemory({ agent:agentId, topic, sessionToken:session }).catch(()=>{});
}

// ── Auth ──────────────────────────────────────────────────
const AUTH    = { username: 'dino', password: 'solomon2025' };
const sessions = new Set();

function generateToken() { return crypto.randomBytes(32).toString('hex'); }

function getSessionToken(req) {
  const cookieHeader = req.headers.cookie || '';
  const cookies = Object.fromEntries(
    cookieHeader.split(';')
      .map(c => { const [k,...v]=c.trim().split('='); return [k, v.join('=')]; })
      .filter(([k]) => k)
  );
  return cookies['solomon_session'];
}

function requireAuth(req, res, next) {
  const token = getSessionToken(req);
  if (token && sessions.has(token)) return next();
  if (req.path.startsWith('/api/'))
    return res.status(401).json({ message: 'Unauthorized. Silakan login ulang.' });
  return res.redirect('/login');
}

// ── Agent imports ──────────────────────────────────────────
const { runOrchestrator }    = require('./agents/orchestrator');
const { runTrendAgent }      = require('./agents/trendAgent');
const { runSeoAgent }        = require('./agents/seoAgent');
const { runContentCreator }  = require('./agents/contentCreator');
const { runBusinessAnalyst } = require('./agents/businessAnalyst');
const { runMonetization }    = require('./agents/monetization');
const { runDistribution }    = require('./agents/distribution');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// ══════════════════════════════════════════════════════════
// PUBLIC ROUTES
// ══════════════════════════════════════════════════════════

app.get('/login', (req, res) => {
  const token = getSessionToken(req);
  if (token && sessions.has(token)) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const ip  = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
  const ua  = req.headers['user-agent'] || '';
  if (username === AUTH.username && password === AUTH.password) {
    const token = generateToken();
    sessions.add(token);
    res.setHeader('Set-Cookie',
      `solomon_session=${token}; Path=/; Max-Age=${7*24*60*60}; HttpOnly; SameSite=Strict`
    );
    db.logUserEvent({ eventType:'login', username, sessionToken:token, ip, userAgent:ua }).catch(()=>{});
    return res.json({ success: true });
  }
  db.logUserEvent({ eventType:'login_failed', username, ip, userAgent:ua }).catch(()=>{});
  res.status(401).json({ success: false, message: 'Username atau password salah.' });
});

app.post('/auth/logout', (req, res) => {
  const token = getSessionToken(req);
  const ip  = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
  if (token) {
    sessions.delete(token);
    db.logUserEvent({ eventType:'logout', username:AUTH.username, sessionToken:token, ip, userAgent:req.headers['user-agent']||'' }).catch(()=>{});
  }
  res.setHeader('Set-Cookie', 'solomon_session=; Path=/; Max-Age=0');
  res.json({ success: true });
});

// ══════════════════════════════════════════════════════════
// PROTECTED API — AGENTS
// ══════════════════════════════════════════════════════════

app.get('/api/health', requireAuth, (req, res) => {
  res.json({ status:'ok',
    agents_ready:['orchestrator','trendAgent','seoAgent','contentCreator','businessAnalyst','monetization','distribution'],
    total_agents:7, db_connected:!!db.getPool(),
    uptime: process.uptime().toFixed(0)+'s', timestamp: new Date().toISOString() });
});

app.post('/api/orchestrate', requireAuth, async (req, res) => {
  const t0 = Date.now();
  const { goal, business_line, context, time_budget } = req.body;
  if (!goal?.trim()) return res.status(400).json({ message: 'Goal tidak boleh kosong.' });
  try {
    const result = await runOrchestrator(goal, {
      businessLine: business_line || 'semua',
      additionalContext: context || '',
      timeBudget: time_budget || 'normal (1 minggu)',
    });
    const output = result.explanation || result.raw || '';
    dbLog('orchestrator', goal, result, Date.now()-t0, req);
    return res.json({ status:'success', goal, task_plan:result.taskPlan||null,
      explanation:output, full_output:result.raw||'', timestamp:result.timestamp });
  } catch (err) { return res.status(500).json({ message: err.message }); }
});

app.post('/api/trend', requireAuth, async (req, res) => {
  const t0 = Date.now();
  const { topic, business_line, time_horizon, market_context, context } = req.body;
  if (!topic?.trim()) return res.status(400).json({ message: 'Topic tidak boleh kosong.' });
  try {
    const result = await runTrendAgent(topic, {
      businessLine: business_line || 'semua',
      timeHorizon: time_horizon || '1-3 bulan',
      marketContext: market_context || 'indonesia dan global',
      additionalContext: context || '',
    });
    const output = result.report || result.raw || '';
    dbLog('trend', topic, result, Date.now()-t0, req);
    return res.json({ status:'success', topic, report:output,
      high_priority_count:result.highPriorityCount, full_output:result.raw, timestamp:result.timestamp });
  } catch (err) { return res.status(500).json({ message: err.message }); }
});

app.post('/api/seo', requireAuth, async (req, res) => {
  const t0 = Date.now();
  const { topic, platforms, content_type, target_audience, trend_context } = req.body;
  if (!topic?.trim()) return res.status(400).json({ message: 'Topic tidak boleh kosong.' });
  try {
    const result = await runSeoAgent(topic, {
      platforms: platforms || 'youtube,google,kdp',
      contentType: content_type || 'mixed',
      targetAudience: target_audience || 'Keluarga Indonesia usia 25-40',
      trendContext: trend_context || '',
    });
    const output = result.blueprint || result.raw || '';
    dbLog('seo', topic, result, Date.now()-t0, req);
    return res.json({ status:'success', topic, blueprint:output,
      keyword_table:result.keywordTable, full_output:result.raw, timestamp:result.timestamp });
  } catch (err) { return res.status(500).json({ message: err.message }); }
});

app.post('/api/content', requireAuth, async (req, res) => {
  const t0 = Date.now();
  const { topic, content_type, target_audience, primary_keyword, secondary_keywords,
          seo_brief, trend_context, tone, length, cta } = req.body;
  if (!topic?.trim()) return res.status(400).json({ message: 'Topic tidak boleh kosong.' });
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const fs = require('fs');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    let systemPrompt = fs.readFileSync(path.join(__dirname, 'prompts', 'contentCreator.txt'), 'utf8');
    const vars = {
      CONTENT_TYPE: content_type||'artikel', TOPIC: topic,
      TARGET_AUDIENCE: target_audience||'Keluarga Indonesia usia 25-40',
      PRIMARY_KEYWORD: primary_keyword||topic,
      SECONDARY_KEYWORDS: secondary_keywords||'Tidak ada.',
      SEO_BRIEF: seo_brief||'Tidak ada.', TREND_CONTEXT: trend_context||'Tidak ada.',
      TONE: tone||'kasual-edukatif', LENGTH: length||'sedang',
      DESIRED_CTA: cta||'Kunjungi link di bawah',
    };
    Object.entries(vars).forEach(([k,v]) => {
      systemPrompt = systemPrompt.split(`{${k}}`).join(v||'Tidak tersedia');
    });
    let fullText = '';
    const stream = await client.messages.stream({
      model: 'claude-haiku-4-5-20251001', max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role:'user', content:'Jalankan tugasmu.' }],
    });
    for await (const chunk of stream) {
      if (chunk.type==='content_block_delta' && chunk.delta?.text) {
        fullText += chunk.delta.text;
        send({ type:'chunk', text:chunk.delta.text });
      }
    }
    const platformMatch = fullText.match(/\[PLATFORM\]:\s*(EBOOK|YOUTUBE|AFFILIATE)/i);
    // Capture real usage from streaming
    const finalMsg = await stream.finalMessage();
    const streamResult = {
      output: fullText,
      model: 'claude-haiku-4-5-20251001',
      usage: finalMsg.usage,
      costIdr: Math.round(((finalMsg.usage.input_tokens / 1_000_000) * 0.80 + (finalMsg.usage.output_tokens / 1_000_000) * 4.00) * 16300),
    };
    dbLog('content', topic, streamResult, Date.now()-t0, req);
    send({ type:'done', platform:platformMatch?.[1]||content_type, word_count:fullText.split(/\s+/).length, content:fullText });
  } catch (err) { send({ type:'error', message:err.message }); }
  finally { res.end(); }
});

app.post('/api/analyst', requireAuth, async (req, res) => {
  const t0 = Date.now();
  const { topic, analysis_mode, business_line, available_data, revenue_target, specific_questions, trend_context } = req.body;
  if (!topic?.trim()) return res.status(400).json({ message: 'Topic tidak boleh kosong.' });
  try {
    const result = await runBusinessAnalyst(topic, {
      analysisMode: analysis_mode||'validasi_pasar', businessLine: business_line||'semua',
      availableData: available_data||'', revenueTarget: revenue_target||'',
      specificQuestions: specific_questions||'', trendContext: trend_context||'',
    });
    const output = result.report || result.raw || '';
    dbLog('analyst', topic, result, Date.now()-t0, req);
    return res.json({ status:'success', topic, verdict:result.verdict,
      summary:result.summary, report:output, full_output:result.raw, timestamp:result.timestamp });
  } catch (err) { return res.status(500).json({ message: err.message }); }
});

app.post('/api/monetization', requireAuth, async (req, res) => {
  const t0 = Date.now();
  const { product, mode, business_line, revenue_data, revenue_target, competitor_pricing, specific_questions } = req.body;
  if (!product?.trim()) return res.status(400).json({ message: 'Product tidak boleh kosong.' });
  try {
    const result = await runMonetization(product, {
      mode: mode||'pricing', businessLine: business_line||'semua',
      revenueData: revenue_data||'', revenueTarget: revenue_target||'',
      competitorPricing: competitor_pricing||'', specificQuestions: specific_questions||'',
    });
    const output = result.report || result.raw || '';
    dbLog('monetization', product, result, Date.now()-t0, req);
    return res.json({ status:'success', product, report:output,
      projection_table:result.projectionTable, full_output:result.raw, timestamp:result.timestamp });
  } catch (err) { return res.status(500).json({ message: err.message }); }
});

app.post('/api/distribution', requireAuth, async (req, res) => {
  const t0 = Date.now();
  const { content, mode, platforms, launch_date, existing_audience, context } = req.body;
  if (!content?.trim()) return res.status(400).json({ message: 'Konten tidak boleh kosong.' });
  try {
    const result = await runDistribution(content, {
      mode: mode||'distribution_plan', platforms: platforms||'semua',
      launchDate: launch_date||'', existingAudience: existing_audience||'',
      additionalContext: context||'',
    });
    const output = result.report || result.raw || '';
    dbLog('distribution', content, result, Date.now()-t0, req);
    return res.json({ status:'success', content, platform_count:result.platformCount,
      report:output, checklist:result.checklist, full_output:result.raw, timestamp:result.timestamp });
  } catch (err) { return res.status(500).json({ message: err.message }); }
});

// ══════════════════════════════════════════════════════════
// DB DATA API — untuk Dashboard
// ══════════════════════════════════════════════════════════

app.get('/api/db/stats', requireAuth, async (req, res) => {
  try {
    const [today, week, month, all, byAgent] = await Promise.all([
      db.getTokenStats('today'), db.getTokenStats('week'),
      db.getTokenStats('month'), db.getTokenStats('all'),
      db.getTokenStatsByAgent(req.query.period || 'month'),
    ]);
    res.json({ status:'ok', today, week, month, all, by_agent: byAgent || [] });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/db/activity', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '50'), 200);
    const rows  = await db.getActivityLog(limit);
    res.json({ status:'ok', data: rows || [] });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/db/memory', requireAuth, async (req, res) => {
  try {
    const { agent, limit = '20', q } = req.query;
    const data = (q && agent)
      ? await db.searchMemory(agent, q)
      : await db.getMemory(agent || null, parseInt(limit));
    res.json({ status:'ok', data: data || [] });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/db/userlog', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '30'), 100);
    const [rows, sessions] = await Promise.all([
      db.getUserLog(limit), db.getActiveSessions(),
    ]);
    res.json({ status:'ok', data: rows || [], active_sessions: sessions?.[0]?.count || 0 });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/db/agent-config
app.get('/api/db/agent-config', requireAuth, async (req, res) => {
  try {
    const data = await db.getAgentConfigs();
    res.json({ status:'ok', data: data || [] });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/db/agent-config  { agent, model, maxTokens }
app.post('/api/db/agent-config', requireAuth, async (req, res) => {
  try {
    const { agent, model, maxTokens } = req.body;
    if (!agent || !maxTokens) return res.status(400).json({ message: 'agent dan maxTokens wajib diisi.' });
    const validAgents = ['trend','analyst','seo','content','monetization','distribution','orchestrator'];
    if (!validAgents.includes(agent)) return res.status(400).json({ message: 'Agent tidak valid.' });
    const tokens = Math.min(Math.max(parseInt(maxTokens) || 1024, 256), 8192);
    await db.upsertAgentConfig({ agent, model: model || db.AGENT_DEFAULTS[agent]?.model, maxTokens: tokens });
    const { invalidateConfigCache } = require('./utils/claudeClient');
    invalidateConfigCache();
    res.json({ status:'ok', agent, maxTokens: tokens });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ══════════════════════════════════════════════════════════
// PAGE ROUTES
// ══════════════════════════════════════════════════════════

app.get('/', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('*', (req, res) => {
  if (path.extname(req.path)) return res.status(404).send('Not found');
  requireAuth(req, res, () => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('\n' + '━'.repeat(48));
  console.log('  SOLOMON AGENT SYSTEM');
  console.log('━'.repeat(48));
  console.log(`  URL  → http://localhost:${PORT}`);
  console.log(`  Auth → dino / solomon2025`);
  console.log(`  Key  → ${process.env.ANTHROPIC_API_KEY ? '✅ Loaded' : '❌ MISSING!'}`);
  console.log(`  DB   → ${process.env.DB_HOST ? `${process.env.DB_HOST}/${process.env.DB_NAME}` : '⚠ Tidak dikonfigurasi (opsional)'}`);
  console.log('━'.repeat(48) + '\n');
});