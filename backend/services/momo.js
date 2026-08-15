const { createClient, parsePrice, buildScore, extractJsonLd } = require('./helpers');

const SEARCH_URL = 'https://www.momoshop.com.tw/search';
const API_URL = 'https://apisearch.momoshop.com.tw/momoSearchCloud/moec/textSearch';
const PRODUCT_BASE =
  'https://www.momoshop.com.tw/goods/GoodsDetail.jsp?i_code=';
const DEFAULT_LIMIT = 30;

const client = createClient({
  Origin: 'https://www.momoshop.com.tw',
  Referer: 'https://www.momoshop.com.tw/',
});

function buildApiPayload(query) {
  return {
    host: 'momoshop',
    flag: 'searchEngine',
    data: {
      specialGoodsType: '',
      isBrandSeriesPage: 'false',
      searchValue: query,
      cateLevel: '-1',
      cp: 'N',
      NAM: 'N',
      first: 'N',
      freeze: 'N',
      superstore: 'N',
      tvshop: 'N',
      china: 'N',
      tomorrow: 'N',
      stockYN: 'N',
      prefere: 'N',
      threeHours: 'N',
      video: 'N',
      cycle: 'N',
      cod: 'N',
      superstorePay: 'N',
      showType: 'chessboardType',
      curPage: '1',
      priceS: '0',
      priceE: '9999999',
      searchType: '1',
      reduceKeyword: '',
      isFuzzy: '0',
      flag: 2018,
      serviceCode: 'MT01',
      adSource: 'tenmax',
    },
  };
}

const SOLD_OUT_PATTERN =
  /熱銷一空|已賣完|已售完|售完|缺貨中|補貨中|暫時缺貨|sold\s*out/i;

function collectProductText(product) {
  const icons = (product.icon || [])
    .map(
      (icon) =>
        `${icon.iconContent || ''}${icon.iconType || ''}${icon.iconContentType || ''}`
    )
    .join(' ');

  return [
    product.goodsName,
    product.goodsSubName,
    product.goodsPrice,
    product.goodsPriceOri,
    product.goodsStatus,
    product.onSaleDescription,
    product.goodsPriceModel?.basePrice?.goodsStatus,
    product.goodsPriceModel?.marketPrice?.goodsStatus,
    icons,
  ]
    .filter(Boolean)
    .join(' ');
}

function getMomoSalePrice(product) {
  return parsePrice(
    product.goodsPriceModel?.basePrice?.price ||
      product.goodsPrice ||
      product.offers?.price ||
      product.price
  );
}

function getMomoMarketPrice(product) {
  return parsePrice(
    product.marketPriceModel?.basePrice?.price ||
      product.goodsPriceModel?.marketPrice?.price ||
      product.goodsPriceOri
  );
}

function isMomoSoldOut(product) {
  const blob = collectProductText(product);
  if (SOLD_OUT_PATTERN.test(blob)) {
    return true;
  }

  const stock = product.goodsStock;
  if (stock !== undefined && stock !== null && stock !== '') {
    const stockNum = Number(String(stock).replace(/,/g, ''));
    if (!Number.isNaN(stockNum) && stockNum <= 0) {
      return true;
    }
  }

  return getMomoSalePrice(product) <= 0;
}

function isMomoAvailable(product) {
  return !isMomoSoldOut(product);
}

function isMomoShoppingProduct(product) {
  const url = String(
    product.url || product.goodsUrl || product.ecUrl || ''
  ).toLowerCase();

  if (/entp|mo店|momo商店|\/store\//i.test(url)) {
    return false;
  }

  if (product.setGoodsYn && product.setGoodsYn !== '0') {
    return false;
  }

  const icons = product.icon || [];
  if (
    icons.some((icon) =>
      /店\+|mo店|momo商店/i.test(String(icon.iconContent || ''))
    )
  ) {
    return false;
  }

  if (url && !url.includes('momoshop.com.tw/goods/') && !product.goodsCode) {
    return false;
  }

  return true;
}

function hasMomoCoupon(product) {
  const icons = product.icon || [];
  if (
    icons.some(
      (icon) =>
        icon.iconContentType === 'isCp' ||
        /折價券|coupon/i.test(String(icon.iconContent || icon.iconType || ''))
    )
  ) {
    return true;
  }

  return /折價券/.test(collectProductText(product));
}

