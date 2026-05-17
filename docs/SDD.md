# OmniTranslate 軟體設計文件（SDD）

## 文件資訊

| 項目 | 內容 |
|---|---|
| 文件版本 | 3.4 |
| 更新日期 | 2026-05-17 |
| 文件狀態 | 現況 + 已落地需求優化（兩模式、模板、本機設定、Speaker A/B/C 輕量版，含固定窗長 DSP 修正） |
| 適用範圍 | `src/`、`server/`、`config/`、`prompts/`、`docs/` |

---

## 1. 專案目的與設計原則

### 1.1 產品目的

OmniTranslate 的核心任務是「把語音內容轉成可交付的文字資產」，而不是讓使用者操作語音模型控制台。  
交付物有兩種：

- 逐字稿（Transcript）
- 完整紀錄包（模板化紀錄稿 + 逐字稿）

### 1.2 已拍板的 UX 收斂方向

產品模式固定為兩種：

- 會議 / 對談記錄
- 單向內容記錄（課堂、演講、研習）

模式之外的能力（原文/翻譯/雙語、模板、匯出）全部視為輸出策略，不再拆成獨立情境。

### 1.3 架構原則

- 零摩擦：首頁只讓使用者快速開始，不暴露引擎細節。
- 分層控制：使用者決定結果，系統決定路由與參數。
- 可追溯：任何紀錄稿輸出都必須附帶逐字稿。
- 可維護：設定與提示詞可版本化，並可由 profile 套用。

---

## 2. 系統範圍與上下文

### 2.1 In Scope

- 瀏覽器錄音、VAD 分段、STT、翻譯、畫面呈現、匯出。
- 標準 STT 路徑與 OpenAI Realtime 路徑。
- Profile/Prompt 外部化與 LocalStorage 共存。
- 手動匯出文本資產（`.md` / `.txt`）。

### 2.2 Out of Scope（目前未實作）

- 多使用者帳號與雲端同步。
- 後端持久化資料庫。
- E2E 測試自動化。
- Speaker diarization 離線高精度重排（pyannote / WhisperX 類）。

---

## 3. 現行系統概觀（As-Is）

### 3.1 技術堆疊

- Frontend：React 18 + TypeScript + Vite + Tailwind
- State：Zustand（`AppStore`、`ConfigStore`）
- Audio/VAD：`@ricky0123/vad-web`
- AI API：Groq / OpenAI（OpenAI-compatible REST + Realtime token）
- Test：Vitest + jsdom

### 3.2 主要執行路徑

1. 標準模式（`standard`）
- `AudioEngine` 擷取語音片段。
- `useAudio.handleSpeechEnd` 進入佇列。
- `useAudio.processSingleBlob` 執行 STT，再依設定翻譯。

2. 即時模式（`openai-realtime`）
- `RealtimeWebRTCEngine` 推送 transcript 事件。
- `useAudio.processRealtimeTranscript` 直接進翻譯流程。
- 由 session guard + in-flight abort 控制 pause/stop 一致性。

3. Speaker 標記（A 方案，前端輕量）
- 對談模式（`interactionMode=conversation`）啟用。
- 可由設定頁 `speakerDiarizationEnabled` 開關控制（預設關閉）。
- 標準模式：使用每段音訊的輕量聲學特徵做分群，輸出 `Speaker A/B/C`。
  - 特徵擷取採固定窗長（25ms）+ 固定 hop（10ms）+ 固定採樣率（16kHz）分析。
  - 不再使用動態抽點降採樣，避免頻帶特徵失真。
- 即時模式：先用段落停頓做 fallback 推斷，避免阻塞即時轉寫。

### 3.3 主要模組責任

