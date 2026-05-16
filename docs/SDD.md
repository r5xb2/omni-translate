# OmniTranslate 軟體設計文件（SDD）

## 文件資訊

| 項目 | 內容 |
|------|------|
| 文件版本 | 2.0 |
| 更新日期 | 2026-05-16 |
| 文件狀態 | 現況版（精簡） |
| 說明 | 本文件只保留目前程式碼已實作且仍在使用的設計 |

---

## 1. 目的與範圍

本文件描述目前實際運作的系統架構、核心模組、資料模型與執行路徑。

不含內容：
- 已移除或未實作的設計草案
- 尚未建立的測試層（例如目前不存在的整合測試/E2E 測試檔）

---

## 2. 系統概觀

### 2.1 技術堆疊

- 前端：React 18 + TypeScript + Vite
- 狀態管理：Zustand
- 音訊偵測：@ricky0123/vad-web（Silero VAD）
- STT/翻譯 API：GROQ / OpenAI（OpenAI-compatible）
- 測試：Vitest + jsdom

### 2.2 實際運作模式

系統有兩條 STT 路徑：

1. standard（預設）
- AudioEngine 擷取語音與 VAD 分段
- useAudio 以佇列序列處理每段音訊
- GroqService.transcribe 做 STT
- GroqService.translate 做翻譯（可關閉，只做 STT）

2. openai-realtime
- RealtimeWebRTCEngine 走 WebRTC 串流
- 透過 /realtime-token 取得 ephemeral token
- onTranscript 回呼進 useAudio.processRealtimeTranscript
- 翻譯仍走 GroqService.translate（依 provider 設定）

---

## 3. 執行路徑（以目前程式碼為準）

### 3.1 錄音啟動分支

在 useAudio.start 中：
- 當 config.sttMode = openai-realtime，建立 RealtimeWebRTCEngine
- 其他情況建立 AudioEngine

### 3.2 標準路徑（standard）

- AudioEngine.onSpeechEnd(blob, startedAt, endedAt)
- useAudio.handleSpeechEnd 將 blob 推入佇列並 addPending
- useAudio.processSingleBlob：
  - transcribe
  - 依 enableTranslation 決定是否 translate
  - 更新 AppStore message 狀態
  - finally removePending

### 3.3 即時路徑（openai-realtime）

- RealtimeWebRTCEngine.onTranscript(text, startedAt, endedAt)
- useAudio.processRealtimeTranscript：
  - 直接進翻譯流程（跳過 STT）
  - 更新 AppStore message 狀態
  - finally removePending

---

## 4. 核心模組

| 模組 | 檔案 | 目前角色 |
|------|------|----------|
| useAudio | src/hooks/useAudio.ts | 主控制流程；決定 standard/realtime 分支；負責 pending 計數與錯誤處理 |
| AudioEngine | src/services/AudioEngine.ts | standard 模式音訊擷取與 VAD 分段 |
| RealtimeWebRTCEngine | src/services/RealtimeWebRTCEngine.ts | openai-realtime 模式主引擎（WebRTC） |
| GroqService | src/services/GroqService.ts | STT 與翻譯 API 呼叫、重試策略 |
| ContextManager | src/services/ContextManager.ts | 滾動上下文管理 |
| AppStore | src/store/AppStore.ts | 訊息、錄音狀態、pendingCount |
| ConfigStore | src/store/ConfigStore.ts | 設定持久化與 provider key 路由 |

### 4.1 關於 RealtimeEngine.ts

- src/services/RealtimeEngine.ts 目前不是主要執行路徑
- 現行 useAudio 並未建立 RealtimeEngine 實例
- 目前 realtime 主路徑為 RealtimeWebRTCEngine

---

## 5. 資料模型（現況）

來源：src/types/index.ts

### 5.1 AppConfig

- provider: groq | openai
- apiKeyEncoded, openaiKeyEncoded
- vadSilenceMs, vadMaxDurationMs
- systemPrompt, rollingContextSize
- modelSettings.sttModel, modelSettings.llmModel
- enableTranslation
- sttPrompt
- meetingReadableMode
- readabilityMergeGapMs
- readabilityMinChars
- sttMode: standard | openai-realtime
- realtimeModel

### 5.2 Message

- id
- timestamp（段落開始）
- capturedEndAt（段落結束）
- originalText
- translatedText
- status: transcribing | translating | completed | error

---

## 6. 外部介面

### 6.1 API Base

- GROQ: https://api.groq.com/openai/v1
- OpenAI: https://api.openai.com/v1

### 6.2 Realtime token

目前開發流程預設由 Vite middleware 提供：
- POST /realtime-token（定義於 vite.config.ts）

專案內同時存在 server/index.js 的 Fastify 實作，但非前端預設唯一路徑。

---

## 7. 目錄（精簡現況）

- src: 前端核心程式
- tests/unit: 現有單元測試
- docs: 文件
- scripts: 驗證腳本
- server: 可選的獨立 token 服務

---

## 8. 設計決策與待辦

### 8.1 已確認

- 實際 realtime 主路徑為 RealtimeWebRTCEngine
- 標準模式與即時模式都由 useAudio 統一控制

### 8.2 待決策

- 是否保留 RealtimeEngine.ts（若保留，應明確定位用途；若不保留，需整理測試與型別依賴）
- 是否保留 server/index.js 作為獨立啟動路徑，或統一使用 Vite middleware
