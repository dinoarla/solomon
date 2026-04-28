const { callAgent } = require('../utils/claudeClient');

async function runSeoAgent(topic, options = {}) {
  const {
    platforms = 'youtube,google,kdp',
    contentType = 'mixed',
    targetAudience = 'Keluarga Indonesia usia 25-40',
    trendContext = '',
  } = options;

  const _agentResult = await callAgent('seoAgent', {
    TOPIC: topic,
    PLATFORMS: platforms,
    CONTENT_TYPE: contentType,
    TARGET_AUDIENCE: targetAudience,
    TREND_CONTEXT: trendContext || 'Tidak ada data tren.',
  });
  const rawOutput = _agentResult.output;

  // Ekstrak bagian blueprint
  const blueprintMatch = rawOutput.match(
    /=== SEO BLUEPRINT ===([\s\S]*?)=== END SEO BLUEPRINT ===/
  );
  const blueprintContent = blueprintMatch
    ? blueprintMatch[1].trim()
    : rawOutput;

  // Ekstrak keyword table
  const keywordTable = extractKeywordTable(rawOutput);

  return {
    raw: rawOutput,
    blueprint: blueprintContent,
    keywordTable,
    timestamp: new Date().toISOString(),
    model: _agentResult.model,
    usage: _agentResult.usage,
    costIdr: _agentResult.costIdr,
  };
}

function extractKeywordTable(text) {
  const tableMatch = text.match(/\|.*Keyword.*\|[\s\S]*?(?=\n\n|\n##)/);
  return tableMatch ? tableMatch[0].trim() : null;
}

module.exports = { runSeoAgent };