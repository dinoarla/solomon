require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');

// ── Auth config (hardcoded, no database) ──
const AUTH = {
  username: 'dino',
  password: 'solomon2025',
};
const sessions = new Set(); // simpan token di memory

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function requireAuth(req, res, next) {
  // Cek dari cookie header manual (tanpa library)
  const cookieHeader = req.headers.cookie || '';
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map(c => {
      const [k, ...v] = c.trim().split('=');
      return [k, v.join('=')];
    }).filter(([k]) => k)
  );
  const token = cookies['solomon_session'];
  if (token && sessions.has(token)) return next();
  res.redirect('/login');
}

const { runOrchestrator } = require('./agents/orchestrator');
const { runTrendAgent } = require('./agents/trendAgent');
const { runSeoAgent } = require('./agents/seoAgent');
const { runContentCreator } = require('./agents/contentCreator');
const { runBusinessAnalyst } = require('./agents/businessAnalyst');
const { runMonetization } = require('./agents/monetization');
const { runDistribution } = require('./agents/distribution');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Auth Routes ──────────────────────────────

// Login page
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Login POST
app.post('/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (username === AUTH.username && password === AUTH.password) {
    const token = generateToken();
    sessions.add(token);
    // Set cookie 7 hari
    res.setHeader('Set-Cookie',
      `solomon_session=${token}; Path=/; Max-Age=${7 * 24 * 60 * 60}; HttpOnly; SameSite=Strict`
    );
    return res.json({ success: true });
  }
  res.status(401).json({ success: false, message: 'Username atau password salah.' });
});

// Logout
app.post('/auth/logout', (req, res) => {
  const cookieHeader = req.headers.cookie || '';
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map(c => {
      const [k, ...v] = c.trim().split('=');
      return [k, v.join('=')];
    }).filter(([k]) => k)
  );
  const token = cookies['solomon_session'];
  if (token) sessions.delete(token);
  res.setHeader('Set-Cookie', 'solomon_session=; Path=/; Max-Age=0');
  res.json({ success: true });
});

// ── Protected API Routes ──────────────────────

app.get('/api/health', requireAuth, (req, res) => {
  res.json({
    status: 'ok',
    agents_ready: ['orchestrator','trendAgent','seoAgent','contentCreator','businessAnalyst','monetization','distribution'],
    total_agents: 7,
    uptime: process.uptime().toFixed(0) + 's',
    timestamp: new Date().toISOString(),
  });
});

app.post('/api/orchestrate', requireAuth, async (req, res) => {
  const { goal, business_line, context, time_budget } = req.body;
  if (!goal?.trim()) return res.status(400).json({ message: 'Goal tidak boleh kosong.' });
  try {
    const result = await runOrchestrator(goal, {
      businessLine: business_line || 'semua',
      additionalContext: context || '',
      timeBudget: time_budget || 'normal (1 minggu)',
    });
    return res.json({
      status: 'success', goal,
      task_plan: result.taskPlan || null,
      explanation: result.explanation || result.raw || '',
      full_output: result.raw || '',
      timestamp: result.timestamp,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

app.post('/api/trend', requireAuth, async (req, res) => {
  const { topic, business_line, time_horizon, market_context, context } = req.body;
  if (!topic?.trim()) return res.status(400).json({ message: 'Topic tidak boleh kosong.' });
  try {
    const result = await runTrendAgent(topic, {
      businessLine: business_line || 'semua',
      timeHorizon: time_horizon || '1-3 bulan',
      marketContext: market_context || 'indonesia dan global',
      additionalContext: context || '',
    });
    return res.json({ status: 'success', topic, report: result.report, high_priority_count: result.highPriorityCount, full_output: result.raw, timestamp: result.timestamp });
  } catch (err) { return res.status(500).json({ message: err.message }); }
});

app.post('/api/seo', requireAuth, async (req, res) => {
  const { topic, platforms, content_type, target_audience, trend_context } = req.body;
  if (!topic?.trim()) return res.status(400).json({ message: 'Topic tidak boleh kosong.' });
  try {
    const result = await runSeoAgent(topic, {
      platforms: platforms || 'youtube,google,kdp',
      contentType: content_type || 'mixed',
      targetAudience: target_audience || 'Keluarga Indonesia usia 25-40',
      trendContext: trend_context || '',
    });
    return res.json({ status: 'success', topic, blueprint: result.blueprint, keyword_table: result.keywordTable, full_output: result.raw, timestamp: result.timestamp });
  } catch (err) { return res.status(500).json({ message: err.message }); }
});

app.post('/api/content', requireAuth, async (req, res) => {
  const { topic, content_type, target_audience, primary_keyword, secondary_keywords, seo_brief, trend_context, tone, length, cta } = req.body;
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
      CONTENT_TYPE: content_type || 'artikel', TOPIC: topic,
      TARGET_AUDIENCE: target_audience || 'Keluarga Indonesia usia 25-40',
      PRIMARY_KEYWORD: primary_keyword || topic,
      SECONDARY_KEYWORDS: secondary_keywords || 'Tidak ada.',
      SEO_BRIEF: seo_brief || 'Tidak ada.', TREND_CONTEXT: trend_context || 'Tidak ada.',
      TONE: tone || 'kasual-edukatif', LENGTH: length || 'sedang',
      DESIRED_CTA: cta || 'Kunjungi link di bawah',
    };
    Object.entries(vars).forEach(([k, v]) => {
      systemPrompt = systemPrompt.split(`{${k}}`).join(v || 'Tidak tersedia');
    });

    let fullText = '';
    const stream = await client.messages.stream({
      model: 'claude-haiku-4-5-20251001', max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: 'Jalankan tugasmu.' }],
    });
    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
        fullText += chunk.delta.text;
        send({ type: 'chunk', text: chunk.delta.text });
      }
    }
    const platformMatch = fullText.match(/\[PLATFORM\]:\s*(EBOOK|YOUTUBE|AFFILIATE)/i);
    send({ type: 'done', platform: platformMatch?.[1] || content_type, word_count: fullText.split(/\s+/).length, content: fullText });
  } catch (err) { send({ type: 'error', message: err.message }); }
  finally { res.end(); }
});

