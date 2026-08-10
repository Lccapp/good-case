function parseKeywords(query) {
  return String(query || '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function matchesKeywords(text, keywords) {
  if (!keywords.length) return true;
  const haystack = String(text || '').toLowerCase();
  return keywords.every((keyword) => haystack.includes(keyword));
}

module.exports = { parseKeywords, matchesKeywords };
