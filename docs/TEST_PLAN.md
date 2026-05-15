# OmniTranslate-GROQ 完整驗證計畫（Verification & Validation Plan）

## 文件資訊

| 項目 | 內容 |
|------|------|
| 文件版本 | 1.1 |
| 建立日期 | 2026-05-15 |
| 對應 SDD 版本 | 1.2 |
| 對應 PRD 版本 | 1.0 |
| 文件狀態 | 草稿 |
| 變更摘要 | Phase 3：新增 useAudio / pendingCount / enableTranslation / withRetry / capturedEndAt 測試案例 |

---

## 1. 測試策略總覽

### 1.1 測試層次架構

```
E2E Tests（Playwright）         ← 完整使用者流程驗證
        ↑
Integration Tests（Vitest）     ← 模組間互動（Mock GROQ API）
        ↑
Unit Tests（Vitest）            ← 純函式與類別邏輯
        ↑
Static Analysis（ESLint + TypeScript strict mode）
```

### 1.2 測試工具選型

| 工具 | 用途 | 版本 |
|------|------|------|
| Vitest | 單元測試、整合測試 | 最新穩定 |
| `@testing-library/react` | React 組件測試 | 最新穩定 |
| Playwright | E2E 瀏覽器自動化測試 | 最新穩定 |
| MSW（Mock Service Worker） | Mock GROQ API HTTP 請求 | 最新穩定 |

### 1.3 覆蓋率目標

| 模組 | 目標行覆蓋率 | 說明 |
|------|-------------|------|
| `services/` | ≥ 80% | 核心邏輯，優先保障 |
| `store/` | ≥ 75% | 狀態機邏輯 |
| `components/` | ≥ 60% | 以 E2E 補充 |
| `utils/` | ≥ 90% | 純函式，易達成 |

### 1.4 PRD 驗收標準對照索引

| PRD §12.2 驗收條件 | 對應測試案例 |
|--------------------|-------------|
| 支援從無到有的完整設定流程 | E2E-001 |
| 重開瀏覽器後設定保留 | E2E-002 |
| 斷句邏輯在 70dB 背景噪音下正常運作 | UT-AE-001、PERF-003 |
| 成功導出 Markdown 格式會議記錄 | E2E-004、UT-EX-001 |
| 通過安全性稽核，確認 API Key 未傳至第三方伺服器 | SEC-001、SEC-003 |

---

## 2. 單元測試（Unit Tests）

### 2.1 ContextManager

**測試檔案**：`tests/unit/ContextManager.test.ts`

| 案例 ID | 描述 | 輸入條件 | 預期結果 | 驗證的業務邏輯 |
|---------|------|----------|----------|---------------|
| UT-CM-001 | 初始狀態下 buildMessages 無歷史 | Buffer 空，輸入 1 句話 | messages = `[system, user(current)]`，共 2 則 | Rolling Context 初始化正確 |
| UT-CM-002 | Buffer 未滿（N=3，maxSize=5） | Buffer 有 3 則，輸入 1 句話 | messages = `[system, user, assistant, user, assistant, user, assistant, user(current)]`，共 8 則 | Rolling Context 正確附加 |
| UT-CM-003 | Buffer 超過 maxSize 時自動截斷 | Buffer 有 8 則（maxSize=5），輸入 1 句話 | messages 中 history 只包含最後 5 則（10 個角色訊息）+ current | Rolling Context 截斷正確 |
| UT-CM-004 | `clear()` 後 Buffer 為空 | add 3 則 → clear() → buildMessages | messages = `[system, user(current)]` | Stop 後 Context 清空 |
| UT-CM-005 | System Prompt 正確插入第一則 | 任意輸入 | messages[0].role === 'system' | Prompt 組裝順序正確 |

### 2.2 AudioEngine

**測試檔案**：`tests/unit/AudioEngine.test.ts`

> 使用 `vi.mock('@ricky0123/vad-web')` Mock Silero VAD。

