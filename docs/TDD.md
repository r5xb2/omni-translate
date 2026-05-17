# OmniTranslate 測試設計文件（TDD）

## 文件資訊

| 項目 | 內容 |
|---|---|
| 文件版本 | 1.4 |
| 更新日期 | 2026-05-17 |
| 文件狀態 | 現況測試 + Speaker A/B/C 輕量版驗收（含固定窗長 DSP 修正） |
| 對應文件 | `docs/SDD.md` |

---

## 1. 目的與原則

本文件定義 OmniTranslate 的測試策略、覆蓋範圍、驗收規則與缺口。  
目標是讓「功能是否完成」與「品質是否可交付」有一致判準。

測試原則：

- 先保護主流程，再擴展新需求。
- 測試描述必須對應實際程式路徑。
- 驗收條件可執行、可重現、可失敗。

---

## 2. 測試範圍

### 2.1 In Scope（現況）

- `tests/unit/*.test.ts`
- hook/service/store 的單元行為
- Realtime pause/stop 邊界保護
- Speaker A/B/C 輕量分群與 fallback
- profile loader 與設定合併
- 匯出格式與文字修正工具

### 2.2 Out of Scope（現況未自動化）

- E2E 錄音流程（真實麥克風）
- 跨瀏覽器相容性
- 長時間壓力回放（30~60 分鐘）
- 真實外部 API 穩定性（Groq/OpenAI）

---

## 3. 測試分層策略

### 3.1 Unit Test（目前主體）

目的：驗證純邏輯、流程分支與狀態機行為。

覆蓋重點：

- `useAudio` 啟停流程與 fallback
- `RealtimeWebRTCEngine` 的事件處理與狀態切換
- `ConfigProfileLoader` 的 schema/載入/合併規則
- `ExportService` 的輸出內容正確性
- `RuntimeMetricsService` 指標計算
- `ContextManager` 與文字校正函式

### 3.2 Integration Test（規劃）

目的：驗證 `App + Store + Hook + UI` 協作。  
現況：尚未建立測試目錄與腳本。

### 3.3 E2E Test（規劃）

目的：驗證瀏覽器真實互動與麥克風權限流程。  
現況：尚未導入 Playwright/Cypress。

---

## 4. 測試環境與執行

在專案根目錄：

- `npm test`
- `npm run test:watch`
- `npm run test:coverage`
- `npm run build`（回歸驗證必跑）

---

## 5. 現有單元測試對照表

| 測試檔案 | 測試主題 | 對應模組 |
|---|---|---|
| `tests/unit/useAudio.test.ts` | standard/realtime 分支、fallback、停止行為 | `useAudio` |
| `tests/unit/RealtimeWebRTCEngine.test.ts` | Realtime 事件與生命週期 | `RealtimeWebRTCEngine` |
| `tests/unit/RealtimeEngine.test.ts` | 舊版路徑保護測試 | `RealtimeEngine`（legacy） |
| `tests/unit/ConfigProfileLoader.test.ts` | defaults/profile/匯入驗證 | `ConfigProfileLoader` |
| `tests/unit/ExportService.test.ts` | markdown/txt 匯出格式 | `ExportService` |
| `tests/unit/RuntimeMetricsService.test.ts` | 指標遞增與快照正確性 | `RuntimeMetricsService` |
| `tests/unit/ContextManager.test.ts` | rolling context 邏輯 | `ContextManager` |
| `tests/unit/textCorrections.test.ts` | 術語校正規則 | `textCorrections` |
| `tests/unit/constants.test.ts` | 常數與模型清單 | `constants` |
| `tests/unit/CryptoService.test.ts` | key encode/decode | `CryptoService` |
| `tests/unit/formatters.test.ts` | 時間與字串格式化 | `formatters` |
| `tests/unit/SpeakerDiarizationService.test.ts` | 輕量 speaker 分群與停頓 fallback | `SpeakerDiarizationService` |

---

## 6. 核心流程驗收案例（必測）

### 6.1 啟動與停止

1. 無 API key 時按開始
- 預期：導向設定流程，不進入 recording。

2. standard 模式開始 -> 停止
- 預期：錄音狀態從 `idle -> recording -> stopping -> idle`。

3. realtime 模式 pause/stop 後晚到事件
- 預期：不得新增有效訊息列。
4. realtime 模式 pause 後短暫 drain window
- 預期：允許尾段在排空視窗內完成，降低內容遺失。

### 6.2 訊息處理一致性

1. transcript 成功
- 預期：message status 最終為 `completed`。

2. 翻譯關閉
- 預期：`translatedText` 為空，且流程仍可完成。

3. 錯誤分類
- 預期：invalid_key / network / rate_limit 對應 appError 與 UI 訊息。

### 6.3 匯出正確性