app.post('/api/analyst', requireAuth, async (req, res) => {
  const { topic, analysis_mode, business_line, available_data, revenue_target, specific_questions, trend_context } = req.body;
  if (!topic?.trim()) return res.status(400).json({ message: 'Topic tidak boleh kosong.' });
  try {
    const result = await runBusinessAnalyst(topic, {
      analysisMode: analysis_mode || 'validasi_pasar',
      businessLine: business_line || 'semua',
      availableData: available_data || '',
      revenueTarget: revenue_target || '',
      specificQuestions: specific_questions || '',
      trendContext: trend_context || '',
    });
    return res.json({ status: 'success', topic, verdict: result.verdict, summary: result.summary, report: result.report, full_output: result.raw, timestamp: result.timestamp });
  } catch (err) { return res.status(500).json({ message: err.message }); }
});

app.post('/api/monetization', requireAuth, async (req, res) => {
  const { product, mode, business_line, revenue_data, revenue_target, competitor_pricing, specific_questions } = req.body;
  if (!product?.trim()) return res.status(400).json({ message: 'Product tidak boleh kosong.' });
  try {
    const result = await runMonetization(product, {
      mode: mode || 'pricing', businessLine: business_line || 'semua',
      revenueData: revenue_data || '', revenueTarget: revenue_target || '',
      competitorPricing: competitor_pricing || '', specificQuestions: specific_questions || '',
    });
    return res.json({ status: 'success', product, report: result.report, projection_table: result.projectionTable, full_output: result.raw, timestamp: result.timestamp });
  } catch (err) { return res.status(500).json({ message: err.message }); }
});

app.post('/api/distribution', requireAuth, async (req, res) => {
  const { content, mode, platforms, launch_date, existing_audience, context } = req.body;
  if (!content?.trim()) return res.status(400).json({ message: 'Konten tidak boleh kosong.' });
  try {
    const result = await runDistribution(content, {
      mode: mode || 'distribution_plan', platforms: platforms || 'semua',
      launchDate: launch_date || '', existingAudience: existing_audience || '',
      additionalContext: context || '',
    });
    return res.json({ status: 'success', content, platform_count: result.platformCount, report: result.report, checklist: result.checklist, full_output: result.raw, timestamp: result.timestamp });
  } catch (err) { return res.status(500).json({ message: err.message }); }
});

// Root → redirect ke login atau app
app.get('/', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('\n' + '━'.repeat(45));
  console.log('  🤖  SOLOMON AGENT SYSTEM');
  console.log('━'.repeat(45));
  console.log(`  URL  → http://localhost:${PORT}`);
  console.log(`  Auth → username: dino`);
  console.log(`  Key  → ${process.env.ANTHROPIC_API_KEY ? '✅ Loaded' : '❌ MISSING!'}`);
  console.log('━'.repeat(45) + '\n');
});