| 案例 ID | 描述 | 測試方法 | 預期結果 |
|---------|------|----------|----------|
| UT-AE-001 | `onSpeechEnd` 觸發後 Blob 正確傳出 | Mock VAD `onSpeechEnd(Float32Array)` → 驗證 callback 收到的 Blob size > 0 | Blob 正確傳出 |
| UT-AE-002 | `speechStartedAt` 在 `onSpeechStart` 時記錄 | Mock VAD → 觸發 `onSpeechStart`（記錄時間 T1）→ 觸發 `onSpeechEnd` → 驗證回呼的 `speechStartedAt` ≈ T1 | 時間戳記記錄時機正確（誤差 < 10ms） |
| UT-AE-003 | `speechEndedAt` 在 `onSpeechEnd` 時記錄 | 觸發 `onSpeechEnd`（記錄時間 T2）→ 驗證回呼的 `speechEndedAt` ≈ T2 | 段落結束時間正確 |
| UT-AE-004 | 強制切分 timer 在 `onSpeechStart` 後啟動 | `vi.useFakeTimers()`；觸發 `onSpeechStart` → 前進 `maxDurationMs` → 驗證 forceSlice 被呼叫 | 強制切分正常觸發 |
| UT-AE-005 | `onSpeechEnd` 觸發後 forceSlice timer 清除 | 觸發 `onSpeechStart` → 觸發 `onSpeechEnd` → 前進 `maxDurationMs` | ForceSlice callback 不被呼叫（timer 已清除） |
| UT-AE-006 | `destroy()` 後釋放資源 | 呼叫 `destroy()` → 驗證 VAD 的 `destroy()` 被呼叫 | 資源正確釋放 |

### 2.3 ExportService

**測試檔案**：`tests/unit/ExportService.test.ts`

| 案例 ID | 描述 | 輸入條件 | 預期結果 |
|---------|------|----------|----------|
| UT-EX-001 | Markdown 表格標頭格式正確 | 任意 ExportSession | 輸出包含 `| # | 時間 | English | 中文 |` 與分隔線 |
| UT-EX-002 | 訊息內容 `|` 字元正確 escape | `originalText = "A | B"` | Markdown 輸出為 `A \| B` |
| UT-EX-003 | 空 Session 導出仍合法 | messages = [] | 輸出只有標頭，無內文列 |
| UT-EX-004 | TXT 導出格式正確 | 3 則 Message | 每列格式為 `[HH:MM:SS] English → 中文`，換行分隔 |
| UT-EX-005 | 時間戳記格式化正確 | timestamp = 0（00:00:00） | 輸出 `00:00:00` |

### 2.4 CryptoService

**測試檔案**：`tests/unit/CryptoService.test.ts`

| 案例 ID | 描述 | 預期結果 |
|---------|------|----------|
| UT-CS-001 | 加密後解密可還原原始 API Key | `decrypt(encrypt(key, pin), pin)` === key |
| UT-CS-002 | 錯誤的 PIN 解密應拋出錯誤 | `decrypt(ciphertext, wrongPin)` 拋出 `DOMException` |
| UT-CS-003 | 加密輸出不含明文 API Key | `JSON.stringify(encrypted)` 不包含原始 key 字串 |
| UT-CS-004 | 每次加密產生不同的 IV 與 Salt | 同一 key 加密兩次，IV 與 Salt 值不相同 |
| UT-CS-005 | `encodeFallback` 與 `decodeFallback` 互逆 | `decodeFallback(encodeFallback(str))` === str |

### 2.5 GroqService（新增，Phase 3）

**測試檔案**：`tests/unit/GroqService.test.ts`

> 使用 `vi.stubGlobal('fetch', ...)` Mock fetch。

