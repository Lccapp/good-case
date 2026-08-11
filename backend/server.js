const path = require('path');
const express = require('express');
const cors = require('cors');
const { searchPChome } = require('./services/pchome');
const { searchMomo } = require('./services/momo');
const { searchYahoo } = require('./services/yahoo');
const { searchCoupang } = require('./services/coupang');
const { searchAmazon } = require('./services/amazon');
const { parseKeywords, matchesKeywords } = require('./services/query');

const app = express();
const PORT = process.env.PORT || 3000;

const CHANNELS = [
  {
    id: 'momo',
    name: 'momo 購物網',
    sub: 'momo',
    search: searchMomo,
  },
  {
    id: 'coupang',
    name: '酷澎購物網',
    sub: 'Coupang',
    search: searchCoupang,
  },
  {
    id: 'pchome',
    name: 'PChome 24h 購物',
    sub: 'PChome 24h',
    search: searchPChome,
  },
  {
    id: 'yahoo',
    name: 'Yahoo 購物中心',
    sub: 'Yahoo 購物中心',
    search: searchYahoo,
  },
  {
    id: 'amazon',
    name: 'amazon.co.jp',
    sub: 'Amazon Japan',
    search: searchAmazon,
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
  try {
    const items = (await channel.search(query)).filter((item) =>
      matchesKeywords(item.title, keywords)
    );

    if (!items.length) {
      return {
        channel: null,
        meta: {
          live: false,
          error: '無符合條件的商品',
          itemCount: 0,
        },
      };
    }

    return {
      channel: {
        id: channel.id,
        name: channel.name,
        sub: channel.sub,
        items,
        source: 'live',
      },
      meta: {
        live: true,
        error: null,
        itemCount: items.length,
      },
    };
  } catch (err) {
    return {
      channel: null,
      meta: {
        live: false,
        error: err.message,
        itemCount: 0,
      },
    };
  }
}

app.get('/api/products', async (req, res) => {
  const query = String(req.query.q || '').trim();

  if (!query) {
    return res.status(400).json({ error: '請提供 q 搜尋關鍵字' });
  }

  try {
    const keywords = parseKeywords(query);
    const results = await Promise.all(
      CHANNELS.map((channel) => loadChannel(channel, query, keywords))
    );

    const successful = results.filter((result) => result.channel);
    const channels = successful.map((result) => result.channel);

    const liveStatus = Object.fromEntries(
      results.map((result, index) => [
        CHANNELS[index].id,
        {
          live: result.meta.live,
          error: result.meta.error,
          itemCount: result.meta.itemCount,
        },
      ])
    );

    const channelResults = CHANNELS.map((channel, index) => {
      const result = results[index];
      if (result.channel) {
        return { ...result.channel, state: 'ok' };
      }

      return {
        id: channel.id,
        name: channel.name,
        sub: channel.sub,
        items: [],
        state:
          result.meta.error === '無符合條件的商品' ? 'empty' : 'failed',
      };
    });

    res.json({
      query,
      channels,
      meta: {
        keywords,
        liveStatus,
        channelResults,
        totalItems: channels.reduce((sum, channel) => sum + channel.items.length, 0),
        liveChannels: successful.map((result) => result.channel.id),
        pchomeLive: liveStatus.pchome?.live ?? false,
        pchomeError: liveStatus.pchome?.error ?? null,
      },
    });
  } catch (err) {
    console.error('GET /api/products failed:', err);
    res.status(500).json({ error: '比價查詢失敗，請稍後再試' });
  }
});

app.listen(PORT, () => {
  console.log(`選好價後端已啟動：http://localhost:${PORT}`);
  console.log(`前端頁面：http://localhost:${PORT}/price-comparison.html`);
});
