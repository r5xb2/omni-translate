# OmniTranslate — 即時語音轉文字與翻譯

> 使用麥克風說話，自動透過 Groq / OpenAI API 轉成文字，並即時翻譯成中文。

---

## 功能特色

- 🎙️ **即時 VAD 偵測**：說話時自動開始錄音，靜默時自動送出
- 📝 **語音轉文字**：使用 Groq Whisper 或 OpenAI Whisper
- 🌐 **自動翻譯**：英文 → 中文（可關閉，僅轉文字模式）
- 📋 **複製全部**：一鍵複製所有對話記錄
- ⚙️ **可自訂**：靜默閾值、最長錄音、LLM 模型、滾動上下文

---

## 系統需求

| 項目 | 需求 |
|------|------|
| Node.js | **20 或以上** |
| npm | 10 或以上（隨 Node.js 附帶） |
| 瀏覽器 | Chrome / Edge（需支援 `SharedArrayBuffer`） |
| API Key | [Groq](https://console.groq.com/) 或 [OpenAI](https://platform.openai.com/) 其一 |

---

## 安裝步驟

### 1. 取得原始碼

```bash
git clone https://github.com/r5xb2/omni-translate.git
cd omni-translate
```

或直接下載 ZIP 解壓縮。

### 2. 安裝相依套件

```bash
npm install
```

> 首次安裝約需 1～2 分鐘，會下載 node_modules（約 300MB）。

---

## 執行方式

### 開發模式（本機使用）

```bash
npm run dev
```

瀏覽器開啟 **http://localhost:5173**

> 視窗保持開著，關掉終端機視窗即停止服務。

### 停止服務

在終端機按 `Ctrl + C`

---

## 首次使用設定

1. 開啟 http://localhost:5173
2. 點右上角 **⚙ 齒輪圖示** 開啟設定
3. 填入 **API Key**（Groq 或 OpenAI）
4. 點「儲存」
5. 點「▶ 開始錄音」

> API Key 只存在你的瀏覽器 LocalStorage，不會上傳到任何伺服器。

---

## 取得 API Key

### Groq（免費，推薦）
1. 前往 https://console.groq.com/
2. 註冊 / 登入
3. 左側選單 → **API Keys** → **Create API Key**
4. 複製金鑰（`gsk_` 開頭）

### OpenAI
1. 前往 https://platform.openai.com/api-keys
2. 點 **+ Create new secret key**
3. 複製金鑰（`sk-` 開頭）

---

## 設定說明

| 設定項目 | 說明 | 預設值 |
|---------|------|--------|
| API 提供商 | Groq 或 OpenAI | Groq |
| 靜默閾值 | 停頓幾毫秒後送出（ms） | 500 |
| 最長錄音 | 單段最長錄音時間（ms） | 20000 |
| 啟用翻譯 | 關閉則僅轉文字（低延遲模式） | 開啟 |
| 滾動上下文 | 翻譯時參考的前幾句話 | 3 |
| STT 模型 | 語音辨識模型 | whisper-large-v3-turbo |
| LLM 模型 | 翻譯模型 | llama-3.3-70b-versatile |

---

## 常見問題

### Q: 麥克風沒有反應？
- 確認瀏覽器已允許麥克風權限
- 確認使用 Chrome 或 Edge（Firefox 不支援 `SharedArrayBuffer`）
- 確認頁面是 `http://localhost:5173`（不是從檔案直接開啟）

### Q: 出現「API Key 無效」？
- 確認 Key 完整複製（Groq 為 `gsk_` 開頭，OpenAI 為 `sk-` 開頭）
- 確認選擇正確的提供商（Groq Key 不能用在 OpenAI 選項）

### Q: 翻譯很慢？
- 開啟設定 → 關閉「啟用翻譯」→ 切換為僅轉文字模式（速度最快）
- 或換用 Groq（比 OpenAI 免費版快）

### Q: 在另一台電腦使用？
1. 安裝 Node.js 20+
2. 複製整個專案資料夾（或 `git clone`）
3. 執行 `npm install`
4. 執行 `npm run dev`
5. 重新在設定中輸入 API Key（Key 不會跟著專案複製）

---

## 技術架構

```
瀏覽器
├── React 18 + TypeScript
├── Zustand（狀態管理）
├── @ricky0123/vad-web（Silero VAD，Audio Worklet）
└── Vite 5（開發伺服器，含 COOP/COEP headers）

API（雲端）
├── Groq Whisper — 語音轉文字
└── Groq / OpenAI LLM — 翻譯
```

---

## 開發指令

```bash
npm run dev          # 啟動開發伺服器
npm run build        # 建構正式版本
npm test             # 執行單元測試（19 個）
npm run test:watch   # 監看模式測試
```

---

## 授權

本專案為個人私用工具。