| 模組 | 檔案 | 責任 |
|---|---|---|
| App shell | `src/App.tsx` | 頂層流程：開始/停止、設定、匯出視窗 |
| Audio orchestrator | `src/hooks/useAudio.ts` | 模式分流、佇列、翻譯管線、錯誤處理 |
| Standard audio | `src/services/AudioEngine.ts` | 麥克風收音與 VAD 片段切分 |
| Realtime audio | `src/services/RealtimeWebRTCEngine.ts` | OpenAI Realtime WebRTC 串流 |
| Speaker diarization (lightweight) | `src/services/SpeakerDiarizationService.ts` | 前端輕量 speaker 分群與 A/B/C 指派 |
| STT/LLM client | `src/services/GroqService.ts` | STT、翻譯、重試、錯誤分類 |
| Config profile | `src/services/ConfigProfileLoader.ts` | YAML profile 與 prompt 模組載入 |
| Export | `src/services/ExportService.ts` | 逐字稿匯出、Record Package 雙檔匯出 |
| Record template loader | `src/services/RecordTemplateService.ts` | 讀取 `templates/records/*.md` |
| Record generator | `src/services/RecordGenerationService.ts` | 套模板後呼叫 LLM 產生紀錄稿 |
| Local config bridge | `src/services/LocalConfigService.ts` | 本機設定檔載入/儲存（含 API Key） |
| Runtime metrics | `src/services/RuntimeMetricsService.ts` | 延遲、pending、錯誤等指標 |

### 3.4 主要資料模型

來源：`src/types/index.ts`

- `AppConfig`
  - provider、modelSettings、sttMode、realtimeModel
  - sttPrompt、sttLanguageHint、systemPrompt、userPrompt
  - zhPunctuationRepairEnabled、meetingReadableMode 等輸出策略設定
- `Message`
  - `timestamp`、`capturedEndAt`
  - `speakerLabel?`（`Speaker A/B/C`）
  - `originalText`、`translatedText`
  - `status`: `transcribing | translating | completed | error`
- `ExportSession`
  - `sessionId`、`startTime`、`endTime`
  - 已完成訊息的輸出快照（含 `speakerLabel?`）

---

## 4. 痛點診斷與架構缺口

### 4.1 已知痛點

- 設定面板承載過多技術細節（provider/model/prompt/VAD 混在同層）。
- 首頁資訊層未依任務階段分層，容易增加認知負荷。
- Speaker A/B/C 已導入輕量版；高精度重排仍待離線流程補強。

### 4.2 需求缺口（與產品目標對照）

| 目標 | 目前狀態 | 缺口 |
|---|---|---|
| 兩種模式（會議/對談、單向內容） | 部分概念存在於 profile | UI 與流程尚未明確模式化 |
| 模式內可切原文/翻譯/雙語 | 已有翻譯開關與表格雙欄 | 缺少使用者語意化控制（輸出模式） |
| 匯出完整紀錄包 | 已實作 | 後續補強模板品質與錯誤回退 |
| 乾淨根目錄與 temp 管理 | 未定義規範 | 需導入 `temp/` 收納規則與清理機制 |

---

## 5. 目標架構（To-Be）

### 5.1 產品層（User-facing）

只保留三個互動面向：

- 模式：會議/對談、單向內容
- 顯示：原文、翻譯、雙語
- 會後輸出：逐字稿、完整紀錄包

### 5.2 系統層（Engine-facing）

由 profile 路由底層配置，不直接暴露給一般使用者：

- provider / stt model / llm model
- stt prompt / language hint
- VAD、readability、punctuation repair
- speaker diarization（lightweight acoustic + silence fallback）
- realtime token 來源

### 5.3 輸出層（Deliverables）

必須落地兩種匯出能力：

1. `Transcript Export`
- 純逐字稿（`.md` / `.txt`）

2. `Record Package Export`
- 模板化紀錄稿（`record-*.md`）
- 原始逐字稿（`transcript-*.md`）
- 兩檔分開輸出，模板檔內不包含逐字稿附錄

---

## 6. 設定、Profile、Prompt 分層

### 6.1 設定優先權

1. Runtime/UI 變更（LocalStorage）
2. 套用 profile（`config/profiles/*.yaml`）
3. defaults（`config/defaults.yaml`）

