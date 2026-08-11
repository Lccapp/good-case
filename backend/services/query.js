const STOP_KEYWORDS = new Set([
  '第',
  '代',
  '款',
  '版',
  '型',
  '入',
  '的',
  '和',
  '與',
  '或',
  '用',
  '可',
  '含',
  '附',
  '送',
  '加',
]);

function parseKeywords(query) {
  return String(query || '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function significantKeywords(query) {
  return parseKeywords(query).filter((keyword) => {
    if (STOP_KEYWORDS.has(keyword)) return false;
    if (/^[a-z0-9]+$/i.test(keyword) && keyword.length < 2) return false;
    return true;
  });
}

function matchesKeywords(text, keywords) {
  if (!keywords.length) return true;
  const haystack = String(text || '').toLowerCase();
  return keywords.every((keyword) => haystack.includes(keyword));
}

module.exports = { parseKeywords, significantKeywords, matchesKeywords };