| 案例 ID | 描述 | 輸入條件 | 預期結果 |
|---------|------|----------|----------|
| UT-GS-001 | `withRetry` 對 `RateLimitError` 執行指數退避重試 | 第 1-2 次 fetch 回 429，第 3 次回 200 | 最終成功；fetch 被呼叫 3 次 |
| UT-GS-002 | `withRetry` 對 `GroqServerError`（5xx）重試 | 第 1 次 fetch 回 503，第 2 次回 200 | 最終成功；fetch 被呼叫 2 次 |
| UT-GS-003 | `withRetry` 對 `TypeError`（網路中斷）重試 | 第 1 次 fetch 拋出 `TypeError: Failed to fetch`，第 2 次成功 | 最終成功；fetch 被呼叫 2 次 |
| UT-GS-004 | `InvalidKeyError`（401）不重試直接拋出 | fetch 回 401 | 拋出 `InvalidKeyError`；fetch 只呼叫 1 次 |
| UT-GS-005 | 非暫態錯誤不重試直接拋出 | fetch 回 400 Bad Request | 拋出對應錯誤；fetch 只呼叫 1 次 |
| UT-GS-006 | 超過最大重試次數拋出最後的錯誤 | 連續 3 次 429 | 拋出 `RateLimitError`；fetch 被呼叫 3 次 |

### 2.6 useAudio Hook（新增，Phase 3）

**測試檔案**：`tests/unit/useAudio.test.ts`

> 使用 `renderHook` + `vi.mock` Mock GroqService 和 AppStore。

| 案例 ID | 描述 | 輸入條件 | 預期結果 | 驗證的業務邏輯 |
|---------|------|----------|----------|---------------|
| UT-UA-001 | `handleSpeechEnd` 呼叫後 `addPending` 被呼叫 | 觸發 `handleSpeechEnd(blob, t1, t2)` | `addPending` 被呼叫 1 次 | Blob 入佇列時計數器正確增加 |
| UT-UA-002 | 處理完成後 `removePending` 被呼叫（成功路徑） | GroqService.transcribe 和 translate Mock 成功 | `removePending` 在 finally 中被呼叫 1 次 | 零遺失：成功時計數器歸零 |
| UT-UA-003 | 處理失敗後 `removePending` 被呼叫（失敗路徑） | GroqService.transcribe Mock 拋出錯誤 | `removePending` 仍在 finally 中被呼叫 1 次 | 零遺失：失敗時計數器也歸零 |
| UT-UA-004 | `enableTranslation=false` 時跳過 LLM | ConfigStore.config.enableTranslation = false | GroqService.translate 不被呼叫；Message status='completed'，translatedText='' | STT-only 模式正確 |
| UT-UA-005 | `enableTranslation=true` 時正常呼叫 LLM | ConfigStore.config.enableTranslation = true | GroqService.translate 被呼叫 1 次 | 翻譯模式正常 |
| UT-UA-006 | 多個 Blob 序列化處理（不並行） | 連續觸發 3 次 `handleSpeechEnd` | GroqService.transcribe 被依序呼叫 3 次，不重疊 | 佇列正確序列化 |

### 2.7 ConfigStore（Phase 3 補充）

**測試檔案**：`tests/unit/ConfigStore.test.ts`

| 案例 ID | 描述 | 預期結果 |
|---------|------|----------|
| UT-CFG-001 | 儲存設定後 LocalStorage 有對應 key | `updateConfig()` 後 `localStorage.getItem(STORAGE_KEY)` 不為 null |
| UT-CFG-002 | 讀取預設值（首次啟動） | `config.enableTranslation === true`，`config.vadSilenceMs === 500` |
| UT-CFG-003 | `clearConfig()` 清除 LocalStorage | 呼叫後 `localStorage.getItem(STORAGE_KEY)` 為 null |
| UT-CFG-004 | 舊版 LocalStorage（無 enableTranslation）向後相容 | 載入缺少 `enableTranslation` 的 JSON → `config.enableTranslation` 回傳 `true`（預設值） | 升級用戶不受影響 |

### 2.8 工具函式（utils）

**測試檔案**：`tests/unit/formatters.test.ts`

| 案例 ID | 描述 | 輸入 | 預期輸出 |
|---------|------|------|----------|
| UT-FMT-001 | `formatTimestamp(0)` | 0 ms | `'00:00:00'` |
| UT-FMT-002 | `formatTimestamp(3661000)` | 3661000 ms（1h 1m 1s） | `'01:01:01'` |

---

## 3. 整合測試（Integration Tests）

