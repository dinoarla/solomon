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

  const taskPlan = extractTaskPlan(rawOutput, jsonMatch);

  return {
    raw: rawOutput,
    taskPlan,
    explanation: explainMatch ? explainMatch[1].trim() : rawOutput,
    timestamp: new Date().toISOString(),
  };
}

// Coba berbagai pola untuk ekstrak JSON
function extractTaskPlan(text, jsonMatch) {
  const candidates = [];

  // Dari regex header utama
  if (jsonMatch) candidates.push(jsonMatch[1].trim());

  // Dari code block ```json
  const codeBlock = text.match(/```json\s*(\{[\s\S]*?\})\s*```/);
  if (codeBlock) candidates.push(codeBlock[1].trim());

  // Dari code block ``` biasa
  const plainBlock = text.match(/```\s*(\{[\s\S]*?"agent_sequence"[\s\S]*?\})\s*```/);
  if (plainBlock) candidates.push(plainBlock[1].trim());

  // Langsung cari JSON dengan agent_sequence
  const rawJson = text.match(/(\{[\s\S]*?"agent_sequence"[\s\S]*?\})/);
  if (rawJson) candidates.push(rawJson[1].trim());

  // Coba parse satu per satu, ambil yang pertama berhasil
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      continue;
    }
  }

  console.log('⚠️  Tidak ada JSON valid ditemukan dalam output');
  return null;
}

module.exports = { runOrchestrator };