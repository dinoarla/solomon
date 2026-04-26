require('dotenv').config();
const express = require('express');
const path = require('path');
const { runOrchestrator } = require('./agents/orchestrator');
const { runTrendAgent } = require('./agents/trendAgent');
const { runSeoAgent } = require('./agents/seoAgent');
const { runContentCreator } = require('./agents/contentCreator');
const { runBusinessAnalyst } = require('./agents/businessAnalyst');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // Serve web UI

// ── API Routes ──────────────────────────────────────

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    agents_ready: ['orchestrator'],
    uptime: process.uptime().toFixed(0) + 's',
    timestamp: new Date().toISOString(),
  });
});

// Orchestrator endpoint
app.post('/api/orchestrate', async (req, res) => {
  const { goal, business_line, context, time_budget } = req.body;

  if (!goal?.trim()) {
    return res.status(400).json({ message: 'Goal tidak boleh kosong.' });
  }

  try {
    const result = await runOrchestrator(goal, {
      businessLine: business_line || 'semua',
      additionalContext: context || '',
      timeBudget: time_budget || 'normal (1 minggu)',
    });

    // Pastikan selalu return field 'explanation'
    return res.json({
      status: 'success',
      goal,
      task_plan: result.taskPlan || null,
      explanation: result.explanation || result.raw || 'Tidak ada output',
      full_output: result.raw || '',
      timestamp: result.timestamp,
    });

  } catch (err) {
    console.error('Orchestrate error:', err.message);
    return res.status(500).json({ message: err.message });
  }
});

// Trend Agent endpoint
app.post('/api/trend', async (req, res) => {
  const { topic, business_line, time_horizon, market_context, context } = req.body;

  if (!topic?.trim()) {
    return res.status(400).json({ message: 'Topic tidak boleh kosong.' });
  }

  console.log(`\n[TREND] Topic: "${topic.substring(0, 60)}"`);

  try {
    const result = await runTrendAgent(topic, {
      businessLine: business_line || 'semua',
      timeHorizon: time_horizon || '1-3 bulan',
      marketContext: market_context || 'indonesia dan global',
      additionalContext: context || '',
    });

    return res.json({
      status: 'success',
      topic,
      report: result.report,
      high_priority_count: result.highPriorityCount,
      full_output: result.raw,
      timestamp: result.timestamp,
    });

  } catch (err) {
    console.error('Trend error:', err.message);
    return res.status(500).json({ message: err.message });
  }
});

// SEO Agent endpoint
app.post('/api/seo', async (req, res) => {
  const { topic, platforms, content_type, target_audience, trend_context } = req.body;

  if (!topic?.trim()) {
    return res.status(400).json({ message: 'Topic tidak boleh kosong.' });
  }

  console.log(`\n[SEO] Topic: "${topic.substring(0, 60)}"`);

  try {
    const result = await runSeoAgent(topic, {
      platforms: platforms || 'youtube,google,kdp',
      contentType: content_type || 'mixed',
      targetAudience: target_audience || 'Keluarga Indonesia usia 25-40',
      trendContext: trend_context || '',
    });

    return res.json({
      status: 'success',
      topic,
      blueprint: result.blueprint,
      keyword_table: result.keywordTable,
      full_output: result.raw,
      timestamp: result.timestamp,
    });

  } catch (err) {
    console.error('SEO error:', err.message);
    return res.status(500).json({ message: err.message });
  }
});

// Content Creator endpoint — STREAMING VERSION
app.post('/api/content', async (req, res) => {
  const {
    topic, content_type, target_audience,
    primary_keyword, secondary_keywords,
    seo_brief, trend_context, tone, length, cta
  } = req.body;

  if (!topic?.trim()) {
    return res.status(400).json({ message: 'Topic tidak boleh kosong.' });
  }

  console.log(`\n[CONTENT] Type: ${content_type} | Topic: "${topic.substring(0, 50)}"`);

  // Setup SSE streaming
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const fs = require('fs');
    const path = require('path');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // Load & fill prompt
    const promptPath = path.join(__dirname, 'prompts', 'contentCreator.txt');
    let systemPrompt = fs.readFileSync(promptPath, 'utf8');
    const vars = {
      CONTENT_TYPE: content_type || 'artikel',
      TOPIC: topic,
      TARGET_AUDIENCE: target_audience || 'Keluarga Indonesia usia 25-40',
      PRIMARY_KEYWORD: primary_keyword || topic,
      SECONDARY_KEYWORDS: secondary_keywords || 'Tidak ada.',
      SEO_BRIEF: seo_brief || 'Tidak ada.',
      TREND_CONTEXT: trend_context || 'Tidak ada.',
      TONE: tone || 'kasual-edukatif',
      LENGTH: length || 'sedang',
      DESIRED_CTA: cta || 'Kunjungi link di bawah',
    };
    Object.entries(vars).forEach(([k, v]) => {
      systemPrompt = systemPrompt.split(`{${k}}`).join(v || 'Tidak tersedia');
    });

    sendEvent({ type: 'status', message: 'Memulai produksi konten...' });

    // Stream response dari Claude
    let fullText = '';
    const stream = await client.messages.stream({
      model: 'claude-haiku-4-5-20251001', // Haiku: jauh lebih cepat
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: 'Jalankan tugasmu berdasarkan input di system prompt.' }],
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
        fullText += chunk.delta.text;
        sendEvent({ type: 'chunk', text: chunk.delta.text });
      }
    }

    // Ekstrak platform & word count
    const platformMatch = fullText.match(/\[PLATFORM\]:\s*(EBOOK|YOUTUBE|AFFILIATE)/i);
    const platform = platformMatch ? platformMatch[1] : content_type;
    const wordCount = fullText.split(/\s+/).length;

    sendEvent({
      type: 'done',
      platform,
      word_count: wordCount,
      content: fullText,
    });

  } catch (err) {
    console.error('Content stream error:', err.message);
    sendEvent({ type: 'error', message: err.message });
  } finally {
    res.end();
  }
});

// Business Analyst endpoint
app.post('/api/analyst', async (req, res) => {
  const {
    topic, analysis_mode, business_line,
    available_data, revenue_target,
    specific_questions, trend_context
  } = req.body;

  if (!topic?.trim()) {
    return res.status(400).json({ message: 'Topic tidak boleh kosong.' });
  }

  console.log(`\n[ANALYST] Mode: ${analysis_mode} | Topic: "${topic.substring(0, 50)}"`);

  try {
    const result = await runBusinessAnalyst(topic, {
      analysisMode: analysis_mode || 'validasi_pasar',
      businessLine: business_line || 'semua',
      availableData: available_data || '',
      revenueTarget: revenue_target || '',
      specificQuestions: specific_questions || '',
      trendContext: trend_context || '',
    });

    return res.json({
      status: 'success',
      topic,
      verdict: result.verdict,
      summary: result.summary,
      report: result.report,
      full_output: result.raw,
      timestamp: result.timestamp,
    });

  } catch (err) {
    console.error('Analyst error:', err.message);
    return res.status(500).json({ message: err.message });
  }
});

// Semua route lain → web UI
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('\n' + '━'.repeat(45));
  console.log('  🤖  AI AGENT SYSTEM');
  console.log('━'.repeat(45));
  console.log(`  URL    → http://localhost:${PORT}`);
  console.log(`  API    → http://localhost:${PORT}/api`);
  console.log(`  Mode   → ${process.env.NODE_ENV || 'development'}`);
  console.log(`  Key    → ${process.env.ANTHROPIC_API_KEY ? '✅ Loaded' : '❌ MISSING!'}`);
  console.log('━'.repeat(45) + '\n');
});