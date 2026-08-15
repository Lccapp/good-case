const axios = require('axios');
const https = require('https');

const SEARCH_URL = 'https://ecshweb.pchome.com.tw/search/v3.3/all/results';
const BUTTON_URL = 'https://ecapi.pchome.com.tw/ecshop/prodapi/v2/prod/button';
const PROD_URL = 'https://ecapi.pchome.com.tw/ecshop/prodapi/v2/prod';
const ACT_URL = 'https://ecapi.pchome.com.tw/ecshop/couponapi/v1/act';
const IMAGE_BASE = 'https://cs-b.ecimg.tw';
const PRODUCT_BASE = 'https://24h.pchome.com.tw/prod';

const SOLD_OUT_PATTERN = /熱銷一空|已賣完|已售完|售完|缺貨中|補貨中|暫時缺貨|sold\s*out/i;

const client = axios.create({
  timeout: 12000,
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: 'application/json, text/plain, */*',
    Referer: 'https://24h.pchome.com.tw/',
  },
});

function parseJsonpProd(text) {
  const body = String(text || '');
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');

  if (start < 0 || end <= start) {
    return {};
  }

  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return {};
  }
}

function isArrival24hValue(value) {
  return value === 1 || value === true || String(value) === '1';
}

function parseArrivalFlag(body) {
  const parsed = parseJsonpProd(body);
  const entry = Object.values(parsed)[0];
  if (isArrival24hValue(entry?.isArrival24h)) {
    return true;
  }

  return /"isArrival24h"\s*:\s*"?1"?/.test(String(body || ''));
}

async function fetchButtonGroups(ids) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (!uniqueIds.length) {
    return new Map();
  }

  try {
    const response = await client.get(BUTTON_URL, {
      params: {
        id: uniqueIds.join(','),
        fields: 'Group,Price,isOrderDiscount,ButtonType,Qty,SaleStatus',
      },
    });

    const map = new Map();
    for (const item of response.data || []) {
      const group = item.Group;
      if (!group) {
        continue;
      }

      if (!map.has(group)) {
        map.set(group, []);
      }
      map.get(group).push(item);
    }

    return map;
  } catch {
    return new Map();
  }
}

const PROD_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: '*/*',
  Referer: 'https://24h.pchome.com.tw/',
};

function fetchProdArrivalViaHttps(id) {
  const path = `/ecshop/prodapi/v2/prod/${id}&fields=Id,isArrival24h&_callback=jsonp_prod`;

  return new Promise((resolve) => {
    const request = https.request(
      {
        hostname: 'ecapi.pchome.com.tw',
        path,
        method: 'GET',
        headers: PROD_HEADERS,
        timeout: 10000,
      },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () => resolve(parseArrivalFlag(body)));
      }
    );

    request.on('timeout', () => {
      request.destroy();
      resolve(false);
    });
    request.on('error', () => resolve(false));
    request.end();
  });
}

async function fetchProdArrival(id) {
  try {
    const response = await client.get(
      `${PROD_URL}/${id}&fields=Id,isArrival24h&_callback=jsonp_prod`,
      {
        responseType: 'text',
        transformResponse: [(data) => data],
        timeout: 10000,
      }
    );

    if (parseArrivalFlag(response.data)) {
      return true;
    }
  } catch {
    // fall through to native HTTPS
  }

  return fetchProdArrivalViaHttps(id);
}

async function fetchArrivalMap(ids) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (!uniqueIds.length) {
    return new Map();
  }

  const entries = await Promise.all(
    uniqueIds.map(async (id) => [id, await fetchProdArrival(id)])
  );

  return new Map(entries);
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

function pickPrimaryButton(buttons) {
  if (!Array.isArray(buttons) || !buttons.length) {
    return null;
  }

  return (
    buttons.find(
      (item) => item.ButtonType === 'ForSale' && Number(item.Qty) > 0
    ) ||
    buttons.find((item) => item.ButtonType === 'ForSale') ||
    buttons[0]
  );
}

function isPchomeSoldOut(prod, buttons) {
  const text = `${prod.name || ''} ${prod.describe || ''}`;
  if (SOLD_OUT_PATTERN.test(text)) {
    return true;
  }

  if (!Array.isArray(buttons) || !buttons.length) {
    return false;
  }

  return !buttons.some(
    (item) => item.ButtonType === 'ForSale' && Number(item.Qty) > 0
  );
}

function isPchomeAvailable(prod, buttons) {
  return !isPchomeSoldOut(prod, buttons);
}

function isPchomeFastDelivery(prod, arrivalMap) {
  return arrivalMap.get(prod.Id) === true;
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

function collectPchomeText(prod, actLabels) {
  const acts = (prod.couponActid || [])
    .map((actId) => {
      const act = actLabels.get(actId);
      return `${act?.name || ''}${act?.type || ''}`;
    })
    .join(' ');

  return `${prod.name || ''} ${prod.describe || ''} ${acts}`;
}

function hasPriceReduction(prod, button) {
  const listPrice = button?.Price?.M || prod.originPrice || 0;
  const salePrice = button?.Price?.P ?? prod.price ?? 0;

  return (
    button?.isOrderDiscount === 1 ||
    (listPrice > salePrice && listPrice > 0) ||
    (prod.originPrice > prod.price && prod.originPrice > 0)
  );
}

function buildDeal(prod, button, actLabels) {
  const blob = collectPchomeText(prod, actLabels);
  const hasCoupon =
    /折價券/.test(blob) ||
    hasActKeyword(prod, actLabels, '折價券');
  const hasPCoin =
    /贈P幣|送P幣/.test(blob) || hasActKeyword(prod, actLabels, '贈P幣');
  const hasRegisterGift =
    hasActKeyword(prod, actLabels, '登記送') || blob.includes('登記送');
  const hasGift = /贈品/.test(blob) || hasActKeyword(prod, actLabels, '贈品');
  const hasRegisterLottery =
    hasActKeyword(prod, actLabels, '登記抽') || blob.includes('登記抽');

  if (hasCoupon) {
    return '可用折價券';
  }

  if (hasPCoin) {
    return '贈P幣';
  }

  if (hasRegisterGift) {
    return '登記送';
  }

  if (hasGift) {
    return '贈品';
  }

  if (hasRegisterLottery) {
    return '登記抽';
  }

  if (hasPriceReduction(prod, button)) {
    return '售價已折';
  }

  if (prod.couponActid?.length) {
    return '可用折價券';
  }

  return '到PChome查看';
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

function normalizeProduct(prod, index, button, actLabels, arrivalMap) {
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
    fastDelivery: Boolean(isPchomeFastDelivery(prod, arrivalMap)),
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

  const candidates = prods.slice(0, Math.max(limit * 3, 24));
  const [buttonGroups, actLabels] = await Promise.all([
    fetchButtonGroups(candidates.map((prod) => prod.Id)),
    fetchActLabels(candidates.flatMap((prod) => prod.couponActid || [])),
  ]);

  const available = candidates.filter((prod) =>
    isPchomeAvailable(prod, buttonGroups.get(prod.Id))
  );
  const selected = available.slice(0, limit);

  if (!selected.length) {
    return [];
  }

  const arrivalMap = await fetchArrivalMap(selected.map((prod) => prod.Id));

  return selected.map((prod, index) =>
    normalizeProduct(
      prod,
      index,
      pickPrimaryButton(buttonGroups.get(prod.Id)),
      actLabels,
      arrivalMap
    )
  );
}

module.exports = { searchPChome };