function detectMomoRegisterType(product) {
  for (const icon of product.icon || []) {
    if (icon.iconContentType !== 'isRegister') {
      continue;
    }

    const text = String(icon.iconContent || '');
    if (/登記抽|登记抽/.test(text) || (/登記/.test(text) && /抽/.test(text))) {
      return '登記抽';
    }
    if (/登記送|登记送/.test(text) || (/登記/.test(text) && /送/.test(text))) {
      return '登記送';
    }
  }

  const blob = collectProductText(product);
  if (/登記抽/.test(blob)) {
    return '登記抽';
  }
  if (/登記送/.test(blob)) {
    return '登記送';
  }

  if (
    (product.icon || []).some((icon) => icon.iconContentType === 'isRegister')
  ) {
    return '登記送';
  }

  return null;
}

function hasMomoGift(product) {
  const icons = product.icon || [];
  if (
    icons.some(
      (icon) =>
        icon.iconContentType === 'isGift' ||
        /贈品|gift/i.test(String(icon.iconContent || icon.iconType || ''))
    )
  ) {
    return true;
  }

  return /贈品/.test(collectProductText(product));
}

function hasMomoPriceReduction(product) {
  const salePrice = getMomoSalePrice(product);
  const marketPrice = getMomoMarketPrice(product);
  return marketPrice > salePrice && marketPrice > 0 && salePrice > 0;
}

function buildMomoDeal(product) {
  const registerType = detectMomoRegisterType(product);

  if (hasMomoCoupon(product)) {
    return '可用折價券';
  }

  if (registerType === '登記送') {
    return '登記送';
  }

  if (registerType === '登記抽') {
    return '登記抽';
  }

  if (hasMomoGift(product)) {
    return '贈品';
  }

  if (hasMomoPriceReduction(product)) {
    return '售價已折';
  }

  return '到momo購物網查看';
}

function isMomoFastDelivery(product) {
  if (
    product.isSpeedArrive === true ||
    String(product.isSpeedArrive || '').toLowerCase() === 'true' ||
    String(product.isSpeedArrive || '') === '1'
  ) {
    return true;
  }

  const shopWay = String(product.shopWay || '');
  if (shopWay.split('##').includes('1')) {
    return true;
  }

  const icons = product.icon || [];
  if (
    icons.some((icon) =>
      /快速到貨|速達|3小時|三小時|隔日/i.test(
        String(icon.iconContent || icon.iconType || '')
      )
    )
  ) {
    return true;
  }

  const fastFlags = [
    product.threeHoursYn,
    product.threeHourYn,
    product.isThreeHours,
    product.fastDeliveryYn,
    product.tomorrowYn,
  ];
  if (fastFlags.some((flag) => String(flag || '').toUpperCase() === 'Y')) {
    return true;
  }

  const tagBlob = JSON.stringify(product.goodsTag || product.tagInfo || []);
  return /快速到貨|速達|3小時|三小時/i.test(tagBlob);
}

function buildProductUrl(product, query) {
  const goodsCode = product.goodsCode || '';
  return (
    product.url ||
    product.goodsUrl ||
    (goodsCode
      ? `${PRODUCT_BASE}${goodsCode}&Area=search&mdiv=403&kw=${encodeURIComponent(query)}`
      : '')
  );
}

function normalizeGoodsInfo(product, index, query) {
  const title = (product.goodsName || product.name || '').trim();
  const price = getMomoSalePrice(product);
  const url = buildProductUrl(product, query);
  const matchText = collectProductText(product);

  return {
    title,
    matchText,
    price,
    url,
    image: product.imgUrl || product.image || '',
    deal: buildMomoDeal(product),
    fastDelivery: Boolean(isMomoFastDelivery(product)),
    points: 'mo幣回饋依活動',
    score: buildScore(price, index, 88),
  };
}

function filterMomoProducts(products) {
  return products.filter(
    (product) => isMomoShoppingProduct(product) && isMomoAvailable(product)
  );
}