**測試策略**：使用 MSW（Mock Service Worker）攔截 `fetch` 請求，模擬 GROQ API 回應，無需真實 API Key。

**測試檔案**：`tests/integration/`

### 3.1 完整翻譯流程

| 案例 ID | 描述 | Mock 設定 | 驗證點 |
|---------|------|-----------|--------|
| IT-001 | 完整 STT → Translation 一次成功 | Whisper 回傳 `{ text: "Hello" }`；LLM 回傳 `{ content: "你好" }` | AppStore 內出現 `status: 'completed'` 的 Message，originalText='Hello'，translatedText='你好' |
| IT-002 | Whisper API 回傳 429，Backoff 後重試成功 | 第 1 次 429；第 2 次 200 | GroqService 重試一次，最終 Message 完成；UI 顯示「系統繁忙...」橫幅後消失 |
| IT-003 | LLM API 持續 429 超過最大重試次數 | 連續 3 次 429 | Message 最終 `status: 'error'`；不繼續無限重試 |
| IT-004 | 網路中斷（`NetworkError`） | fetch 拋出 `TypeError: Failed to fetch` | AppStore 中 Message status = 'error'；UI 顯示網路中斷橫幅 |
| IT-005 | Prompt 包含正確數量的上下文訊息 | Mock 攔截並記錄 request body | 送出的 `messages` 陣列中 history 為 2 × min(bufferSize, 5) 則 + system(1) + current(1) |
| IT-006 | 401 Invalid API Key 停止錄音並開啟設定 | Whisper 回傳 401 | AppStore 錄音狀態切換為 `stopped`；設定 Modal 自動開啟 |

### 3.2 狀態機流程

| 案例 ID | 描述 | 操作序列 | 驗證點 |
|---------|------|----------|--------|
| IT-007 | Pause 後 Resume 保留 Context | Start → 3 句翻譯 → Pause → Resume → 1 句翻譯 | 第 4 句的 Prompt 包含前 3 句的上下文 |
| IT-008 | Stop 後清空 AppStore | Start → 2 句翻譯 → Stop → 確認導出 | AppStore messages 陣列長度 = 0 |

---

## 4. E2E 測試（End-to-End Tests）

**測試工具**：Playwright  
**測試環境**：Chrome Headful（需使用 Playwright 的麥克風權限授予機制）  
**測試檔案**：`tests/e2e/`

### 4.1 設定與首次使用

| 案例 ID | 測試流程 | 通過標準 |
|---------|----------|----------|
| E2E-001 | 首次設定流程 | 進入頁面 → 點擊「設定」→ 輸入有效 API Key → 儲存 → API Key 輸入框顯示星號（`***`），不顯示明文 |
| E2E-002 | 重新整理後設定保留 | 輸入 API Key → 儲存 → `page.reload()` → 設定 Modal 中 API Key 欄位顯示已儲存（非空） |
| E2E-003 | 未設定 API Key 時 Start 顯示提示 | 直接點擊 Start（未輸入 Key） | 顯示「請先設定 API Key」錯誤提示，不啟動錄音 |

### 4.2 核心錄音翻譯流程

| 案例 ID | 測試流程 | 通過標準 |
|---------|----------|----------|
| E2E-004 | 三態按鈕狀態切換 | 點擊 Start → 驗證按鈕文字與顏色變化 → 點擊 Pause → 驗證 → 點擊 Stop | 每次狀態切換後 ARIA label 與按鈕樣式正確更新 |
| E2E-005 | 翻譯開關 toggle 儲存並影響錄音行為 | 設定 Modal → 關閉「啟用翻譯」→ 儲存 → 開始錄音（Mock STT 回傳文字）→ 驗證 Message | `translatedText` 為空，`status='completed'`，GroqService.translate 不被呼叫 |
| E2E-006 | pendingCount 徽章在錄音中顯示，處理完後消失 | 開始錄音 → 觸發 VAD → 觀察 Header 徽章 → 處理完成 | Header 出現「處理中 N」徽章後消失（pendingCount 歸零） |

### 4.3 導出功能

