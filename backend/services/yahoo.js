const { createClient, parsePrice, buildScore, extractScriptJson } = require('./helpers');

const SEARCH_URL = 'https://tw.buy.yahoo.com/search/product';
const client = createClient();

function isYahooExpress(hit) {
  if (
    Array.isArray(hit.ec_options) &&
    hit.ec_options.some((opt) => opt.item === 'is_express')
  ) {
    return true;
  }

  if (String(hit.ec_is_express || hit.is_express || '').toLowerCase() === 'true') {
    return true;
  }

  return false;
}

function buildDeal(hit) {
  if (isYahooExpress(hit)) {
    return '快速到貨';
  }

  const listPrice = parsePrice(hit.ec_listprice);
  const price = parsePrice(hit.ec_price || hit.promo_price);
  if (listPrice > price) {
    return `原價 $${listPrice.toLocaleString()}・現省 $${(listPrice - price).toLocaleString()}`;
  }

  return '—';
}

function normalizeHit(hit, index) {
  const title = (hit.ec_title || '').trim();
  const price = parsePrice(hit.ec_price || hit.promo_price);

  return {
    title,
    price,
    url: hit.ec_item_url || '',
    image: hit.ec_image || '',
    deal: buildDeal(hit),
    points: hit.ec_brand ? `${hit.ec_brand} 官方/授權` : '購物金回饋依活動',
    score: buildScore(price, index, 90),
  };
}

async function searchYahoo(query, limit = 12) {
  const response = await client.get(SEARCH_URL, {
    params: { p: query },
  });

  const redux = extractScriptJson(response.data, 'isoredux-data');
  const hits = redux?.search?.ecsearch?.hits || [];

  const products = hits.filter(
    (hit) => hit && typeof hit === 'object' && !Object.prototype.hasOwnProperty.call(hit, 'total-hit-count')
  );

  if (!products.length) {
    return [];
  }

  return products.slice(0, limit).map(normalizeHit);
}

module.exports = { searchYahoo };
