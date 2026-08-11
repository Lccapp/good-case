const { createClient, parsePrice, buildScore, extractJsonLd } = require('./helpers');

const SEARCH_URL = 'https://www.momoshop.com.tw/search';
const API_URL = 'https://apisearch.momoshop.com.tw/momoSearchCloud/moec/textSearch';
const PRODUCT_BASE =
  'https://www.momoshop.com.tw/goods/GoodsDetail.jsp?i_code=';

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

const SOLD_OUT_PATTERN = /熱銷一空|已售完|售完|缺貨中|補貨中|暫時缺貨|sold\s*out/i;

function isMomoSoldOut(product) {
  const stock = product.goodsStock;
  if (stock !== undefined && stock !== null && stock !== '') {
    const stockNum = Number(String(stock).replace(/,/g, ''));
    if (!Number.isNaN(stockNum) && stockNum <= 0) {
      return true;
    }
  }

  const statusFields = [
    product.goodsPriceModel?.basePrice?.goodsStatus,
    product.goodsPriceModel?.marketPrice?.goodsStatus,
    product.goodsStatus,
  ];
  if (statusFields.some((status) => SOLD_OUT_PATTERN.test(String(status || '')))) {
    return true;
  }

  const textFields = [product.goodsPrice, product.goodsSubName, product.goodsName];
  if (textFields.some((text) => SOLD_OUT_PATTERN.test(String(text || '')))) {
    return true;
  }

  const icons = product.icon || [];
  if (
    icons.some((icon) =>
      SOLD_OUT_PATTERN.test(String(icon.iconContent || icon.iconType || ''))
    )
  ) {
    return true;
  }

  return false;
}

function isMomoAvailable(product) {
  return !isMomoSoldOut(product);
}

function isMomoShoppingProduct(product) {
  const url = String(product.url || product.ecUrl || '').toLowerCase();
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

  if (url && !url.includes('momoshop.com.tw/goods/')) {
    return false;
  }

  return true;
}

function buildMomoDeal(product) {
  const promo = (product.goodsSubName || product.description || '').trim();
  return promo || '—';
}

function isMomoFastDelivery(product) {
  if (
    product.isSpeedArrive === true ||
    String(product.isSpeedArrive || '').toLowerCase() === 'true'
  ) {
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

function normalizeGoodsInfo(product, index, query) {
  const title = (product.goodsName || product.name || '').trim();
  const goodsCode = product.goodsCode || '';
  const price = parsePrice(
    product.goodsPriceModel?.basePrice?.price ||
      product.goodsPrice ||
      product.offers?.price ||
      product.price
  );

  const url =
    product.url ||
    (goodsCode
      ? `${PRODUCT_BASE}${goodsCode}&Area=search&mdiv=403&kw=${encodeURIComponent(query)}`
      : '');

  return {
    title,
    price,
    url,
    image: product.imgUrl || product.image || '',
    deal: buildMomoDeal(product),
    fastDelivery: isMomoFastDelivery(product),
    points: 'mo幣回饋依活動',
    score: buildScore(price, index, 88),
  };
}

function extractGoodsInfoList(html) {
  const marker = '\\"goodsInfoList\\":[';
  const start = html.indexOf(marker);
  if (start < 0) {
    return [];
  }

  const arrayStart = start + marker.length - 1;
  let depth = 0;

  for (let i = arrayStart; i < html.length; i += 1) {
    const char = html[i];
    if (char === '[') depth += 1;
    if (char === ']') {
      depth -= 1;
      if (depth === 0) {
        const raw = html.slice(arrayStart, i + 1);
        try {
          return JSON.parse(raw.replace(/\\"/g, '"'));
        } catch {
          return [];
        }
      }
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

  const products = (response.data?.rtnSearchData?.goodsInfoList || []).filter(
    (product) => isMomoShoppingProduct(product) && isMomoAvailable(product)
  );

  if (!products.length) {
    throw new Error('momo API 無商品結果');
  }

  return products.slice(0, limit).map((product, index) =>
    normalizeGoodsInfo(product, index, query)
  );
}

async function searchMomoHtml(query, limit) {
  const response = await client.get(`${SEARCH_URL}/${encodeURIComponent(query)}`);
  const html = response.data;

  const goodsList = extractGoodsInfoList(html).filter(
    (product) => isMomoShoppingProduct(product) && isMomoAvailable(product)
  );
  if (goodsList.length) {
    return goodsList.slice(0, limit).map((product, index) =>
      normalizeGoodsInfo(product, index, query)
    );
  }

  const itemList = extractJsonLd(html, 'ItemList');
  const products = (itemList?.itemListElement || [])
    .map((entry) => entry.item || entry)
    .filter(
      (item) =>
        item &&
        item['@type'] === 'Product' &&
        isMomoShoppingProduct({
          url: item.url,
          name: item.name,
          setGoodsYn: '0',
        }) &&
        isMomoAvailable({
          url: item.url,
          name: item.name,
          goodsPrice: item.offers?.price,
        }) &&
        String(item.url || '').includes('mdiv=403')
    );

  if (!products.length) {
    throw new Error('無法解析 momo 搜尋結果');
  }

  return products.slice(0, limit).map((product, index) =>
    normalizeGoodsInfo(product, index, query)
  );
}

async function searchMomo(query, limit = 12) {
  try {
    const htmlResults = await searchMomoHtml(query, limit);
    if (htmlResults.length) {
      return htmlResults;
    }
  } catch {
    // fall through to API
  }

  return searchMomoApi(query, limit);
}

module.exports = { searchMomo };
