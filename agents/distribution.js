const { callAgent } = require('../utils/claudeClient');

async function runDistribution(content, options = {}) {
  const {
    mode = 'distribution_plan',
    platforms = 'semua',
    launchDate = '',
    existingAudience = '',
    additionalContext = '',
  } = options;

  const _agentResult = await callAgent('distribution', {
    MODE: mode,
    CONTENT: content,
    PLATFORMS: platforms,
    LAUNCH_DATE: launchDate || 'Tidak ditentukan, sesegera mungkin.',
    EXISTING_AUDIENCE: existingAudience || 'Belum ada data audiens.',
    ADDITIONAL_CONTEXT: additionalContext || 'Tidak ada.',
  });
  const rawOutput = _agentResult.output;

  // Ekstrak report
  const reportMatch = rawOutput.match(
    /=== DISTRIBUTION PLAN ===([\s\S]*?)=== END DISTRIBUTION PLAN ===/
  );
  const report = reportMatch ? reportMatch[1].trim() : rawOutput;

  // Ekstrak checklist
  const checklistMatch = report.match(/## ✅ ACTION CHECKLIST([\s\S]*?)$/);
  const checklist = checklistMatch ? checklistMatch[1].trim() : null;

  // Hitung jumlah platform
  const platformMatch = report.match(/\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|/g);
  const platformCount = platformMatch ? platformMatch.length - 1 : 0; // minus header

  return {
    raw: rawOutput,
    report,
    checklist,
    platformCount,
    timestamp: new Date().toISOString(),
    model: _agentResult.model,
    usage: _agentResult.usage,
    costIdr: _agentResult.costIdr,
  };
}

module.exports = { runDistribution };