### 6.2 Profile 設計責任

- 定義場景預設，不直接等於 UI 功能清單。
- 可攜帶 `prompts.systemFile` / `prompts.userFile`。
- 可攜帶基礎策略（翻譯啟用、VAD、readability 等）。

### 6.3 Prompt 設計責任

- System prompt：語氣與領域守則。
- User prompt：補充場景偏好。
- 由 loader 注入，不要求一般使用者手寫 prompt。

### 6.4 模板模組化

- 模板檔路徑：`templates/records/*.md`
- 模板可線下新增與編修，啟動後由 `/record-templates` 載入。
- Record Package 匯出時會以模板內容 + 逐字稿呼叫 LLM 生成紀錄稿。

---

## 7. 主要序列流程

### 7.1 啟動到處理（標準模式）

1. `ControlBar` 觸發 `start()`
2. `useAudio` 初始化 session 與 store 狀態
3. `AudioEngine` 偵測語段，回呼 `onSpeechEnd`
4. blob 進佇列，`pendingCount +1`
5. `GroqService.transcribe` 產生 transcript
6. Speaker 輕量分群（對談模式）
7. 若啟用翻譯則進 `translateBilingual`
8. 更新 message 為 `completed`
9. `pendingCount -1`

### 7.1.1 Speaker 輕量分群流程（A 方案）

1. `AudioEngine` 回呼 `onSpeechEnd(blob, startedAt, endedAt, audioSamples)`。
2. `SpeakerDiarizationService.assign()` 嘗試用聲學特徵比對既有 speaker centroid。
  - 特徵由固定窗長統計（RMS / ZCR / 多頻帶 Goertzel）聚合而成。
3. 若比對信心不足且尚未超過 3 人，建立下一個 speaker label（B/C）。
  - 採保守策略：需連續觀測到候選差異才切換，避免亂跳。
4. 若無音訊特徵（即時模式），使用停頓 gap fallback 指派。
5. `speakerLabel` 寫入 `Message`，並沿用到匯出逐字稿與模板整理輸入。

### 7.2 會後輸出（現況）

1. 使用者按停止
2. `getExportSession()` 取快照
3. `ExportModal` 提供：
- 逐字稿匯出（`.md` / `.txt`）
- Record Package 匯出（模板化紀錄稿 + 逐字稿，分開兩個檔案）
4. 匯出後清除訊息並回 idle

---

## 8. 安全與隱私

- API key 以 Base64 儲存在 LocalStorage（非強加密）。
- API key 會同步至本機設定檔：`config/local/app.local.yaml`（不進版控）。
- 前端不保存音訊檔到專案檔案系統。
- Realtime token 透過 `/realtime-token` 代理取得短期憑證。
- 不應在 log、temp、匯出外檔中落地 API key。

---

## 9. 目錄與工程規範

### 9.1 目錄責任

- `src/`: 應用核心與 UI
- `config/`: profile 與 defaults
- `config/local/`: 本機設定檔（敏感資訊，不進版控）
- `prompts/`: prompt 模組
- `templates/records/`: 模板化紀錄稿指令模組
- `docs/`: SDD/TDD/改版策略
- `tests/`: 測試
- `scripts/`: 驗證與維運腳本
- `temp/`: 臨時驗證檔統一收納區

### 9.2 Temp 規範

- 禁止在根目錄散落臨時輸出檔。
- 臨時檔一律放在 `temp/` 或其子資料夾。
- 清理作業僅針對 `temp/`，不觸碰其他專案內容。

---

## 10. 版本化里程碑（需求優化落地）

### M1（流程收斂）

- 首頁輸入收斂為「模式 + 顯示 + 關鍵術語」。
- 設定面板技術項目下沉至進階層。

### M2（輸出增強）

- 增加模板選擇頁。
- 新增完整紀錄包匯出（紀錄稿 + 逐字稿）。

### M3（一致性）

- SDD/TDD 與實作同步維護。
- 每次流程變更需同步更新文件與測試案例。
