# OmniTranslate-GROQ 軟體設計文件（SDD）

## 文件資訊

| 項目 | 內容 |
|------|------|
| 文件版本 | 1.2 |
| 建立日期 | 2026-05-15 |
| 對應 PRD 版本 | 1.0 |
| 文件狀態 | 草稿 |
| 變更摘要 | Phase 3 效能優化：多提供商支援、音訊佇列、時間戳修正、翻譯開關、零遺失保證 |

---

## 1. 簡介

### 1.1 文件目的

本文件詳細描述 OmniTranslate-GROQ 的系統架構、組件設計、資料模型與開發路徑，作為開發團隊的技術準則。

### 1.2 與 SDD v1.0 差異摘要

| 章節 | 變更類型 | 說明 |
|------|----------|------|
| §2.1 技術選型 | 更新 | 新增 Silero VAD 函式庫；明確 Web Crypto API 取代 CryptoJS |
| §2.2 架構圖 | 重寫 | 釐清 API Key 不經後端；新增核心序列圖 |
| §3.2 資料模型 | 補充 | 新增 `ExportSession`；`AppConfig` 補充強制切分欄位 |
| §4.2 AudioEngine | 重寫 | 移除已棄用 `ScriptProcessorNode`，改用 `AudioWorkletNode` + Silero VAD |
| §4.3 GroqService | 更新 | 統一模型名稱；加入 Rate Limit 佇列設計 |
| §4.4 ContextManager | 補充 | 新增完整 ICT System Prompt 範本與 Prompt 組裝邏輯 |
| §4.5 ExportService | 新增 | 補充 Markdown 導出模組設計 |
| §6.1 安全設計 | 修正 | 採用 PBKDF2 + AES-GCM（Web Crypto API），移除不可靠的瀏覽器指紋方案 |

### 1.2.2 SDD v1.2 新增（Phase 3）

| 章節 | 變更類型 | 說明 |
|------|----------|------|
| §2.1 技術選型 | 更新 | 新增 OpenAI 作為第二提供商（相容 `/v1` 介面） |
| §2.2 架構圖 | 更新 | 反映雙提供商路由 + 音訊佇列層 |
| §3.2 資料模型 | 重寫 | `Message` 新增 `capturedEndAt`；`AppConfig` 新增 `provider`、`openaiKeyEncoded`、`enableTranslation` |
| §4.2 AudioEngine | 更新 | 回呼改為 `onSpeechEnd(blob, speechStartedAt, speechEndedAt)`；`speechStartedAt` 在 `onSpeechStart` 記錄 |
| §4.3 GroqService | 更新 | `withRetry` 擴大至 RateLimit + GroqServerError + 網路 TypeError；所有方法加入 `apiBase` 參數 |
| §4.6 useAudio（新增） | 新增 | 音訊 Blob 作業佇列；`pendingCount` 可觀測性計數器；翻譯開關邏輯 |
| §5.2 零遺失保證 | 新增 | 詳細說明防遺失機制與驗證方式 |

### 1.3 術語與縮寫

| 術語 | 定義 |
|------|------|
| GROQ LPU | Language Processing Unit，專為 LLM 加速設計的硬體 |
| VAD | Voice Activity Detection，語音活動偵測技術 |
| Silero VAD | 基於 ONNX Runtime 的神經網路 VAD，精準度優於純音量閾值法 |
| Rolling Context | 滾動上下文，僅保留最近 N 條對話作為 LLM 翻譯參考 |
| AES-GCM | Advanced Encryption Standard - Galois/Counter Mode，對稱加密演算法 |
| PBKDF2 | Password-Based Key Derivation Function 2，金鑰派生函式 |

---

## 2. 技術架構

### 2.1 技術選型總覽

