# OmniTranslate 測試計畫（現況精簡版）

## 文件資訊

| 項目 | 內容 |
|------|------|
| 文件版本 | 2.0 |
| 更新日期 | 2026-05-16 |
| 文件狀態 | 現況版（精簡） |
| 說明 | 本文件只保留目前專案中已存在、可執行的測試 |

---

## 1. 測試範圍

目前正式自動化測試範圍為：
- Vitest 單元測試（tests/unit）

目前不納入：
- 整合測試（tests/integration，目錄不存在）
- E2E 測試（tests/e2e，目錄不存在）

---

## 2. 測試執行方式

在專案根目錄執行：

- npm test
- npm run test:watch
- npm run test:coverage

---

## 3. 現有測試清單（實際存在）

| 測試檔案 | 驗證主題 | 現況 |
|----------|----------|------|
| tests/unit/ContextManager.test.ts | 滾動上下文組裝與截斷 | 已啟用 |
| tests/unit/CryptoService.test.ts | key 編碼/解碼與格式檢查 | 已啟用 |
| tests/unit/ExportService.test.ts | Markdown 匯出格式 | 已啟用 |
| tests/unit/formatters.test.ts | 時間與字串格式化工具 | 已啟用 |
| tests/unit/constants.test.ts | 模型常數清單完整性 | 已啟用 |
| tests/unit/RealtimeWebRTCEngine.test.ts | Realtime 主執行引擎（WebRTC）行為 | 已啟用 |
| tests/unit/useAudio.test.ts | 錄音分支與 realtime fallback 行為 | 已啟用 |
| tests/unit/RealtimeEngine.test.ts | RealtimeEngine 行為（legacy） | 已啟用（舊路徑回歸保護） |

---

## 4. 一致性檢查（重要）

### 4.1 目前執行主路徑

realtime 模式目前由 RealtimeWebRTCEngine 驅動（useAudio 實際建立此類別）。

### 4.2 目前測試主體

realtime 主路徑測試檔為 tests/unit/RealtimeWebRTCEngine.test.ts，與執行路徑一致。

### 4.3 風險

- legacy RealtimeEngine 尚存在，未來若確定停用，需同步移除 legacy 測試與型別依賴。

---

## 5. 建議調整（與執行一致）

優先順序：

1. 已完成
- 新增 RealtimeWebRTCEngine 單元測試並覆蓋核心事件與生命週期
- 補齊 useAudio 分支測試（standard / realtime / fallback）
- RealtimeEngine.test.ts 已改為 legacy 定位

2. 後續可選
- 若最終停用 RealtimeEngine.ts，移除對應 legacy 測試與相依

---

## 6. 手動驗證清單（現況必做）

每次涉及音訊/Realtime 變更，至少執行：

1. standard 模式
- 可開始錄音
- 可產生英文/中文欄位
- pendingCount 可歸零

2. openai-realtime 模式
- 可成功取得 /realtime-token
- 可收到 transcript 並進入翻譯
- 錯誤時可顯示 realtime_error 並正確停止或回退

3. 基本回歸
- npm test 全數通過
- npm run build 成功

---

## 7. 驗收基準（現況）

本測試計畫的最低驗收標準：

- 現有 tests/unit 全部通過
- 文件描述與實際測試檔案一致
- Realtime 測試主體與執行主路徑一致（下一版調整目標）