| 案例 ID | 測試流程 | 通過標準 |
|---------|----------|----------|
| E2E-006 | 導出 Markdown 觸發下載 | 停止錄音 → ExportModal 出現 → 選擇 Markdown → 點擊下載 | 瀏覽器觸發 `.md` 檔案下載（監聽 `page.waitForDownload`） |
| E2E-007 | 導出檔名包含日期 | 執行導出流程 | 下載檔名格式為 `meeting-YYYYMMDD-HHMMSS.md` |

### 4.4 錯誤處理 UI

| 案例 ID | 測試流程 | 通過標準 |
|---------|----------|----------|
| E2E-008 | 麥克風拒絕時顯示引導提示 | Mock 瀏覽器拒絕麥克風權限 → 點擊 Start | 顯示「請允許使用麥克風」提示，並有引導步驟說明 |

---

## 5. 效能測試（Performance Tests）

### 5.1 端到端延遲測試

| 案例 ID | 目標 | 測量方式 | 通過標準 |
|---------|------|----------|----------|
| PERF-001 | 單句翻譯端到端延遲 < 1.5s | Chrome DevTools Performance API：記錄從 `onSpeechEnd` 觸發到 `AppStore.addMessage` 完成的時間差 | p95 延遲 < 1,500 ms（含 GROQ 網路往返） |
| PERF-002 | VAD 偵測反應時間 < 200ms | Web Audio API 時鐘：記錄從靜音開始到 `onSpeechEnd` 觸發的時間差 | < 200 ms |

### 5.2 記憶體洩漏測試

| 案例 ID | 目標 | 測量方式 | 通過標準 |
|---------|------|----------|----------|
| PERF-003 | 180 分鐘連續使用無記憶體洩漏 | Playwright 模擬：每 2 秒觸發一次翻譯（共 5,400 次）；每 10 分鐘記錄 `performance.memory.usedJSHeapSize` | JS Heap 成長幅度 < 50 MB（與初始值相比） |
| PERF-004 | 音訊 Blob 正確釋放 | 傳送 Whisper 後，驗證 `URL.revokeObjectURL` 被呼叫 | Blob URL 數量不隨時間累積 |

### 5.3 效能測試注意事項

- PERF-001 的網路延遲受 GROQ 服務器位置影響，測試環境應記錄網路條件
- PERF-003 在 Mock API 環境下執行（移除網路等待時間以加速測試）
- 測試結果需記錄 Chrome 版本與作業系統

---

## 6. 安全測試（Security Tests）

| 案例 ID | 測試項目 | 測試方法 | 通過標準 |
|---------|----------|----------|----------|
| SEC-001 | API Key 不出現在後端日誌 | 在 Fastify 伺服器啟用詳細請求日誌，執行 10 次完整翻譯流程，檢查日誌輸出 | 日誌中完全找不到 API Key 字串 |
| SEC-002 | LocalStorage 無明文 API Key | DevTools → Application → LocalStorage，儲存 Key 後直接查看值 | 儲存值為密文或 Base64，非原始 API Key 字串 |
| SEC-003 | API Key 不出現在 XHR/Fetch 請求的 URL | Playwright 攔截所有 network requests，記錄 URL | 所有請求 URL 均不含 API Key 字串 |
| SEC-004 | XSS 防護：翻譯結果不執行 script | 將 `<script>alert(1)</script>` 設定為 Mock 翻譯回傳值 | React 自動 escape，UI 顯示原始字串，`alert` 不被執行 |
| SEC-005 | CORS：非允許來源被拒絕 | 從非白名單 Origin（如 `http://evil.com`）向 Node.js 後端發送 GET 請求 | 回傳 403 或無 `Access-Control-Allow-Origin` header |
| SEC-006 | API Key 輸入框預設為密碼模式 | 檢查 DOM：`input[type="password"]` | 輸入框 type 屬性為 `password` |

---

## 7. 相容性測試（Compatibility Tests）