| 層級 | 技術選擇 | 版本 | 選用理由 |
|------|----------|------|----------|
| 程式語言 | TypeScript | 5.x | 強型別確保大型應用穩定性 |
| 前端框架 | React | 18.2 | 成熟組件化架構 |
| 狀態管理 | Zustand | 4.x | 輕量化，搭配 `subscribeWithSelector` 防止不必要 re-render |
| UI 框架 | Tailwind CSS | 3.x | 快速建構 Dashboard 介面 |
| VAD | `@ricky0123/vad-web` | 最新穩定 | Silero VAD 神經網路，精準度遠優於純音量閾值法 |
| 音訊處理 | Web Audio API（`AudioWorkletNode`） | 瀏覽器標準 | 取代已棄用的 `ScriptProcessorNode` |
| 後端環境 | Node.js（Fastify） | 20.x | 僅處理 CORS，API Key 不在後端存留 |
| 加密 | Web Crypto API（PBKDF2 + AES-GCM） | 瀏覽器內建 | 取代不可靠的 CryptoJS + 瀏覽器指紋方案 |
| 構建工具 | Vite | 5.x | 高速開發伺服器與熱重載 |
| 測試 | Vitest + Playwright | 最新穩定 | 單元測試 + E2E 測試 |

### 2.2 系統架構

#### 架構決策：API Key 傳遞策略

**採用「前端直接呼叫 GROQ」模式，Node.js 僅處理 CORS Preflight。**

> 決策理由：若使用 Proxy 透傳 Key，Key 仍暴露於 HTTP Header，對攻擊者而言與前端直打無異，
> 卻多了後端日誌洩漏風險。直接從前端 fetch GROQ（HTTPS TLS 1.3）：
> - API Key 存在記憶體中，不落盤至後端
> - 符合 PRD §5.2「零服務器存儲」精神
> - DevTools Network Tab 仍可見 Key，但此為不可避免的客戶端限制

#### 系統架構圖

```
┌──────────────────────────────────────────────────────────────┐
│                      用戶端瀏覽器 (Frontend)                   │
│                                                              │
│  ┌──────────────────┐    ┌────────────────────────────────┐  │
│  │  UI Components   │    │       Core Engine (Logic)      │  │
│  │                  │    │                                │  │
│  │  Dashboard       │◄───┤  AudioEngine (AudioWorklet)    │  │
│  │  TranslationTable│    │  + Silero VAD                  │  │
│  │  ControlBar      │    │                                │  │
│  │  SettingModal    │◄───┤  ContextManager (Rolling N=5)  │  │
│  │  ErrorBanner     │    │                                │  │
│  │                  │◄───┤  GroqService (fetch 直打)      │  │
│  └──────────────────┘    │                                │  │
│                          │  ConfigStore (Zustand)          │  │
│                          │  AppStore    (Zustand)          │  │
│                          └──────────────┬─────────────────┘  │
└─────────────────────────────────────────┼────────────────────┘
                                          │ HTTPS / TLS 1.3
                          ┌───────────────┼───────────────┐
                          │               │               │
                          ▼               ▼               ▼
                   api.groq.com    api.groq.com    Node.js Backend
                   /audio/         /chat/           (CORS only)
                   transcriptions  completions
                   (Whisper)       (Llama-3)
```

#### 核心翻譯流程序列圖

```
用戶說話
  │
  ├─[Silero VAD onSpeechStart]
  │         └─ AudioEngine.speechStartedAt = Date.now()
  │                   └─ 啟動強制切分 timer（vadMaxDurationMs）
  │
  ├─[Silero VAD onSpeechEnd（靜音 ≥ redemptionMs）]
  │         └─ AudioEngine.onSpeechEnd(blob, speechStartedAt, speechEndedAt)
  │
  ├─[或達 vadMaxDurationMs 強制切分]
  │         └─ vad.pause().then(() => vad.start())
  │                   └─ submitUserSpeechOnPause=true 觸發 onSpeechEnd
  │
  ▼
useAudio.handleSpeechEnd(blob, speechStartedAt, speechEndedAt)
  │   └─ blobQueueRef.push({ blob, capturedAt, capturedEndAt })
  │   └─ addPending() [計數器+1]
  │   └─ 立即返回（麥克風繼續接收）
  │
  ▼
useAudio.processSingleBlob(blob, capturedAt, capturedEndAt)
  │
  ├─ AppStore.addMessage(status='transcribing', timestamp=capturedAt)
  │
  ├─ GroqService.transcribe(blob, apiKey, sttModel, apiBase)
  │       withRetry: RateLimit / ServerError / 網路錯誤 均重試
  │       └─ 成功: transcript
  │
  ├─ [enableTranslation = false]
  │   └─ updateMessage(status='completed', translatedText='')
  │
  ├─ [enableTranslation = true]
  │   └─ ContextManager.buildMessages(transcript, systemPrompt)
  │   └─ GroqService.translate(messages, apiKey, llmModel, apiBase)
  │   └─ updateMessage(status='completed', translatedText=translation)
  │
  └─ finally: removePending() [計數器-1，歸零代表無遺失]
  │
  ▼
UI TranslationTable 更新（自動捲至底部）
```

