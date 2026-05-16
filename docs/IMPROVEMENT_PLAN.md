# OmniTranslate-GROQ 改善計畫 v1.0

> 狀態：**待審核** | 建立日期：2026-05-15 | 對應問題：問題 1、2、4

---

## 計畫摘要

| # | 問題 | 類型 | 風險 | 影響範圍 |
|---|------|------|------|----------|
| P1 | 設定儲存後重開 Modal 仍顯示預設模型 | Bug Fix | 低 | `SettingModal.tsx` |
| P2 | 新增 GPT-OSS-20B、GPT-OSS-120B 模型 | 資料新增 | 無 | `constants.ts` |
| P4 | OpenAI Realtime Whisper 即時語音辨識 | 新功能 | 中 | 新增模組 + Hook 擴充 |

---

## P1：Bug Fix — 模型選擇不持久

### 根本原因

```typescript
// SettingModal.tsx 目前程式碼
const [sttModel, setSttModel] = useState(config.modelSettings.sttModel) // ① 正確讀入存檔值
const [llmModel, setLlmModel] = useState(config.modelSettings.llmModel) // ① 正確讀入存檔值

useEffect(() => {
  setSttModel(provider === 'openai' ? OPENAI_STT_MODELS[0].value : GROQ_STT_MODELS[0].value) // ② 初次渲染也執行！
  setLlmModel(provider === 'openai' ? OPENAI_LLM_MODELS[0].value : GROQ_LLM_MODELS[0].value) // ② 蓋掉了 ①
}, [provider])
```

React `useEffect` 在**初次渲染**與依賴變更時都會執行，導致每次開啟 Modal 都重設為清單第一項。

### 修法

加入 `useRef` Mount Guard，跳過第一次觸發：

```typescript
const isFirstRender = useRef(true)

useEffect(() => {
  if (isFirstRender.current) {
    isFirstRender.current = false
    return  // ← 初次渲染跳過，保留 useState 的存檔值
  }
  // 只有用戶真的切換 provider 才重設模型
  setSttModel(provider === 'openai' ? OPENAI_STT_MODELS[0].value : GROQ_STT_MODELS[0].value)
  setLlmModel(provider === 'openai' ? OPENAI_LLM_MODELS[0].value : GROQ_LLM_MODELS[0].value)
  setTestState('idle')
  setTestMsg('')
}, [provider])
```

### 成功標準

- [ ] 選擇非預設模型（如 `Llama 3.1 8B`）後存檔
- [ ] 關閉 Modal 再重開
- [ ] 下拉選單顯示 `Llama 3.1 8B`（而非 `Llama 3.3 70B`）

### 影響範圍

只修改 `src/components/dashboard/SettingModal.tsx` 第 43–50 行，不影響其他模組。

---

## P2：新增 GPT-OSS 模型

### 依據

依附件截圖，`openai/gpt-oss-20b` 與 `openai/gpt-oss-120b` 是 GROQ Production Models（非 OpenAI 平台模型），透過 GROQ API Key 呼叫，應加入 `GROQ_LLM_MODELS`。

| 模型 | 速度 | 定價（per 1M tokens） | 語境窗口 |
|------|------|-----------------------|---------|
| `openai/gpt-oss-20b` | 1000 T/sec（最快）| $0.075 input / $0.30 output | 131K |
| `openai/gpt-oss-120b` | 500 T/sec | $0.15 input / $0.60 output | 131K |

同時移除已被 GROQ 棄用的 `mixtral-8x7b-32768`。

### 修法

```typescript
// src/utils/constants.ts
export const GROQ_LLM_MODELS = [
  { label: 'Llama 3.3 70B（預設，均衡）',     value: 'llama-3.3-70b-versatile' },
  { label: 'GPT-OSS 120B（高品質，500T/s）',  value: 'openai/gpt-oss-120b' },
  { label: 'GPT-OSS 20B（極速，1000T/s）',    value: 'openai/gpt-oss-20b' },
  { label: 'Llama 3.1 8B（最快輕量）',         value: 'llama-3.1-8b-instant' },
  { label: 'Gemma 2 9B',                       value: 'gemma2-9b-it' },
  // mixtral-8x7b-32768 已移除（GROQ 已棄用）
]
```

### 成功標準

- [ ] GROQ 提供商模式下，LLM 下拉出現 `GPT-OSS 120B` 與 `GPT-OSS 20B`
- [ ] 選擇 `GPT-OSS 20B` 存檔，重開 Modal 仍顯示 `GPT-OSS 20B`（依賴 P1 修正）
- [ ] Mixtral 選項消失

---

## P4：OpenAI Realtime Whisper（獨立功能模組）

### 架構決策

**現有流程（Standard 模式）**：
```
麥克風 → Silero VAD（前端）→ Blob → GROQ/OpenAI Whisper REST → 翻譯
```

