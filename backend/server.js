const path = require('path');
const express = require('express');
const cors = require('cors');
const { searchPChome } = require('./services/pchome');
const { getMockChannels, getMockPchomeChannel } = require('./services/mock');
const { parseKeywords, matchesKeywords } = require('./services/query');

const app = express();
const PORT = process.env.PORT || 3000;

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

app.get('/api/products', async (req, res) => {
  const query = String(req.query.q || '').trim();

  if (!query) {
    return res.status(400).json({ error: '請提供 q 搜尋關鍵字' });
  }

  let pchomeChannel;
  let pchomeLive = false;
  let pchomeError = null;

  const keywords = parseKeywords(query);

  try {
    const items = (await searchPChome(query)).filter((item) =>
      matchesKeywords(item.title, keywords)
    );
    pchomeChannel = {
      id: 'pchome',
      name: 'PChome 24h 購物',
      sub: 'PChome 24h',
      items,
      source: 'live',
    };
    pchomeLive = true;
  } catch (error) {
    pchomeError = error.message;
    pchomeChannel = {
      ...getMockPchomeChannel(query),
      source: 'mock',
    };
  }

  const otherChannels = getMockChannels(query).map((channel) => ({
    ...channel,
    source: 'mock',
  }));

  const channels = [pchomeChannel, ...otherChannels].filter(
    (channel) => channel.items.length > 0
  );

  res.json({
    query,
    channels,
    meta: {
      pchomeLive,
      pchomeError,
      keywords,
      totalItems: channels.reduce((sum, channel) => sum + channel.items.length, 0),
    },
  });
});

app.listen(PORT, () => {
  console.log(`選好價後端已啟動：http://localhost:${PORT}`);
  console.log(`前端頁面：http://localhost:${PORT}/price-comparison.html`);
});