### 2.3 目錄結構

```
omni-translate-groq/
├── src/
│   ├── assets/                  # 靜態資源（圖示、圖片）
│   ├── components/
│   │   ├── shared/              # 通用組件（Button, Input, Badge）
│   │   └── dashboard/           # 會議主介面組件
│   │       ├── TranslationTable.tsx
│   │       ├── ControlBar.tsx
│   │       ├── SettingModal.tsx
│   │       └── ErrorBanner.tsx
│   ├── hooks/
│   │   ├── useAudio.ts          # 音訊佇列管理 Hook
│   │   └── useGroq.ts           # GROQ API 呼叫 Hook
│   ├── services/
│   │   ├── AudioEngine.ts       # 麥克風 + VAD 引擎
│   │   ├── GroqService.ts       # GROQ API 封裝（STT + LLM）
│   │   ├── ContextManager.ts    # Rolling Context 管理
│   │   ├── ExportService.ts     # Markdown / TXT 導出
│   │   └── CryptoService.ts     # API Key 加密 / 解密
│   ├── store/
│   │   ├── AppStore.ts          # 當前會議訊息列表
│   │   └── ConfigStore.ts       # API Key 與用戶偏好設定
│   ├── types/
│   │   └── index.ts             # 所有 TypeScript Interface 定義
│   └── utils/
│       ├── formatters.ts        # 時間格式化等工具函式
│       └── constants.ts         # 預設 Prompt、模型名稱常數
├── server/
│   ├── index.ts                 # Fastify 入口（CORS only）
│   └── routes/
│       └── health.ts            # /health endpoint
├── docs/
│   ├── SDD.md                   # 本文件
│   └── TEST_PLAN.md             # 完整驗證計畫
├── tests/
│   ├── unit/                    # Vitest 單元測試
│   └── e2e/                     # Playwright E2E 測試
├── .env.example
├── vite.config.ts
└── package.json
```

---

## 3. 資料設計

### 3.1 資料儲存選型

| 儲存類型 | 用途 | 備註 |
|----------|------|------|
| LocalStorage | API Key（加密後的密文）、VAD 閾值、System Prompt | 關閉分頁後保留 |
| Zustand In-Memory | 當前會議的 Message 列表、錄音狀態 | 關閉分頁後清空 |
| Blob URL（暫存） | 音訊片段，傳送 Whisper 後立即釋放 | 不持久化 |

### 3.2 TypeScript 資料模型

```typescript
// src/types/index.ts（SDD v1.2 更新）

export type ApiProvider = 'groq' | 'openai'

/** 單筆翻譯訊息 */
export interface Message {
  id: string                   // UUID
  timestamp: number            // VAD onSpeechStart 時間（段落開始）
  capturedEndAt: number        // VAD onSpeechEnd 時間（段落結束）
                               // silenceGap = 下段.timestamp - 上段.capturedEndAt
  originalText: string         // Whisper 回傳的英文原文
  translatedText: string       // LLM 翻譯的繁體中文（enableTranslation=false 時為空字串）
  status: 'transcribing' | 'translating' | 'completed' | 'error'
}

/** 系統配置（LocalStorage 持久化） */
export interface AppConfig {
  provider: ApiProvider          // 'groq' | 'openai'
  apiKeyEncoded: string          // Base64 編碼的 GROQ API Key
  openaiKeyEncoded: string       // Base64 編碼的 OpenAI API Key
  vadSilenceMs: number           // 靜音觸發毫秒（預設 500）
  vadMaxDurationMs: number       // 強制切分毫秒（預設 20000）
  systemPrompt: string           // ICT 技術領域翻譯指令
  rollingContextSize: number     // N=5
  modelSettings: {
    sttModel: string             // 'whisper-large-v3-turbo'
    llmModel: string             // 'llama-3.3-70b-versatile'
  }
  enableTranslation: boolean     // true=STT+LLM, false=僅 STT（預設 true）
}

/** 導出用的會議 Session */
export interface ExportSession {
  sessionId: string
  startTime: number
  endTime: number
  messages: Pick<Message, 'timestamp' | 'originalText' | 'translatedText'>[]
}
```

