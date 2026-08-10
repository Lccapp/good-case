const path = require('path');
const express = require('express');
const cors = require('cors');
const { searchPChome } = require('./services/pchome');
const { searchMomo } = require('./services/momo');
const { searchYahoo } = require('./services/yahoo');
const { searchCoupang } = require('./services/coupang');
const { searchAmazon } = require('./services/amazon');
const {
  getMockPchomeChannel,
  getMockChannelById,
} = require('./services/mock');
const { parseKeywords, matchesKeywords } = require('./services/query');

const app = express();
const PORT = process.env.PORT || 3000;

const CHANNELS = [
  {
    id: 'pchome',
    name: 'PChome 24h 購物',
    sub: 'PChome 24h',
    search: searchPChome,
    getMock: getMockPchomeChannel,
  },
  {
    id: 'momo',
    name: 'momo 購物網',
    sub: 'momo',
    search: searchMomo,
    getMock: (query) => getMockChannelById('momo', query),
  },
  {
    id: 'coupang',
    name: '酷澎購物網',
    sub: 'Coupang',
    search: searchCoupang,
    getMock: (query) => getMockChannelById('coupang', query),
  },
  {
    id: 'yahoo',
    name: 'Yahoo 購物中心',
    sub: 'Yahoo 購物中心',
    search: searchYahoo,
    getMock: (query) => getMockChannelById('yahoo', query),
  },
  {
    id: 'amazon',
    name: 'amazon.co.jp',
    sub: 'Amazon Japan',
    search: searchAmazon,
    getMock: (query) => getMockChannelById('amazon', query),
  },
];

const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    const allowed =
      /^https:\/\/([a-z0-9-]+\.)?github\.io$/i.test(origin) ||
      /^http:\/\/localhost(:\d+)?$/i.test(origin) ||
      /^http:\/\/127\.0\.0\.1(:\d+)?$/i.test(origin);
    callback(null, allowed);
  },
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'price-compare-backend' });
});

async function loadChannel(channel, query, keywords) {
  let source = 'live';
  let error = null;
  let items = [];

  try {
    items = (await channel.search(query)).filter((item) =>
      matchesKeywords(item.title, keywords)
    );
  } catch (err) {
    source = 'mock';
    error = err.message;
    items = (channel.getMock(query)?.items || []).filter((item) =>
      matchesKeywords(item.title, keywords)
    );
  }

  return {
    channel: {
      id: channel.id,
      name: channel.name,
      sub: channel.sub,
      items,
      source,
    },
    meta: {
      live: source === 'live',
      error,
      itemCount: items.length,
    },
  };
}

app.get('/api/products', async (req, res) => {
  const query = String(req.query.q || '').trim();

  if (!query) {
    return res.status(400).json({ error: '請提供 q 搜尋關鍵字' });
  }

  const keywords = parseKeywords(query);
  const results = await Promise.all(
    CHANNELS.map((channel) => loadChannel(channel, query, keywords))
  );

  const channels = results
    .map((result) => result.channel)
    .filter((channel) => channel.items.length > 0);

  const liveStatus = Object.fromEntries(
    results.map((result) => [
      result.channel.id,
      {
        live: result.meta.live,
        error: result.meta.error,
        itemCount: result.meta.itemCount,
      },
    ])
  );

  res.json({
    query,
    channels,
    meta: {
      keywords,
      liveStatus,
      totalItems: channels.reduce((sum, channel) => sum + channel.items.length, 0),
      liveChannels: results.filter((result) => result.meta.live).map((result) => result.channel.id),
      // 保留舊欄位，避免前端尚未更新時出錯
      pchomeLive: liveStatus.pchome?.live ?? false,
      pchomeError: liveStatus.pchome?.error ?? null,
    },
  });
});

app.listen(PORT, () => {
  console.log(`選好價後端已啟動：http://localhost:${PORT}`);
  console.log(`前端頁面：http://localhost:${PORT}/price-comparison.html`);
});
