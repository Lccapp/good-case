const axios = require('axios');

const SEARCH_URL = 'https://ecshweb.pchome.com.tw/search/v3.3/all/results';
const BUTTON_URL = 'https://ecapi.pchome.com.tw/ecshop/prodapi/v2/prod/button';
const ACT_URL = 'https://ecapi.pchome.com.tw/ecshop/couponapi/v1/act';
const IMAGE_BASE = 'https://cs-b.ecimg.tw';
const PRODUCT_BASE = 'https://24h.pchome.com.tw/prod';

const client = axios.create({
  timeout: 12000,
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: 'application/json, text/plain, */*',
    Referer: 'https://24h.pchome.com.tw/',
  },
});

async function fetchButtonMap(ids) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (!uniqueIds.length) {
    return new Map();
  }

  try {
    const response = await client.get(BUTTON_URL, {
      params: {
        id: uniqueIds.join(','),
        fields: 'Group,Price,isOrderDiscount,ButtonType',
      },
    });

    const map = new Map();
    for (const item of response.data || []) {
      const group = item.Group;
      if (!group || map.has(group)) {
        continue;
      }
      map.set(group, item);
    }

    return map;
  } catch {
    return new Map();
  }
}

async function fetchActLabels(actIds) {
  const uniqueIds = [...new Set(actIds.filter(Boolean))];
  if (!uniqueIds.length) {
    return new Map();
  }

  try {
    const response = await client.get(ACT_URL, {
      params: {
        actid: uniqueIds.join(','),
      },
      timeout: 8000,
    });

    const rows = Array.isArray(response.data)
      ? response.data
      : response.data?.acts || response.data?.Act || [];

    const map = new Map();
    for (const row of rows) {
      const id = row.ActId || row.actid || row.Id || row.id;
      if (!id) {
        continue;
      }
      map.set(id, {
        name: row.ActName || row.name || row.Title || row.title || '',
        type: row.ActType || row.type || row.Kind || row.kind || '',
      });
    }

    return map;
  } catch {
    return new Map();
  }
}

function actLabelIncludes(act, keyword) {
  const text = `${act?.name || ''}${act?.type || ''}`;
  return text.includes(keyword);
}

function hasActKeyword(prod, actLabels, keyword) {
  for (const actId of prod.couponActid || []) {
    const act = actLabels.get(actId);
    if (act && actLabelIncludes(act, keyword)) {
      return true;
    }
  }

  return false;
}

function detectRegistrationFromText(prod) {
  const text = `${prod.name || ''} ${prod.describe || ''}`;
  if (text.includes('登記送')) {
    return '登記送';
  }
  if (text.includes('登記抽')) {
    return '登記抽';
  }
  return null;
}

function pickSitePromo(button) {
  const text = button?.Price?.DiscountText?.trim();
  return text || null;
}

function hasPriceReduction(prod, button) {
  const listPrice = button?.Price?.M || prod.originPrice || 0;
  const salePrice = button?.Price?.P ?? prod.price ?? 0;

  return (
    button?.isOrderDiscount === 1 ||
    (listPrice > salePrice && listPrice > 0)
  );
}

function buildDeal(prod, button, actLabels) {
  const sitePromo = pickSitePromo(button);
  if (sitePromo) {
    return sitePromo;
  }

  const hasCoupon = (prod.couponActid?.length || 0) > 0;
  const hasRegisterGift =
    hasActKeyword(prod, actLabels, '登記送') ||
    detectRegistrationFromText(prod) === '登記送';
  const hasRegisterLottery =
    hasActKeyword(prod, actLabels, '登記抽') ||
    detectRegistrationFromText(prod) === '登記抽';

  if (hasCoupon && !hasRegisterGift && !hasRegisterLottery) {
    return '可用折價券';
  }

  if (hasPriceReduction(prod, button)) {
    return '售價已折';
  }

  if (hasRegisterGift) {
    return '登記送';
  }

  if (hasRegisterLottery) {
    return '登記抽';
  }

  if (hasCoupon) {
    return '可用折價券';
  }

  const listPrice = button?.Price?.M || prod.originPrice || prod.price || 0;
  return `原價$${listPrice.toLocaleString()}`;
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

function normalizeProduct(prod, index, button, actLabels) {
  const title = buildTitle(prod);
  const matchText = `${prod.name || ''} ${prod.describe || ''}`.replace(/\\r\\n/g, ' ').trim();
  const salePrice = button?.Price?.P ?? prod.price ?? 0;

  return {
    title,
    matchText,
    price: salePrice,
    url: `${PRODUCT_BASE}/${prod.Id}`,
    image: prod.picS ? `${IMAGE_BASE}${prod.picS}` : '',
    deal: buildDeal(prod, button, actLabels),
    fastDelivery: true,
    points: prod.couponActid?.length ? 'PChome 折價券活動' : 'P幣回饋依卡別',
    score: buildScore({ ...prod, price: salePrice }, index),
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

  const selected = prods.slice(0, limit);
  const [buttonMap, actLabels] = await Promise.all([
    fetchButtonMap(selected.map((prod) => prod.Id)),
    fetchActLabels(selected.flatMap((prod) => prod.couponActid || [])),
  ]);

  return selected.map((prod, index) =>
    normalizeProduct(prod, index, buttonMap.get(prod.Id), actLabels)
  );
}

module.exports = { searchPChome };