**Realtime 模式**：
```
麥克風 → PCM16 串流 → OpenAI Realtime WebSocket → 伺服器 VAD → 逐句轉寫文字 → 翻譯
```

關鍵差異：
- 不需要 Silero VAD（伺服器端 VAD 取代）
- 不需要 Blob 錄音（連續串流取代）
- STT 延遲：~200ms（vs. Standard ~800ms）
- 翻譯步驟不變（仍使用現有 LLM 管道）

### 設計原則

為避免過度改動現有架構（Rule 3），採用**獨立模組 + Hook 擴充分支**設計：
- `RealtimeEngine.ts`：全新模組，不修改 `AudioEngine.ts`
- `useAudio.ts`：新增 `processRealtimeTranscript()` 分支，原有 `processSingleBlob()` 完整保留
- `AppConfig`：新增 `sttMode` 欄位，不改動現有 `provider` 語意

### 新增型別（types/index.ts）

```typescript
export type SttMode = 'standard' | 'openai-realtime'

// AppConfig 新增欄位
export interface AppConfig {
  // ... 現有欄位不變 ...
  sttMode: SttMode                // 預設 'standard'
  realtimeModel: string           // 預設 'gpt-4o-transcribe'
}
```

### 新增服務（services/RealtimeEngine.ts）

```typescript
// OpenAI Realtime API 規格
// 連線：wss://api.openai.com/v1/realtime?model=<realtimeModel>
// Headers: Authorization: Bearer <apiKey>, OpenAI-Beta: realtime=v1
// 音訊格式：PCM16, 24kHz, Mono（需從瀏覽器 44.1/48kHz 降頻）

interface RealtimeEngineOptions {
  apiKey: string
  model: string                          // 'gpt-4o-transcribe' | 'gpt-4o-mini-transcribe'
  language?: string                      // 預設 'en'
  silenceDurationMs?: number             // 伺服器 VAD 靜音閾值，預設 500
  onTranscript: (text: string, startedAt: number, endedAt: number) => void
  onError: (error: Error) => void
  onStateChange: (state: 'connecting' | 'ready' | 'closed') => void
}

class RealtimeEngine {
  // 私有屬性
  private ws: WebSocket | null
  private audioContext: AudioContext | null
  private mediaStream: MediaStream | null
  private scriptProcessor: ScriptProcessorNode | null  // 轉 PCM16 用
  private speechStartedAt: number

  // 公開介面（與 AudioEngine 對稱）
  async init(options: RealtimeEngineOptions): Promise<void>
  start(): void      // 開始串流麥克風
  stop(): void       // 停止串流
  destroy(): void    // 關閉 WebSocket + 釋放資源

  // 私有方法
  private connectWebSocket(): void
  private setupAudioCapture(): Promise<void>
  private sendAudioChunk(float32: Float32Array): void   // 轉 PCM16 後 base64 送出
  private handleMessage(raw: string): void              // 處理 WS 事件
  private resampleTo24kHz(buffer: Float32Array, srcRate: number): Float32Array
}
```

**關鍵 WebSocket 事件流程**：

```
用戶說話
  │
  ├─ [WS RX] input_audio_buffer.speech_started
  │         → speechStartedAt = Date.now()
  │
  │   [WS TX] input_audio_buffer.append（連續送出 PCM16）
  │
  ├─ [WS RX] input_audio_buffer.speech_stopped
  │         → speechEndedAt = Date.now()
  │
  ├─ [WS RX] conversation.item.input_audio_transcription.completed
  │         → text = event.transcript
  │         → onTranscript(text, speechStartedAt, speechEndedAt)
  │
  ▼
useAudio.processRealtimeTranscript(text, capturedAt, capturedEndAt)
  → 跳過 STT 步驟，直接進入翻譯管道
  → addPending() / buildMessages() / translate() / removePending()
```

### useAudio Hook 擴充

在現有 `processSingleBlob` 之外，新增 `processRealtimeTranscript`：

```typescript
// 新函式：跳過 STT，直接從轉寫文字進入翻譯管道
const processRealtimeTranscript = useCallback(
  async (text: string, capturedAt: number, capturedEndAt: number) => {
    addPending()
    const { apiKey, apiBase } = getProviderConfig()     // LLM provider（不變）
    const { llmModel } = config.modelSettings
    const msgId = addMessage({ originalText: text, translatedText: '', status: 'translating' }, capturedAt, capturedEndAt)
    try {
      if (!config.enableTranslation) {
        updateMessage(msgId, { status: 'completed' })
        return
      }
      const messages = contextRef.current.buildMessages(text, config.systemPrompt)
      const translation = await GroqService.translate(messages, apiKey, llmModel, apiBase)
      updateMessage(msgId, { translatedText: translation, status: 'completed' })
      // ... 錯誤處理（與 processSingleBlob 相同）
    } finally {
      removePending()
    }
  }, [...]
)
```

`startRecording` 函式新增分支：

