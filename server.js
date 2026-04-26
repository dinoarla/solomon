require('dotenv').config();
const express = require('express');
const path = require('path');
const { runOrchestrator } = require('./agents/orchestrator');
const { runTrendAgent } = require('./agents/trendAgent');
const { runSeoAgent } = require('./agents/seoAgent');
const { runContentCreator } = require('./agents/contentCreator');

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

// Content Creator endpoint
app.post('/api/content', async (req, res) => {

  // Set timeout 55 detik (sebelum Hostinger cut)
  req.setTimeout(55000);
  res.setTimeout(55000);

  const {
    topic, content_type, target_audience,
    primary_keyword, secondary_keywords,
    seo_brief, trend_context, tone, length, cta
  } = req.body;

  if (!topic?.trim()) {
    return res.status(400).json({ message: 'Topic tidak boleh kosong.' });
  }

  // Timeout promise
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Request timeout — coba dengan konten lebih pendek')), 50000)
  );

  console.log(`\n[CONTENT] Type: ${content_type} | Topic: "${topic.substring(0, 50)}"`);

  try {
    const result = await Promise.race([
      runContentCreator(topic, {
        contentType: content_type || 'artikel',
        targetAudience: target_audience || 'Keluarga Indonesia usia 25-40',
        primaryKeyword: primary_keyword || '',
        secondaryKeywords: secondary_keywords || '',
        seoBrief: seo_brief || '',
        trendContext: trend_context || '',
        tone: tone || 'kasual-edukatif',
        length: length || 'sedang',
        desiredCta: cta || 'Kunjungi link di bawah',
      }),
      timeoutPromise
    ]);

    return res.json({
      status: 'success',
      topic,
      platform: result.platform,
      word_count: result.wordCount,
      content: result.content,
      full_output: result.raw,
      timestamp: result.timestamp,
    });

  } catch (err) {
    console.error('Content error:', err.message);
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