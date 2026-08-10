const cheerio = require('cheerio');
const { createClient, parsePrice, buildScore } = require('./helpers');

const SEARCH_URL = 'https://www.amazon.co.jp/s';
const client = createClient({
  'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
  Referer: 'https://www.amazon.co.jp/',
});

function extractPrice($item) {
  const offscreen = $item.find('.a-price .a-offscreen').first().text();
  if (offscreen) return parsePrice(offscreen);

  const whole = $item.find('.a-price-whole').first().text();
  const fraction = $item.find('.a-price-fraction').first().text();
  return parsePrice(`${whole}${fraction}`);
}

function normalizeProduct($, element, index) {
  const $item = $(element);
  const title = $item.find('h2 span').first().text().trim();
  const href = $item.find('h2 a').attr('href') || '';
  const price = extractPrice($item);
  const image = $item.find('img.s-image').attr('src') || '';

  const url = href.startsWith('http')
    ? href
    : href
      ? `https://www.amazon.co.jp${href}`
      : '';

  return {
    title,
    price,
    url,
    image,
    deal: 'Amazon.co.jp 即時搜尋・價格為日幣',
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
