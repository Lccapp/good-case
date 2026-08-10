const axios = require('axios');

const DEFAULT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
  'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

function createClient(extraHeaders = {}) {
  return axios.create({
    timeout: 15000,
    headers: { ...DEFAULT_HEADERS, ...extraHeaders },
    maxRedirects: 5,
    validateStatus: (status) => status >= 200 && status < 400,
  });
}

function parsePrice(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);

  const text = String(value).replace(/[^\d.,]/g, '').replace(/,/g, '');
  const parsed = Number.parseFloat(text);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function buildScore(price, index, base = 95) {
  const priceScore = Math.max(0, 100 - Math.floor((price || 0) / 200));
  return Math.max(60, Math.min(99, priceScore + base - index * 2));
}

function extractJsonLd(html, type) {
  const scripts = html.match(
    /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi
  );
  if (!scripts) return null;

  for (const block of scripts) {
    const match = block.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
    if (!match) continue;

    try {
      const data = JSON.parse(match[1].trim());
      const nodes = data['@graph'] || (Array.isArray(data) ? data : [data]);
      const found = nodes.find((node) => node['@type'] === type);
      if (found) return found;
    } catch {
      // ignore malformed JSON-LD blocks
    }
  }

  return null;
}

function extractScriptJson(html, scriptId) {
  const pattern = new RegExp(
    `<script[^>]*id="${scriptId}"[^>]*>([\\s\\S]*?)<\\/script>`,
    'i'
  );
  const match = html.match(pattern);
  if (!match) return null;

  try {
    return JSON.parse(match[1].trim());
  } catch {
    return null;
  }
}

module.exports = {
  DEFAULT_HEADERS,
  createClient,
  parsePrice,
  buildScore,
  extractJsonLd,
  extractScriptJson,
};
