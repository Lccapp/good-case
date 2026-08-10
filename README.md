# 選好價 — 跨通路商品比價

線上版：https://lccapp.github.io/good-case/

前端（GitHub Pages）+ Node.js Express 後端（雲端部署），PChome 即時搜尋 + 其他通路 Mock 示範資料。

## 架構

```
GitHub Pages (靜態前端)          雲端後端 (Render 等)
https://lccapp.github.io/   →    https://your-api.onrender.com
     index.html                      /api/products
     config.js  ← 設定 API 網址
```

> GitHub Pages **無法執行** Node.js，後端需另外部署到 Render、Railway 等平台。

## 本地開發

```bash
cd backend
npm install
npm start
```

瀏覽器開啟：http://localhost:3000/index.html

本地開發時 `config.js` 的 `API_URL` 可留空，會自動連 `http://localhost:3000`。

## 部署到 GitHub Pages + Render

### 步驟 1：部署後端到 Render（免費）

1. 將此專案 push 到 GitHub（例如 `Lccapp/good-case`）
2. 前往 [Render](https://render.com) → New → Blueprint
3. 連接 repo，Render 會讀取根目錄的 `render.yaml`
4. 部署完成後取得 API 網址，例如：`https://good-case-api.onrender.com`

### 步驟 2：設定前端 API 網址

編輯 `config.js`：

```javascript
window.API_URL = 'https://good-case-api.onrender.com';
```

### 步驟 3：Push 到 GitHub

將以下檔案 push 到 `Lccapp/good-case` 的 `main` 分支：

- `index.html`（GitHub Pages 入口）
- `config.js`
- `*-logo.png`
- `backend/`（給 Render 用）
- `render.yaml`

GitHub Pages 會自動更新：https://lccapp.github.io/good-case/

## 專案結構

```
price-compare/
├── index.html              # GitHub Pages 入口
├── config.js               # 雲端 API 網址設定
├── price-comparison.html   # 本地開發用（同 index.html）
├── backend/
│   ├── server.js
│   └── services/
│       ├── pchome.js
│       └── mock.js
└── render.yaml             # Render 一鍵部署
```

## API

| 端點 | 說明 |
|------|------|
| `GET /api/products?q=關鍵字` | 比價搜尋 |
| `GET /api/health` | 健康檢查 |

## 注意事項

- PChome 資料來自公開搜尋 API，僅供開發與 POC；正式營運請申請官方合作。
- Render 免費方案冷啟動可能需要 30–60 秒，首次搜尋可能較慢。
