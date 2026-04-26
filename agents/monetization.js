const { callAgent } = require('../utils/claudeClient');

async function runMonetization(product, options = {}) {
  const {
    mode = 'pricing',
    businessLine = 'semua',
    revenueData = '',
    revenueTarget = '',
    competitorPricing = '',
    specificQuestions = '',
  } = options;

  const rawOutput = await callAgent('monetization', {
    MODE: mode,
    PRODUCT: product,
    BUSINESS_LINE: businessLine,
    REVENUE_DATA: revenueData || 'Tidak ada data historis.',
    REVENUE_TARGET: revenueTarget || 'Tidak ditentukan.',
    COMPETITOR_PRICING: competitorPricing || 'Tidak ada data.',
    SPECIFIC_QUESTIONS: specificQuestions || 'Tidak ada.',
  });

  // Ekstrak report
  const reportMatch = rawOutput.match(
    /=== MONETIZATION REPORT ===([\s\S]*?)=== END MONETIZATION REPORT ===/
  );
  const report = reportMatch ? reportMatch[1].trim() : rawOutput;

  // Ekstrak proyeksi tabel
  const tableMatch = report.match(/## 📊 PROYEKSI REVENUE([\s\S]*?)##/);
  const projectionTable = tableMatch ? tableMatch[1].trim() : null;

  return {
    raw: rawOutput,
    report,
    projectionTable,
    timestamp: new Date().toISOString(),
  };
}

module.exports = { runMonetization };