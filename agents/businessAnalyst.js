const { callAgent } = require('../utils/claudeClient');

async function runBusinessAnalyst(topic, options = {}) {
  const {
    analysisMode = 'validasi_pasar',
    businessLine = 'semua',
    availableData = '',
    revenueTarget = '',
    specificQuestions = '',
    trendContext = '',
  } = options;

  const rawOutput = await callAgent('businessAnalyst', {
    ANALYSIS_MODE: analysisMode,
    TOPIC: topic,
    BUSINESS_LINE: businessLine,
    AVAILABLE_DATA: availableData || 'Tidak ada data historis.',
    REVENUE_TARGET: revenueTarget || 'Tidak ditentukan.',
    SPECIFIC_QUESTIONS: specificQuestions || 'Tidak ada.',
    TREND_CONTEXT: trendContext || 'Tidak ada.',
  });

  // Ekstrak bagian report
  const reportMatch = rawOutput.match(
    /=== BUSINESS ANALYSIS REPORT ===([\s\S]*?)=== END REPORT ===/
  );
  const report = reportMatch ? reportMatch[1].trim() : rawOutput;

  // Ekstrak executive summary
  const summaryMatch = report.match(/## 📋 EXECUTIVE SUMMARY([\s\S]*?)##/);
  const summary = summaryMatch ? summaryMatch[1].trim() : '';

  // Deteksi verdict GO/NO-GO
  const verdictMatch = rawOutput.match(/VERDICT:\s*(GO|NO-GO|GO WITH CONDITIONS)/i);
  const verdict = verdictMatch ? verdictMatch[1] : null;

  return {
    raw: rawOutput,
    report,
    summary,
    verdict,
    timestamp: new Date().toISOString(),
  };
}

module.exports = { runBusinessAnalyst };