---

## 4. 模組設計

### 4.1 模組總覽

| 模組名稱 | 檔案路徑 | 職責 | 依賴模組 |
|----------|----------|------|----------|
| `AudioEngine` | `services/AudioEngine.ts` | 麥克風初始化、Silero VAD、強制切分 | `@ricky0123/vad-web` |
| `GroqService` | `services/GroqService.ts` | 封裝 STT 與 LLM API 請求、指數退避重試 | 網路層 |
| `ContextManager` | `services/ContextManager.ts` | 維護 N-5 Rolling Context、組裝 LLM Prompt | N/A |
| `ExportService` | `services/ExportService.ts` | 將 Message 列表轉為 Markdown 或 TXT 下載 | N/A |
| `CryptoService` | `services/CryptoService.ts` | API Key 的 Base64 編碼 / 解碼 | N/A |
| `ConfigStore` | `store/ConfigStore.ts` | 管理 AppConfig 與 LocalStorage 讀寫 | N/A |
| `AppStore` | `store/AppStore.ts` | 管理 Message 列表、錄音狀態、pendingCount | N/A |
| `useAudio` | `hooks/useAudio.ts` | 音訊 Blob 佇列、STT+LLM 流程整合、翻譯開關 | AudioEngine, GroqService, AppStore, ConfigStore |

### 4.2 AudioEngine（核心模組）

**職責**：封裝所有音訊底層操作，對外僅暴露 `start() / pause() / stop()` 介面。

**設計重點**：
- 使用 `@ricky0123/vad-web` 的 `MicVAD`，基於 Silero 神經網路模型偵測語音活動
- `onSpeechStart` 觸發時記錄 `speechStartedAt = Date.now()`
- `onSpeechEnd` 收到 `Float32Array` 後轉換為 WAV `Blob`，回呼 `onSpeechEnd(blob, speechStartedAt, speechEndedAt)`
- 語音開始時啟動強制切分 timer；`onSpeechEnd` 觸發後清除 timer
- 強制切分：`vad.pause().then(() => vad.start())`（`submitUserSpeechOnPause=true` 觸發回呼）

```typescript
interface AudioEngineOptions {
  onSpeechEnd: (blob: Blob, speechStartedAt: number, speechEndedAt: number) => void
  silenceMs?: number       // 預設 500ms（redemptionMs）
  maxDurationMs?: number   // 預設 20000ms
}

class AudioEngine {
  private vad: MicVAD | null = null
  private speechStartedAt: number = 0
  private forceSliceTimer: ReturnType<typeof setTimeout> | null = null

  async init(options: AudioEngineOptions): Promise<void>
  start(): void
  pause(): void
  stop(): void
  destroy(): void

  private float32ToWavBlob(audio: Float32Array): Blob
  private startForceSliceTimer(): void
  private clearForceSliceTimer(): void
}
```

### 4.3 GroqService

**職責**：封裝 STT（Whisper）與 LLM 翻譯（Llama-3）API，支援 GROQ 與 OpenAI 兩個端點。

**重試策略**（`withRetry`）：
- `InvalidKeyError`：永久性失敗，不重試，直接拋出
- `RateLimitError`（HTTP 429）、`GroqServerError`（HTTP 5xx）、網路 `TypeError`：指數退避重試（最多 3 次：1s → 2s → 4s）
- 超過最大重試次數後，投出最後的錯誤讓呼叫方處理

```typescript
// 所有方法均接受 apiBase 參數（預設 GROQ_API_BASE）
transcribe(blob: Blob, apiKey: string, model: string, apiBase?: string): Promise<string>
translate(messages: ChatMessage[], apiKey: string, model: string, apiBase?: string): Promise<string>
testConnection(apiKey: string, model: string, apiBase?: string): Promise<boolean>

// 內部重試邏輯
async function withRetry<T>(fn, maxRetries = 3, baseDelayMs = 1000): Promise<T>
```

