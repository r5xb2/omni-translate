# OmniTranslate 改善計畫 v2.0（策略版）

> 狀態：已拍板（執行中）
> 日期：2026-05-16
> 目標：先止血，再升級架構；維持可持續開發，不破壞現有可執行狀態

---

## 1. 本版計畫焦點

1. P0：修正即時模式無法有效暫停/停止（高嚴重度）
2. P1：導入模組化設定與提示詞（YAML/JSON 載入 + UI 持久化共存）
3. P2：透過外部最佳實務強化穩定性、使用體驗、效能

---

## 2. 現況診斷（已確認）

### 2.1 P0 問題：即時模式按下暫停/停止後仍持續出字

現況觀察：
- 即時引擎在 pause/stop 時主要是關閉音軌與關閉連線，但對「已到達 data channel 的完成事件」缺少最後一道閘門。
- 翻譯流程是非同步任務，stop 後目前沒有任務取消機制，已啟動的翻譯仍會完成並寫入畫面。

已定位到的程式行為：
- `RealtimeWebRTCEngine.handleMessage()` 對 `conversation.item.input_audio_transcription.completed` 事件直接觸發 `onTranscript`，未檢查 `isStreaming` 或 session token。
- `useAudio.processRealtimeTranscript()` 進入後一定會建立訊息並執行翻譯流程，stop/pause 期間未做「當前 session 是否有效」驗證。

影響：
- 使用者心理模型被破壞（按停止但畫面持續新增內容）。
- 會議情境下容易造成誤判，屬於阻斷型缺陷。

### 2.2 P1 需求：模組化 prompt 與設定載入

現況：
- 目前設定持久化在 localStorage（可保留），但缺少「可版本化、可分享、可快速切換」的外部設定檔機制。
- 提示詞目前以固定常數與 UI 編輯為主，缺少 profile/module 結構。

參考樣式（由你指定的 ZeroType 目錄抽樣）：
- `SYSTEM.md` + 多個 `USER-*.md`（情境化 prompt 模組）
- `appsettings.Local.json`（模型、API base、行為參數集中管理）

### 2.3 P2 需求：穩定性/體驗/效能

外部依據（官方文件摘要）：
- OpenAI Realtime transcription：
  - completed 事件跨 turn 順序不保證，建議用 `item_id` 對齊。
  - 可調整延遲/準確度平衡（約 0.4s、0.8-1.2s、1.5-2.0s 等區間測試）。
- OpenAI VAD：
  - server_vad / semantic_vad 皆可用於切段策略，需依場景調整。
- Groq Speech-to-Text：
  - 提供 `language` 與 `prompt` 可改善延遲與品質。
  - `verbose_json` 可提供品質診斷欄位（logprob/no_speech_prob 等）。

---

## 3. 目標架構（不破壞現有主路徑）

### 3.1 音訊與會話控制層

新增 `RealtimeSessionGuard`（概念）：
- 每次 start 產生 `sessionId`。
- pause/stop 會使舊 `sessionId` 失效。
- 所有 transcript/translation callback 進入前先驗證 sessionId。

目的：
- 保證「舊事件」不會污染當前 UI。

### 3.2 設定與提示詞模組層

新增 `ConfigProfileLoader` + `PromptModuleLoader`：
- 啟動時載入 `config/defaults.yaml`（或 json）作為初始值。
- 允許多份 prompt profile（例如 meeting、chat、bilingual、tech）。
- UI 仍可儲存 localStorage，且 localStorage 優先權高於 defaults。

建議優先權（由高到低）：
1. 執行期 UI/localStorage
2. 指定 profile 檔（yaml/json）
3. 專案內建 defaults

### 3.3 品質與可觀測層

新增基礎 metrics：
- transcript 延遲（speech_stopped -> completed）
- pending 佇列深度
- stop 後新增訊息數（應為 0）
- 翻譯失敗率 / 重試率

---

## 4. 分階段執行計畫

## Phase A（P0 止血，優先）

範圍：即時模式 pause/stop 行為一致化

工作項目：
1. 在 `useAudio` 加入 session guard 與 `isAcceptingRealtimeEvents` 閘門。
2. 在 `RealtimeWebRTCEngine` 對 completed 事件加上條件：非 streaming 或已 destroy 時忽略。
3. pause/stop 時送出清理事件（實作前以 API reference 再核對事件名稱與 payload）。
4. 為翻譯流程加入可取消機制（AbortController 或等效 cancel token）。
5. stop 後狀態收斂規則：
   - 不再接受新 transcript
   - 允許或拒絕 in-flight 任務（需拍板，見第 7 節）
   - 最終 UI 進入可預期狀態

驗收標準：
- 連續語音中按 pause，1 秒後不得新增新列。
- 按 stop 後不得持續新增列。
- 重複 start/pause/resume/stop 不出現狀態錯亂。

測試補強：
- 新增 hook/engine 單元測試：
  - pause 後忽略 completed
  - stop 後 callback 不得寫入 store
  - sessionId 失效後舊任務不得覆寫新 session

預估：1-2 天

執行結果（2026-05-16）：
- 已完成：realtime session guard、pause/stop 事件閘門、in-flight 翻譯取消、item_id 對齊基礎。
- 已新增測試：
  - pause 後忽略晚到 completed 事件。
  - stop 後忽略晚到 completed 事件。
  - engine 僅在 streaming 狀態處理 completed，並驗證 item_id 傳遞。
- 驗證結果：
  - `npm test`：8 個測試檔、45 個測試，全數通過。
  - `npm run build`：建構成功。

## Phase B（P1 模組化）

範圍：設定與 prompt 的外部檔案載入

工作項目：
1. 建立檔案結構：
   - `config/defaults.yaml`
   - `config/profiles/*.yaml`
   - `prompts/system/*.md`
   - `prompts/user/*.md`
