const { callAgent } = require('../utils/claudeClient');

async function runContentCreator(topic, options = {}) {
  const {
    contentType = 'artikel',
    targetAudience = 'Keluarga Indonesia usia 25-40',
    primaryKeyword = '',
    secondaryKeywords = '',
    seoBrief = '',
    trendContext = '',
    tone = 'kasual-edukatif',
    length = 'sedang',
    desiredCta = 'Kunjungi link di bawah untuk info lebih lanjut',
  } = options;

  const _agentResult = await callAgent('contentCreator', {
    CONTENT_TYPE: contentType,
    TOPIC: topic,
    TARGET_AUDIENCE: targetAudience,
    PRIMARY_KEYWORD: primaryKeyword || topic,
    SECONDARY_KEYWORDS: secondaryKeywords || 'Tidak ada.',
    SEO_BRIEF: seoBrief || 'Tidak ada.',
    TREND_CONTEXT: trendContext || 'Tidak ada.',
    TONE: tone,
    LENGTH: length,
    DESIRED_CTA: desiredCta,
  });
  const rawOutput = _agentResult.output;

  // Ekstrak konten dari output
  const contentMatch = rawOutput.match(
    /=== CONTENT OUTPUT ===([\s\S]*?)=== END CONTENT ===/
  );
  const content = contentMatch ? contentMatch[1].trim() : rawOutput;

  // Deteksi platform dari output
  const platformMatch = content.match(/\[PLATFORM\]:\s*(EBOOK|YOUTUBE|AFFILIATE)/i);
  const platform = platformMatch ? platformMatch[1] : 'UNKNOWN';

  // Estimasi word count
  const wordCount = content.split(/\s+/).length;

  return {
    raw: rawOutput,
    content,
    platform,
    wordCount,
    timestamp: new Date().toISOString(),
    model: _agentResult.model,
    usage: _agentResult.usage,
    costIdr: _agentResult.costIdr,
  };
}

module.exports = { runContentCreator };