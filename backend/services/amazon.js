const cheerio = require('cheerio');
const { createClient, parsePrice, buildScore } = require('./helpers');

const SEARCH_URL = 'https://www.amazon.co.jp/-/zh/s';
const AMAZON_COOKIES = 'lc-acbjp=zh_TW; i18n-prefs=JPY; sp-cdn=JPP';

const client = createClient({
  'Accept-Language': 'zh-TW,zh-Hant;q=0.9,ja;q=0.8',
  Referer: 'https://www.amazon.co.jp/-/zh/',
  Cookie: AMAZON_COOKIES,
});

function buildProductUrl(href) {
  if (!href) return '';
  if (href.startsWith('http')) return href;
  return `https://www.amazon.co.jp${href}`;
}

function extractTitle($item) {
  const ariaTitle = $item.find('h2[aria-label]').attr('aria-label');
  if (ariaTitle) return ariaTitle.trim();

  const title = $item.find('h2 span').first().text().trim();
  if (title) return title;

  return $item.find('img.s-image').attr('alt')?.trim() || '';
}

function extractPrice($item) {
  const offscreen = $item.find('.a-price .a-offscreen').first().text().trim();
  if (offscreen) {
    const price = parsePrice(offscreen);
    if (price > 0) return price;
  }

  const whole = $item
    .find('.a-price-whole')
    .first()
    .clone()
    .children()
    .remove()
    .end()
    .text()
    .replace(/[.,\s]/g, '')
    .trim();
  const fraction = $item.find('.a-price-fraction').first().text().trim();
  if (whole) {
    const combined = fraction ? `${whole}.${fraction}` : whole;
    const price = parsePrice(combined);
    if (price > 0) return price;
  }

  const fallback = $item.find('.a-color-price, .a-text-price').first().text().trim();
  return parsePrice(fallback);
}

function extractProductUrl($item) {
  const href =
    $item.find('h2 a').first().attr('href') ||
    $item.find('a.a-link-normal[href*="/dp/"]').first().attr('href') ||
    $item.find('a.a-link-normal[href*="/gp/"]').first().attr('href') ||
    $item.find('a.a-link-normal.s-no-outline').first().attr('href') ||
    '';
  return buildProductUrl(href);
}

function normalizeProduct($, element, index) {
  const $item = $(element);
  const title = extractTitle($item);
  const url = extractProductUrl($item);
  const price = extractPrice($item);
  const image = $item.find('img.s-image').attr('src') || '';

  return {
    title,
    price,
    url,
    image,
    deal: 'Amazon.co.jp 即時搜尋',
    points: 'Prime / 點數依帳戶',
    score: buildScore(price, index, 85),
    currency: 'JPY',
  };
}

async function searchAmazon(query, limit = 12) {
  const response = await client.get(SEARCH_URL, {
    params: { k: query },
  });

  const html = response.data;
  if (
    typeof html !== 'string' ||
    /captcha|Robot Check|type the characters you see/i.test(html)
  ) {
    throw new Error('Amazon 回傳驗證頁面');
  }

  const $ = cheerio.load(html);
  const items = $('[data-component-type="s-search-result"], .s-result-item[data-asin]')
    .toArray()
    .map((element, index) => normalizeProduct($, element, index))
    .filter((item) => item.title && item.price > 0);

  if (!items.length) {
    throw new Error('無法解析 Amazon 搜尋結果');
  }

  return items.slice(0, limit);
}

module.exports = { searchAmazon };