2. 實作 `ConfigProfileLoader`：YAML 解析 + schema 驗證（建議 zod）。
3. 設計 profile 合併策略（provider、apiBase、模型、sttPrompt、systemPrompt）。
4. 設定 UI 增加「載入 profile / 套用 profile」操作。
5. 保留 localStorage 儲存，並支援「重置為 profile 預設值」。

驗收標準：
- 首次載入可從 YAML 帶入預設模型與參數。
- UI 修改後可持久化，不被重整覆蓋。
- 切換 profile 後可立即反映，且有明確覆蓋規則。

預估：3-4 天

執行結果（2026-05-16）：
- 已完成：
  - 新增 YAML 設定檔與 Prompt 模組檔：
    - `config/defaults.yaml`
    - `config/profiles/meeting.yaml`
    - `config/profiles/bilingual.yaml`
    - `prompts/system/*.md`、`prompts/user/*.md`
  - 新增 `ConfigProfileLoader`：
    - 支援 defaults 載入
    - 支援內建 profile 清單與套用
    - 支援匯入 YAML profile（含 schema 驗證）
  - `ConfigStore` 與 `SettingModal` 已接上：
    - 套用內建 profile
    - 匯入 profile
    - 重置回 defaults
- 驗收狀態：
  - 首次啟動可套用 defaults。
  - UI 與 localStorage 可共存。
  - profile 切換/匯入後可生效（重載後保持）。

## Phase C（P2 體驗與品質）

範圍：中文可讀性、輸出品質、互動體驗

工作項目：
1. 匯入「術語/同音誤判修正表」模組（可參考 ZeroType mapping 概念）。
2. 中文標點修復策略改為可配置（開關、門檻、模型）。
3. 新增語言提示設定（STT `language` hint），降低中英混雜誤差。
4. 針對「僅轉文字」模式優化顯示（避免造成誤解的 placeholder）。
5. 長會議模式增加自動捲動與行渲染優化（必要時導入虛擬清單）。

驗收標準：
- 中文段落標點完整度提升（抽樣評估）。
- 中英混講情境下誤判率下降。
- 長時間會議（30 分鐘）UI 不明顯卡頓。

預估：3-5 天

執行結果（2026-05-16）：
- 已完成：
  - 新增術語修正模組 `textCorrections`，在 standard/realtime 轉寫與翻譯結果套用。
  - 新增 STT 語言提示設定（auto/en/zh/ja），並串接 STT API 參數。
  - 中文標點修復策略改為可配置：
    - 開關：`zhPunctuationRepairEnabled`
    - 門檻：`zhPunctuationMinChars`
  - 僅轉文字模式 UI 優化：翻譯欄改顯示「已關閉翻譯」，避免誤解。
  - 長會議渲染優化：限制最大渲染列數，降低大量 DOM 卡頓風險。
- 驗收狀態：
  - 設定已進入 UI 並可持久化。
  - 文字可讀性與顯示語意已改善。

## Phase D（穩定性與效能驗證）

範圍：壓力測試與觀測

工作項目：
1. 建立回放測試腳本（不同語速、停頓、噪音、雙語切換）。
2. 收集 metrics 並建立基準（baseline）。
3. 依瓶頸調整：
   - 翻譯請求併發策略
   - 重試退避參數
   - UI 更新節流

驗收標準：
- 連續 20 分鐘測試無失控輸出。
- stop 後新增訊息數 = 0。
- 平均延遲與錯誤率達到既定門檻。

預估：2-3 天

執行結果（2026-05-16）：
- 已完成：
  - 新增 `RuntimeMetricsService`：
    - transcript latency
    - pending 深度峰值
    - translation success/error
    - stopping 狀態新增訊息數
  - AppStore/useAudio 已接上 runtime metrics 記錄。
  - SettingModal 新增 metrics 匯出（JSON 複製）。
  - 新增 baseline 驗證腳本：`scripts/measure-baseline.ps1`。
- 驗證結果：
  - `npm test`：11 個測試檔、50 個測試，全數通過。
  - `npm run build`：建構成功。

---

## 5. 風險與緩解

1. Realtime 事件規格演進
- 緩解：事件層做版本容錯，並在 server/client 記錄 request id 與 event type。

2. YAML 載入導致設定衝突
- 緩解：明確優先權規則 + UI 顯示「目前值來源」。

3. 新增 cancel 機制可能影響既有翻譯流程
- 緩解：僅在 realtime 分支啟用，並以測試覆蓋 stop/pause 邊界。

4. Prompt 模組過多導致使用複雜
- 緩解：先提供 3-4 個官方 profile，避免一開始過度自由化。

---

## 6. 建議實作順序（可立即開始）

1. 先做 Phase A（P0）並上測試，確保「停得住」。
2. 再做 Phase B 骨架（loader + schema + defaults）。
3. 接著做 Phase C 的術語模組與中文標點品質。
4. 最後做 Phase D 指標化驗證與微調。

---

## 7. 已拍板決策（固定）

1. stop 行為策略：A
- stop 立即丟棄所有 in-flight 翻譯（stop 就停）。

2. 設定檔格式：A
- YAML 為主。

3. profile 來源：B
- 允許使用者匯入 profile 檔。

4. prompt 模組顆粒度：A（精簡版）
- system 一份、user 一份。

5. Realtime 事件順序處理：B
- 導入 item_id 對齊。

---

## 8. 完成定義（Definition of Done）

1. P0：即時模式 pause/stop 行為符合預期，無持續輸出。
2. P1：可由檔案載入初始設定與 prompt，且 UI/localStorage 可共存。
3. P2：有可量測指標，且延遲/品質/穩定性相較目前明顯改善。
4. 全部單元測試與 build 維持通過。
