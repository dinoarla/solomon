require('dotenv').config();
const express = require('express');
const path = require('path');
const { runOrchestrator } = require('./agents/orchestrator');

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