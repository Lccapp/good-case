const cheerio = require('cheerio');
const { createClient, parsePrice, buildScore } = require('./helpers');

const SEARCH_URL = 'https://www.tw.coupang.com/np/search';
const client = createClient({
  Referer: 'https://www.tw.coupang.com/',
});

function normalizeProduct($, element, index) {
  const $item = $(element);
  const title = $item.find('.name, [class*="productName"], a[data-product-id]').first().text().trim();
  const href = $item.find('a[href*="/products/"], a[href*="/vp/products/"]').first().attr('href') || '';
  const priceText =
    $item.find('.price-value, strong.price-value, [class*="Price_priceValue"]').first().text() ||
    $item.find('[class*="price"]').first().text();
  const price = parsePrice(priceText);
  const image = $item.find('img').first().attr('src') || '';

  const url = href.startsWith('http')
    ? href
    : href
      ? `https://www.tw.coupang.com${href}`
      : '';

  return {
    title,
    price,
    url,
    image,
    deal: 'Coupang 即時搜尋',
    points: 'WOW 會員優惠依帳戶',
    score: buildScore(price, index, 92),
  };
}

async function searchCoupang(query, limit = 12) {
  const response = await client.get(SEARCH_URL, {
    params: { q: query },
    validateStatus: () => true,
  });

  if (response.status >= 400) {
    throw new Error(`Coupang 回應 ${response.status}`);
  }

  const html = String(response.data || '');
  if (/access denied|robot|captcha/i.test(html)) {
    throw new Error('Coupang 阻擋自動化請求');
  }

  const $ = cheerio.load(html);
  const selectors = [
    '#productList li',
    'li.search-product',
    '[class*="search-product"]',
    'ul#productList > li',
  ];

  let elements = [];
  for (const selector of selectors) {
    elements = $(selector).toArray();
    if (elements.length) break;
  }

  const items = elements
    .map((element, index) => normalizeProduct($, element, index))
    .filter((item) => item.title && item.price > 0);

  if (!items.length) {
    throw new Error('無法解析 Coupang 搜尋結果');
  }

  return items.slice(0, limit);
}

module.exports = { searchCoupang };
