const MOCK_CHANNELS = [
  {
    id: 'momo',
    name: 'momo 購物網',
    sub: 'momo',
    items: [
      {
        title: 'Apple AirPods Pro 第 2 代 USB‑C 充電盒',
        price: 6990,
        deal: '限時折 $300・可分 6 期 0 利率',
        points: 'mo幣回饋 3%',
        score: 88,
      },
      {
        title: 'Apple AirPods Pro 第 2 代 MagSafe 充電盒',
        price: 7190,
        deal: '領券再折 $200',
        points: '刷指定卡回饋 5%',
        score: 84,
      },
      {
        title: 'AirPods Pro 第 2 代 USB‑C 版（公司貨）',
        price: 7350,
        deal: '加贈矽膠保護套',
        points: 'mo幣回饋 1%',
        score: 81,
      },
    ],
  },
  {
    id: 'coupang',
    name: '酷澎購物網',
    sub: 'Coupang',
    items: [
      {
        title: 'Apple AirPods Pro 第 2 代 USB‑C 充電盒',
        price: 6799,
        deal: 'WOW 會員價・免運',
        points: '新戶再享 $100 折扣',
        score: 94,
      },
      {
        title: 'AirPods Pro 第 2 代 USB‑C 版（台灣公司貨）',
        price: 6999,
        deal: '購物金可折抵',
        points: 'WOW 會員免運',
        score: 87,
      },
    ],
  },
  {
    id: 'yahoo',
    name: 'Yahoo 購物中心',
    sub: 'Yahoo 購物中心',
    items: [
      {
        title: 'Apple AirPods Pro 第 2 代 USB‑C 充電盒',
        price: 6850,
        deal: '折價券 $150・快速到貨',
        points: '購物金回饋 2%',
        score: 90,
      },
      {
        title: 'AirPods Pro 第 2 代 USB‑C 版（公司貨）',
        price: 7049,
        deal: '滿額送耳機收納包',
        points: '刷指定卡回饋 3%',
        score: 86,
      },
    ],
  },
  {
    id: 'amazon',
    name: 'amazon.co.jp',
    sub: 'Amazon Japan',
    items: [
      {
        title: 'Apple AirPods Pro（第 2 世代）USB‑C 充電ケース',
        price: 6580,
        deal: 'Prime 會員免運・日幣估算',
        points: 'JCB 卡優惠',
        score: 85,
      },
      {
        title: 'Apple AirPods Pro（第 2 世代）',
        price: 6820,
        deal: '限時閃購 8% OFF',
        points: 'Prime 點數 2%',
        score: 89,
      },
    ],
  },
];

const { parseKeywords, matchesKeywords } = require('./query');

function filterItems(items, query) {
  const keywords = parseKeywords(query);
  if (!keywords.length) return items;
  return items.filter((item) => matchesKeywords(item.title, keywords));
}

function getMockChannels(query) {
  const q = query.trim().toLowerCase();

  return MOCK_CHANNELS.map((channel) => ({
    ...channel,
    items: filterItems(channel.items, query),
  })).filter((channel) => !q || channel.items.length > 0);
}

function getMockPchomeChannel(query) {
  const keywords = parseKeywords(query);

  return {
    id: 'pchome',
    name: 'PChome 24h 購物',
    sub: 'PChome 24h',
    items: [
      {
        title: 'Apple AirPods Pro 第 2 代 USB‑C 充電盒',
        price: 6888,
        deal: '折價券 $112・24h 到貨',
        points: 'P幣回饋 2%',
        score: 91,
      },
      {
        title: 'Apple AirPods Pro 第 2 代 MagSafe 充電盒',
        price: 7090,
        deal: '限時滿額折 $300',
        points: '聯名卡回饋 4%',
        score: 86,
      },
      {
        title: 'AirPods Pro 第 2 代 USB‑C 版（原廠保固）',
        price: 7288,
        deal: '贈抗菌清潔組',
        points: 'P幣回饋 1%',
        score: 83,
      },
    ].filter((item) => matchesKeywords(item.title, keywords)),
  };
}

module.exports = { getMockChannels, getMockPchomeChannel };
