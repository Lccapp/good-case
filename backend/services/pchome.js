const axios = require('axios');

const SEARCH_URL = 'https://ecshweb.pchome.com.tw/search/v3.3/all/results';
const IMAGE_BASE = 'https://cs-b.ecimg.tw';
const PRODUCT_BASE = 'https://24h.pchome.com.tw/prod';

const client = axios.create({
  timeout: 12000,
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: 'application/json',
  },
});

function buildDeal(prod) {
  const origin = prod.originPrice || prod.price || 0;
  const current = prod.price || 0;
  const savings = origin - current;

  if (savings > 0) {
    return `最高折${savings.toLocaleString()}`;
  }

  if (prod.couponActid?.length) {
    return '可用折價券';
  }

  return `原價$${origin.toLocaleString()}`;
}

function buildScore(prod, index) {
  const priceScore = Math.max(0, 100 - Math.floor((prod.price || 0) / 200));
  return Math.max(60, Math.min(99, priceScore - index));
}

function buildTitle(prod) {
  const name = (prod.name || '').replace(/\\r\\n/g, ' ').trim();
  const describe = (prod.describe || '').replace(/\\r\\n/g, ' ').trim();
  const brandMatch = describe.match(/【([^】]+)】/);

  if (brandMatch && !name.includes(brandMatch[1])) {
    return `${brandMatch[1]} ${name}`;
  }

  return name || describe;
}

function normalizeProduct(prod, index) {
  const title = buildTitle(prod);
  const matchText = `${prod.name || ''} ${prod.describe || ''}`.replace(/\\r\\n/g, ' ').trim();

  return {
    title,
    matchText,
    price: prod.price || 0,
    url: `${PRODUCT_BASE}/${prod.Id}`,
    image: prod.picS ? `${IMAGE_BASE}${prod.picS}` : '',
    deal: buildDeal(prod),
    fastDelivery: true,
    points: prod.couponActid?.length ? 'PChome 折價券活動' : 'P幣回饋依卡別',
    score: buildScore(prod, index),
  };
}

async function searchPChome(query, limit = 12) {
  const response = await client.get(SEARCH_URL, {
    params: {
      q: query,
      sort: 'hot',
      page: 1,
    },
  });

  const prods = response.data?.prods || [];

  if (!prods.length) {
    return [];
  }

  return prods.slice(0, limit).map(normalizeProduct);
}

module.exports = { searchPChome };
