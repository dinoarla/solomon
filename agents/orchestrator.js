const { callAgent } = require('../utils/claudeClient');

async function runOrchestrator(ownerGoal, options = {}) {
  const {
    businessLine = 'semua',
    additionalContext = '',
    timeBudget = 'normal (1 minggu)',
  } = options;

  const rawOutput = await callAgent('orchestrator', {
    OWNER_GOAL: ownerGoal,
    BUSINESS_LINE: businessLine,
    ADDITIONAL_CONTEXT: additionalContext || 'Tidak ada.',
    TIME_BUDGET: timeBudget,
  });

  // Pisahkan JSON dan penjelasan
  const jsonMatch = rawOutput.match(/=== TASK PLAN \(JSON\) ===\s*([\s\S]*?)\s*=== PENJELASAN/);
  const explainMatch = rawOutput.match(/=== PENJELASAN UNTUK OWNER ===\s*([\s\S]*?)$/);

  let taskPlan = null;
  try {
    if (jsonMatch) taskPlan = JSON.parse(jsonMatch[1].trim());
  } catch {
    // JSON parsing gagal, simpan raw
  }

  return {
    raw: rawOutput,
    taskPlan,
    explanation: explainMatch ? explainMatch[1].trim() : rawOutput,
    timestamp: new Date().toISOString(),
  };
}

module.exports = { runOrchestrator };