### 4.4 ContextManager

**職責**：維護 Rolling Context 緩衝區，組裝符合 GROQ Chat API 格式的 Prompt。

**ICT 技術領域預設 System Prompt**：

```
You are a professional ICT technical interpreter for high-stakes meetings.

Rules:
1. Translate English to Traditional Chinese (Taiwan standard).
   - Use "記憶體" not "內存"
   - Use "快閃記憶體" not "閃存"
   - Use "處理器" not "處理机"
2. Keep technical terms (model numbers, version strings, acronyms like NVMe, PCIe, NAND)
   in English unless a widely-accepted Traditional Chinese term exists.
3. If uncertain about a proper noun, preserve the original English term in brackets
   e.g., "介面控制器（Interface Controller）".
4. Output ONLY the translated sentence. No explanation, no prefix.
```

**Prompt 組裝邏輯**：

```
messages = [
  { role: 'system',    content: ICT_SYSTEM_PROMPT },
  { role: 'user',      content: history[0].originalText },   // ─┐
  { role: 'assistant', content: history[0].translatedText }, //  │ 最近 5 句（最多 10 則）
  ...                                                         //  │
  { role: 'user',      content: history[4].originalText },   // ─┘
  { role: 'user',      content: `Translate: "${currentText}"` }
]
```

```typescript
class ContextManager {
  private buffer: Message[] = [];
  private readonly maxSize: number;

  constructor(maxSize: number = 5)

  add(message: Message): void
  buildMessages(currentText: string, systemPrompt: string): ChatMessage[]
  getLastN(n: number): Message[]
  clear(): void
}
```

### 4.5 ExportService

**職責**：將 AppStore 中的 Message 列表序列化為可下載的檔案。

**Markdown 輸出格式**：

```markdown
# 技術會議記錄

日期：2026/05/15 14:30:00
會議時長：45 分鐘

| # | 時間 | English | 中文 |
|---|------|---------|------|
| 1 | 00:01:23 | The NVMe controller... | NVMe 控制器... |
```

**注意事項**：
- `originalText` 或 `translatedText` 中含有 `|` 字元時，需替換為 `\|` 以防 Markdown 表格破版

```typescript
class ExportService {
  exportAsMarkdown(session: ExportSession): void
  exportAsTxt(session: ExportSession): void

  private sanitizeForMarkdown(text: string): string
  private downloadFile(content: string, filename: string, mimeType: string): void
}
```

### 4.6 CryptoService

**職責**：使用 Web Crypto API 對 API Key 進行加密儲存與解密讀取。

**加密方案**：PBKDF2（100,000 次迭代，SHA-256）派生 AES-GCM-256 金鑰。

**MVP 降階模式**：若用戶不設定 PIN，以 Base64 編碼儲存並顯示安全警告橫幅（非加密）。

```typescript
class CryptoService {
  async encrypt(plaintext: string, pin: string): Promise<{ ciphertext: string; iv: string; salt: string }>
  async decrypt(ciphertext: string, iv: string, salt: string, pin: string): Promise<string>
  encodeFallback(plaintext: string): string   // Base64，MVP 降階用
  decodeFallback(encoded: string): string
}
```

### 4.7 useAudio Hook（新增，Phase 3）

**職責**：整合 AudioEngine → GroqService → AppStore 的完整翻譯流程，管理 Blob 作業佇列。

**關鍵設計**：
- `blobQueueRef`：FIFO 佇列，儲存 `{ blob, capturedAt, capturedEndAt }`
- `processingRef`：互斥鎖，確保同一時間只有一個 Blob 在處理
- `handleSpeechEnd`：僅 push 到佇列 + `addPending()`，立即返回（麥克風不中斷）
- `processSingleBlob`：序列化處理，`finally` 中保證 `removePending()` 必執行

```typescript
// 佇列入口（AudioEngine 回呼）
function handleSpeechEnd(blob: Blob, speechStartedAt: number, speechEndedAt: number): void

// 單一 Blob 處理（序列化）
async function processSingleBlob(blob: Blob, capturedAt: number, capturedEndAt: number): Promise<void>
// 內部流程：
//   addMessage(status='transcribing')
//   GroqService.transcribe(...)
//   if enableTranslation: GroqService.translate(...)
//   updateMessage(status='completed' | 'error')
//   finally: removePending()  ← 保證執行
```