| 案例 ID | 瀏覽器 / 環境 | 測試項目 | 通過標準 |
|---------|---------------|----------|----------|
| COMPAT-001 | Chrome 110+ | 完整翻譯流程 | 全功能正常 |
| COMPAT-002 | Edge 110+ | 完整翻譯流程 | 全功能正常 |
| COMPAT-003 | Firefox | 基本 UI 顯示 | Graceful degradation：顯示「建議使用 Chrome 或 Edge」提示 |
| COMPAT-004 | 筆電內建麥克風 | VAD 偵測靈敏度 | 靜音 1.5s 後正確觸發 |
| COMPAT-005 | USB 外接會議室麥克風 | VAD 偵測靈敏度 | 靜音 1.5s 後正確觸發 |

---

## 8. 測試執行計畫

### 8.1 各測試類型執行時機

| 時機 | 執行的測試 |
|------|-----------|
| 每次 `git commit` | Static Analysis（ESLint + TypeScript）|
| 每次 PR | 單元測試 + 整合測試 |
| 每次 Sprint 結束 | 單元測試 + 整合測試 + E2E 測試 |
| MVP 交付前（Week 4） | 所有測試 + 效能測試 + 安全測試 + 相容性測試 |

### 8.2 測試指令（規劃）

```bash
# 單元測試 + 整合測試
npm run test

# 含覆蓋率報告
npm run test:coverage

# E2E 測試（需啟動 dev server）
npm run test:e2e

# 效能測試（長時間，需手動執行）
npm run test:perf
```

### 8.3 測試失敗處理原則

- 單元測試失敗：**阻塞 PR merge**，開發者需當場修復
- E2E 測試失敗：若為環境問題（網路、瀏覽器版本），記錄並重跑一次；若連續兩次失敗，阻塞發布
- 效能測試失敗：建立 Bug 工單，在下一個 Sprint 前修復，不阻塞 MVP 交付

---

## 9. 測試資料管理

| 資料類型 | 管理方式 |
|----------|----------|
| Mock API Key | 使用固定的假字串 `gsk_test_mock_api_key_12345`，不使用真實 Key |
| Mock 音訊 Blob | 使用預錄的靜態 WAV 檔（`tests/fixtures/sample.wav`） |
| Mock GROQ 回應 | 定義於 `tests/mocks/groq-handlers.ts`（MSW handlers） |
| 效能基準值 | 記錄於 `tests/perf/baseline.json`，CI 可比對回歸 |

---

## 10. 驗收檢查清單（MVP 交付前）

> 所有項目需打勾才可宣告 MVP 完成。

### 功能面

- [ ] FR-001：API Key 輸入框預設隱藏，點擊眼睛可明文顯示
- [ ] FR-002：關閉並重開瀏覽器後，設定仍保留
- [ ] FR-003：ICT 技術 Prompt 預設載入，支援手動編輯
- [ ] FR-004：靜音 1.5 秒後自動觸發翻譯
- [ ] FR-004（Business Rule）：錄音達 30 秒時強制切分
- [ ] FR-005：Whisper STT 正確回傳英文逐字稿
- [ ] FR-006：「Force Submit」手動送出按鈕可用
- [ ] FR-007：每次 API 請求包含前 5 句上下文
- [ ] FR-008：使用 `llama-3.3-70b-versatile` 進行翻譯
- [ ] FR-009：Start / Pause / Stop 三態切換正確
- [ ] FR-010：英中對照表格並列顯示，時間戳記對齊

### 效能面

- [ ] PERF-001：單句翻譯 p95 延遲 < 1,500 ms（測試環境）
- [ ] PERF-002：VAD 反應時間 < 200 ms
- [ ] PERF-003：180 分鐘壓力測試 Heap 成長 < 50 MB

### 安全面

- [ ] SEC-001：後端日誌中無 API Key 字串
- [ ] SEC-002：LocalStorage 中無明文 API Key
- [ ] SEC-004：XSS 防護有效

### 導出面

- [ ] 成功下載 `.md` 格式的會議記錄，包含正確的 Markdown 表格
- [ ] 導出檔案中所有 Message 的 `|` 字元均正確 escape

---

*文件結尾 — OmniTranslate-GROQ 完整驗證計畫 v1.0*