1. markdown 匯出
- 預期：含標題、時間、列數、表格。

2. txt 匯出
- 預期：含時間戳、原文與譯文格式。
3. speaker 匯出
- 預期：markdown/txt 逐字稿可見 `Speaker A/B/C` 標記（若有）。

---

## 7. 新需求測試設計（對齊本次收斂）

以下為需求優化後必須新增的測試規格。

### 7.1 模式收斂（會議/對談、單向內容）

驗收項目：

- 模式切換會改變預設策略，不破壞既有 session。
- 模式設定不暴露底層 provider/model 細節給一般流程。

測試建議：

- Unit：模式路由函式輸入/輸出驗證。
- Integration：切換模式後開始錄音，觀察 store 配置是否符合預期。

### 7.2 顯示方式切換（原文/翻譯/雙語）

驗收項目：

- 切換只影響呈現，不覆寫原始 message 資料。
- translatedText 為空時要有可理解狀態提示。

測試建議：

- Unit：display selector 映射測試。
- Integration：同一組資料切換三種顯示方式，內容一致可追溯。

### 7.3 完整紀錄包匯出（關鍵）

驗收項目：

- `Record Package` 匯出會產生兩個檔案：`record-*.md` 與 `transcript-*.md`。
- 模板化紀錄稿檔案不應包含逐字稿附錄。
- 模板輸出失敗時，不得影響逐字稿獨立匯出能力。

測試建議：

- Unit：export service 雙檔案命名與內容結構測試。
- Integration：模板流程完成後檢查兩個檔案都成功觸發下載。
- Manual：使用真實語料驗證模板內容可讀性。

### 7.4 模板模組化與 LLM 生成

驗收項目：

- 模板來源必須來自 `templates/records/*.md`。
- 新增模板檔後可被匯出流程載入（重啟 dev server 後可見）。
- LLM 生成紀錄稿時必須使用選定模板內容作為指令。
- LLM 生成輸入包含 speaker 標記，便於會後整理角色責任。

### 7.6 Speaker A/B/C（A 方案）

驗收項目：

- 對談模式下，message 能產生 `speakerLabel`。
- 設定頁可開關 speaker 功能；關閉時不應生成 `speakerLabel`。
- 單向模式下，不產生 speaker 標記（避免無效計算）。
- 標準模式優先使用聲學特徵分群；即時模式可用停頓 fallback。
- speaker 推斷失敗時，不可阻塞 STT/翻譯主流程。

測試建議：

- Unit：`SpeakerDiarizationService`（固定窗長特徵、新 speaker、同 speaker、fallback）。
- Unit：`useAudio`（stop/pause 不丟段，speaker 欄位可寫入）。
- Manual：雙人對談樣本驗證 speaker 切換可讀性。

測試建議：

- Unit：`RecordTemplateService` 模板清單解析測試。
- Integration：選擇不同模板時，生成結果標題或章節結構應有差異。

### 7.5 本機設定檔自動同步

驗收項目：

- 在設定頁儲存 API Key 後，`config/local/app.local.yaml` 會被更新。
- 重啟網頁後，會自動從本機設定檔回填 API Key 與設定。

測試建議：

- Unit：`LocalConfigService` 載入/儲存錯誤處理。
- Manual：重啟 dev server 驗證設定回填行為。

---

## 8. 非功能測試需求

### 8.1 效能

- pending 高峰可觀測，停止後可回歸 0。
- 大量訊息下表格渲染不明顯卡頓（已有限制 `MAX_RENDER_ROWS`）。

### 8.2 穩定性

- 連續 start/pause/resume/stop 不出現狀態機錯亂。
- realtime 失敗可回退 standard 路徑。

### 8.3 安全

- 測試不將真實 API key 寫入 repo 或測試快照。
- key 相關測試使用 dummy 字串。

---

## 9. 手動驗證清單（每次發版前）

1. standard 模式可收音、可出字、可停止。
2. realtime 模式可取得 token、可出字、可停止。
3. 翻譯關閉模式下只顯示原文，無誤導訊息。
4. 匯出 markdown/txt 成功，內容可讀。
5. `npm test` 全數通過。
6. `npm run build` 成功。

---

## 10. 缺口與補強順序

### P0

- 新增「完整紀錄包」的單元與整合測試。
- 新增模式收斂後的路由測試。

### P1

- 補 integration tests（建議 `tests/integration/`）。
- 補模板選擇流程的互動測試。

### P2

- 規劃 E2E（麥克風權限、長會議、匯出下載）。

---

## 11. Definition of Done（測試視角）

一項需求可視為完成，必須同時滿足：

- 對應的單元測試存在且可失敗。
- 影響主流程時有至少一個整合或手動驗證證據。
- 不破壞既有 `npm test` 與 `npm run build`。
- SDD/TDD 文件同步更新。