---

## 5. 介面設計

### 5.1 頁面清單

| 頁面 / 組件 | 路徑/觸發 | 功能說明 | 主要子組件 |
|-------------|-----------|----------|-----------|
| 主儀表板 | `/` | 會議即時監看與控制 | `TranslationTable`, `ControlBar`, `ErrorBanner` |
| 設定 Modal | 點擊「設定」按鈕 | API Key、VAD 調整、翻譯開關、Prompt 編輯 | `SettingModal` |
| 導出 Modal | 點擊「停止」後彈出 | 選擇導出格式並觸發下載 | `ExportModal` |

### 5.2 UI 互動行為規格

| 互動事件 | 行為規格 |
|----------|----------|
| `TranslationTable` 新訊息加入 | Smooth Scroll to Bottom（`scrollIntoView({ behavior: 'smooth' })`） |
| Message status = `transcribing` | 顯示左欄 Loading 骨架屏 |
| Message status = `translating` | 顯示右欄 Loading 骨架屏，左欄顯示原文 |
| Message status = `error` | 雙欄顯示紅色文字「轉譯失敗，請手動重試」 |
| 狀態燈（右上角） | 錄音中：紅色脈衝動畫；API 請求中：黃色旋轉；就緒：綠色靜止 |
| API Key 輸入框 | 預設 `type="password"`；點擊眼睛圖示切換明文顯示 |
| Header 徽章 | `pendingCount > 0` 時顯示「處理中 N」藍色脈衝徽章 |
| Header 模式標籤 | `enableTranslation=false` 時顯示「僅轉文字」橘色標籤 |

### 5.3 零遺失保證設計（新增，Phase 3）

**設計目標**：確保錄音停止後所有 Blob 均已處理，不因 API 錯誤或例外狀況造成靜默遺失。

**機制**：
1. `handleSpeechEnd` push Blob 後立即 `addPending()`，`pendingCount++`
2. `processSingleBlob` 在 `finally` 區塊呼叫 `removePending()`，保證 `pendingCount--`
3. Header 顯示 `pendingCount`：用戶可目視確認佇列清空
4. `clearMessages()` 與 `startSession()` 均重設 `pendingCount = 0`

**驗證方法**：錄音停止後觀察 Header 徽章消失（pendingCount 歸零），代表無遺失。

### 5.4 三態控制按鈕狀態機

```
          ┌─────────────────────────────────────────┐
          │                                         │
          ▼                                         │
       [Ready]                                      │
          │ 點擊 Start                               │
          ▼                                         │
      [Recording]  ──點擊 Pause──►  [Paused]        │
          │                           │             │
          │ 點擊 Stop                 │ 點擊 Stop   │
          ▼                           ▼             │
      [Stopping] ──導出 Modal──► [Exporting] ───────┘
```

- **Pause → Resume**：Context 緩衝區保留，繼續使用暫停前的上下文
- **Stop**：觸發 ExportModal，確認後清空 AppStore

---

## 6. 安全設計

### 6.1 API Key 安全性

| 措施 | 實作細節 |
|------|----------|
| 輸入遮蔽 | `<input type="password">`，需點擊眼睛圖示才能明文顯示 |
| 加密儲存 | CryptoService（PBKDF2 + AES-GCM）；MVP 可降階為 Base64 + 警告 |
| 記憶體使用後清除 | API Key 從 Store 取出後，請求完成即讓 GC 回收（不快取在全域變數） |
| 後端零存儲 | Node.js Fastify 不接收、不轉發任何 API Key |

### 6.2 隱私保護策略

- **音訊片段**：`Blob` 傳送至 GROQ 後，呼叫 `URL.revokeObjectURL()` 釋放記憶體
- **會議數據**：Zustand Store 為純記憶體，關閉分頁即清空
- **數據導出**：提供「清除所有數據」按鈕，一鍵抹除 LocalStorage 與 AppStore

### 6.3 Content Security Policy