function parseJsonArrayAt(html, startIndex) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startIndex; i < html.length; i += 1) {
    const char = html[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '[') {
      depth += 1;
    } else if (char === ']') {
      depth -= 1;
      if (depth === 0) {
        const raw = html.slice(startIndex, i + 1);
        try {
          return JSON.parse(raw);
        } catch {
          try {
            return JSON.parse(raw.replace(/\\"/g, '"'));
          } catch {
            return [];
          }
        }
      }
    }
  }

  return [];
}

function extractGoodsInfoList(html) {
  const markers = ['\\"goodsInfoList\\":[', '"goodsInfoList":['];

  for (const marker of markers) {
    const start = html.indexOf(marker);
    if (start < 0) {
      continue;
    }

    const list = parseJsonArrayAt(html, start + marker.length - 1);
    if (Array.isArray(list) && list.length) {
      return list;
    }
  }

  return [];
}

async function searchMomoApi(query, limit) {
  const response = await client.post(API_URL, buildApiPayload(query), {
    headers: { 'Content-Type': 'application/json' },
    validateStatus: () => true,
  });

  if (response.status >= 400 || typeof response.data !== 'object') {
    throw new Error(`momo API 回應 ${response.status}`);
  }

  const products = filterMomoProducts(
    response.data?.rtnSearchData?.goodsInfoList || []
  );

  if (!products.length) {
    throw new Error('momo API 無商品結果');
  }

  return products.slice(0, limit).map((product, index) =>
    normalizeGoodsInfo(product, index, query)
  );
}

function jsonLdToProduct(item) {
  return {
    goodsName: item.name,
    goodsCode: String(item.url || '').match(/i_code=(\d+)/)?.[1] || '',
    goodsUrl: item.url,
    goodsPrice: item.offers?.price,
    imgUrl: item.image,
    setGoodsYn: '0',
    icon: [],
  };
}

function extractJsonLdProducts(html) {
  const itemList = extractJsonLd(html, 'ItemList');
  return (itemList?.itemListElement || [])
    .map((entry) => entry.item || entry)
    .filter((item) => item && item['@type'] === 'Product')
    .map(jsonLdToProduct)
    .filter((product) => product.goodsCode);
}

function mergeMomoProducts(primary, extra) {
  const map = new Map();
  for (const product of [...primary, ...extra]) {
    const key = String(product.goodsCode || product.goodsUrl || product.goodsName);
    if (!key || map.has(key)) {
      continue;
    }
    map.set(key, product);
  }
  return [...map.values()];
}

async function fetchMomoSearchHtml(query, page = 1) {
  const response = await client.get(`${SEARCH_URL}/${encodeURIComponent(query)}`, {
    params: page > 1 ? { curPage: String(page) } : {},
  });
  return String(response.data || '');
}

function maxPageFromHtml(html) {
  const match = String(html).match(/maxPage\\?":\s*(\\?")?(\d+)/);
  return Number(match?.[2] || 1);
}

async function searchMomoHtml(query, limit) {
  const firstHtml = await fetchMomoSearchHtml(query, 1);
  let products = mergeMomoProducts(
    extractGoodsInfoList(firstHtml),
    extractJsonLdProducts(firstHtml)
  );

  const maxPage = Math.min(maxPageFromHtml(firstHtml), 3);
  for (let page = 2; page <= maxPage && products.length < limit; page += 1) {
    try {
      const html = await fetchMomoSearchHtml(query, page);
      products = mergeMomoProducts(products, [
        ...extractGoodsInfoList(html),
        ...extractJsonLdProducts(html),
      ]);
    } catch {
      break;
    }
  }

  const available = filterMomoProducts(products);
  if (!available.length) {
    throw new Error('無法解析 momo 搜尋結果');
  }

  return available.slice(0, limit).map((product, index) =>
    normalizeGoodsInfo(product, index, query)
  );
}

async function searchMomo(query, limit = DEFAULT_LIMIT) {
  let htmlResults = [];
  let apiResults = [];

  try {
    htmlResults = await searchMomoHtml(query, limit);
  } catch {
    // fall through to API
  }

  try {
    apiResults = await searchMomoApi(query, limit);
  } catch {
    // ignore API failure when HTML succeeded
  }

  const best =
    htmlResults.length >= apiResults.length ? htmlResults : apiResults;

  if (!best.length) {
    throw new Error('無法取得 momo 搜尋結果');
  }

  return best;
}

module.exports = { searchMomo };