```typescript
// startRecording 依 sttMode 選擇引擎
if (config.sttMode === 'openai-realtime') {
  const engine = new RealtimeEngine()
  await engine.init({
    apiKey: getOpenAiKey(),
    model: config.realtimeModel,
    onTranscript: (text, startedAt, endedAt) => {
      processRealtimeTranscript(text, startedAt, endedAt)
    },
    ...
  })
  realtimeEngineRef.current = engine
  engine.start()
} else {
  // 原有 AudioEngine 流程（不改動）
}
```

### SettingModal UI 新增

在 STT 模型選擇區塊，當 provider 含有 OpenAI Key 時顯示 Realtime 切換開關：

```
┌─────────────────────────────────────┐
│ 語音辨識模式                         │
│  ○ 標準模式（Whisper REST API）      │
│  ○ 即時模式（OpenAI Realtime）★新   │
│    └─ 模型：[gpt-4o-transcribe ▼]   │
│    └─ 需要 OpenAI API Key           │
└─────────────────────────────────────┘
```

### 成功標準

- [ ] `RealtimeEngine` 可建立 WebSocket 連線（需真實 OpenAI Key）
- [ ] 說話後 200ms 內取得轉寫文字（vs. Standard 800ms）
- [ ] 翻譯結果正確顯示於 TranslationTable
- [ ] `pendingCount` 在 Realtime 模式下正確歸零（零遺失保證）
- [ ] 切換 Realtime 模式不影響 Standard 模式功能

### 已知不確定性（Rule 12）

| 項目 | 說明 |
|------|------|
| 音訊重新採樣 | 瀏覽器麥克風預設 44.1kHz/48kHz，Realtime API 需 24kHz PCM16，需手動降頻 |
| WebSocket 斷線重連 | 需設計 reconnect 邏輯，避免長會議中途斷線丟失轉寫 |
| 瀏覽器 CSP | WebSocket 連線需在 CSP `connect-src` 中加入 `wss://api.openai.com` |
| ScriptProcessorNode | 為保持簡單，暫用 `ScriptProcessorNode`（已棄用但仍可用），v1.2 再改為 AudioWorklet |

---

## 驗證計畫

### P1、P2 測試（Vitest 單元測試）

| 測試 ID | 說明 | 方式 |
|---------|------|------|
| UT-SETTING-001 | GROQ 模式下，新模型清單包含 `openai/gpt-oss-20b` | `constants.ts` 直接斷言 |
| UT-SETTING-002 | GROQ 模式下，`mixtral-8x7b-32768` 不在清單中 | `constants.ts` 直接斷言 |
| UT-SETTING-003 | `GROQ_LLM_MODELS` 所有 value 均為非空字串 | 格式驗證 |

> Bug fix（P1）為純 UI 行為，以手動測試驗證（無法用 Vitest 測 useEffect 時序）。

### P4 測試（Vitest + Mock WebSocket）

| 測試 ID | 說明 | 方式 |
|---------|------|------|
| UT-RT-001 | `RealtimeEngine` 收到 `speech_started` 事件時記錄時間戳 | Mock WS + 斷言 |
| UT-RT-002 | `RealtimeEngine` 收到 `transcription.completed` 後觸發 `onTranscript` | Mock WS + 斷言 |
| UT-RT-003 | `destroy()` 後 WebSocket 狀態為 `CLOSED` | Mock WS 狀態檢查 |
| UT-RT-004 | `resampleTo24kHz()` 正確縮減 Float32Array 長度 | 純函式數值斷言 |
| UT-RT-005 | `sendAudioChunk()` 輸出為合法 base64 字串 | 格式驗證 |

---

## 實作順序（獲同意後執行）

```
Step 1  P2 資料新增        constants.ts（5 分鐘）
Step 2  P1 Bug Fix         SettingModal.tsx（10 分鐘）
Step 3  P4 型別擴充        types/index.ts + constants.ts
Step 4  P4 RealtimeEngine  services/RealtimeEngine.ts（新增）
Step 5  P4 useAudio 擴充   hooks/useAudio.ts
Step 6  P4 ConfigStore     store/ConfigStore.ts（新增欄位預設值）
Step 7  P4 SettingModal UI dashboard/SettingModal.tsx
Step 8  撰寫測試           tests/unit/RealtimeEngine.test.ts
Step 9  執行全部測試        vitest run
Step 10 手動驗證 P1 Bug    開 Modal → 選非預設模型 → 存 → 重開 → 確認
```

---

## 等待確認事項

在你同意前，請確認以下選擇：

1. **P4 重新採樣實作**：用純 JS（避免外部依賴）或引入 `resampler` npm 套件？建議前者（符合 Rule 2）。
2. **P4 LLM 翻譯提供商**：Realtime 模式下翻譯仍使用現有 `provider` 設定（GROQ 或 OpenAI）？
3. **P2 Mixtral 移除**：是否確認移除已棄用的 `mixtral-8x7b-32768`？