Node.js 後端需設定以下 CSP Header：

```
Content-Security-Policy:
  default-src 'self';
  connect-src 'self' https://api.groq.com;
  script-src 'self' 'wasm-unsafe-eval';  // Silero VAD 需要 WASM
  worker-src 'self' blob:;               // AudioWorklet 需要
```

---

## 7. 錯誤處理

### 7.1 錯誤分類與處理策略

| 錯誤類型 | HTTP / 原因 | 處理策略 | 用戶提示 |
|----------|-------------|----------|----------|
| Rate Limit | 429 | Exponential Backoff，最多 3 次 | 「系統繁忙，稍後自動更新...」 |
| 無效 API Key | 401 | 停止錄音，開啟設定 Modal | 「API Key 無效，請重新設定」 |
| 麥克風拒絕 | `NotAllowedError` | 顯示引導步驟 | 「請在瀏覽器設定中允許使用麥克風」 |
| 網路離線 | `NetworkError` | 保留未送出音訊，等待重試 | 「網路中斷，正在保護您的錄音...」 |
| GROQ 伺服器錯誤 | 5xx | 自動重試一次，失敗後標記 error | 「GROQ 服務異常，已記錄待重試」 |

---

## 8. 測試策略

測試層次與詳細測試案例請參閱 [TEST_PLAN.md](./TEST_PLAN.md)。

| 測試類型 | 工具 | 目標覆蓋率 |
|----------|------|-----------|
| 單元測試 | Vitest | 核心 Service 類別 ≥ 80% |
| 組件測試 | Vitest + React Testing Library | 主要交互組件 |
| 整合測試 | Vitest（Mock fetch） | 完整翻譯流程 |
| E2E 測試 | Playwright | 關鍵用戶旅程 |

---

## 9. 部署與運維

### 9.1 環境需求

| 項目 | 需求 |
|------|------|
| Node.js Runtime | v20+ |
| 瀏覽器 | Chrome 110+ / Edge 110+（需支援 `WebAudio`、`MediaRecorder`、`AudioWorklet`） |
| 協定 | HTTPS 強制（`getUserMedia` API 限制） |
| WASM 支援 | 需啟用（Silero VAD 使用 ONNX Runtime Web） |

### 9.2 環境變數

```bash
# .env.example（後端僅需 CORS 設定）
ALLOWED_ORIGINS=http://localhost:5173,https://your-domain.com
PORT=3000
```

### 9.3 部署選項

| 選項 | 前端 | 後端 | 備註 |
|------|------|------|------|
| 企業內部 | Docker（Nginx） | Docker（Node.js） | 完整控制，符合資安需求 |
| 快速部署 | Vercel | Vercel Functions | 適合 PoC 驗證 |

---

## 10. 實作路徑（Implementation Roadmap）

詳細任務分解請參閱 MVP 開發計畫（PRD §11.2 約束：首版 MVP 4 週）。

| 週次 | 里程碑 | 主要交付物 |
|------|--------|-----------|
| Week 1 | M1：基礎架構 | 專案初始化、CORS 後端、TypeScript Types、ConfigStore、靜態 UI |
| Week 2 | M2：音訊引擎 | AudioEngine + Silero VAD、useAudio Hook、三態控制按鈕 |
| Week 3 | M3：GROQ 整合 | GroqService、ContextManager、AppStore 串接、UI 即時更新 |
| Week 4 | M4：完善交付 | ExportService、錯誤處理 UI、效能測試、安全稽核 |

---

## 11. 已知技術債（v1.1 範圍外）

| 編號 | 描述 | 建議處理時機 |
|------|------|-------------|
| TD-001 | PIN 加密 UI 未實作，MVP 採 Base64 + 警告橫幅 | v1.1 Week 1 |
| TD-002 | 音量波形 Canvas 動畫未開發 | v1.1 Week 2 |
| TD-003 | VAD 靈敏度滑桿（噪音門閥）未實作 | v1.1 Week 1 |
| TD-004 | Web Worker 防分頁休眠（R-004 緩解措施） | v1.1 Week 1 |
| TD-005 | 自定義術語辭典（PRD Could Have） | v1.2 |

---

*文件結尾 — OmniTranslate-GROQ SDD v1.1*
