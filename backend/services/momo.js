const { createClient, parsePrice, buildScore, extractJsonLd } = require('./helpers');

const SEARCH_URL = 'https://www.momoshop.com.tw/search';
const client = createClient();

function normalizeProduct(product, index) {
  const title = (product.name || '').trim();
  const price = parsePrice(product.offers?.price ?? product.price);

  return {
    title,
    price,
    url: product.url || '',
    image: product.image || '',
    deal: product.description || 'momo 購物網',
    points: 'mo幣回饋依活動',
    score: buildScore(price, index, 88),
  };
}

async function searchMomo(query, limit = 12) {
  const response = await client.get(`${SEARCH_URL}/${encodeURIComponent(query)}`);
  const itemList = extractJsonLd(response.data, 'ItemList');
  const products = (itemList?.itemListElement || [])
    .map((entry) => entry.item || entry)
    .filter((item) => item && item['@type'] === 'Product');

  if (!products.length) {
    return [];
  }

  return products.slice(0, limit).map(normalizeProduct);
}

module.exports = { searchMomo };
