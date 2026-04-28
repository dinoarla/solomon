const { callAgent } = require('../utils/claudeClient');

async function runTrendAgent(topic, options = {}) {
  const {
    businessLine = 'semua',
    timeHorizon = '1-3 bulan',
    marketContext = 'indonesia dan global',
    additionalContext = '',
  } = options;

  const _agentResult = await callAgent('trendAgent', {
    TOPIC: topic,
    BUSINESS_LINE: businessLine,
    TIME_HORIZON: timeHorizon,
    MARKET_CONTEXT: marketContext,
    ADDITIONAL_CONTEXT: additionalContext || 'Tidak ada.',
  });
  const rawOutput = _agentResult.output;
  const reportMatch = rawOutput.match(/=== TREND REPORT ===([\s\S]*?)=== END REPORT ===/);
  const reportContent = reportMatch ? reportMatch[1].trim() : rawOutput;

  // Hitung jumlah tren prioritas tinggi
  const highPriorityCount = (rawOutput.match(/Skor.*?([89]|10)\/10/g) || []).length;

  return {
    raw: rawOutput,
    report: reportContent,
    highPriorityCount,
    timestamp: new Date().toISOString(),
    model: _agentResult.model,
    usage: _agentResult.usage,
    costIdr: _agentResult.costIdr,
  };
}

module.exports = { runTrendAgent };