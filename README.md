# OmniTranslate 網頁即時語音轉文字與翻譯

## 1. 這個專案是什麼
OmniTranslate 是一個在瀏覽器運作的語音轉文字工具，專注在「會中不中斷、會後可交付」。

你只要打開網頁、按下開始、對著麥克風說話，系統會把語音轉成文字，並可同步輸出翻譯內容。  
整套流程不需要安裝桌面軟體，適合快速上手與團隊內部落地。

---

## 2. 專案解決的問題
- 會議中常常來不及做筆記，重點容易漏掉。
- 跨語言討論時，聽懂但記不全，會後整理很耗時。
- 市面工具很多偏「轉寫」，但缺少「模板化交付」與可維護的 Prompt/Template 架構。

OmniTranslate 的目標是把「語音輸入」直接變成「逐字稿 + 可交付紀錄包」。

---

## 3. 使用情境
- 會議 / 對談記錄：內部討論、客戶會議、訪談。
- 單向內容記錄：課堂、演講、培訓、研習。

---

## 4. 主要功能
- 🎙️ **自動偵測說話**：不需要手動反覆按按鈕，當你開始說話就會自動收音，停頓時便會自動送出並開始翻譯。
- ⚡ **多種轉錄模式**：提供「一般轉錄 (REST)」與「低延遲即時轉錄 (WebRTC)」模式，滿足不同情境的速度與穩定性需求。
- 🌐 **即時中英翻譯**：可顯示原文 / 翻譯 / 雙語，也可關閉翻譯只保留原文以降低成本與延遲。
- 📋 **對話紀錄匯出**：支援逐字稿匯出（`.md` / `.txt`）與 Record Package 雙檔輸出（模板化紀錄稿 + 逐字稿）。
- ⚙️ **支援多引擎切換**：可依個人喜好，自由選擇並切換使用 Groq 或是 OpenAI 的人工智慧來進行辨識與翻譯。
- 模板可模組化維護（`templates/records/`）。
- 逐字稿修復 Prompt 可直接編修（`prompts/system/transcript-repair.md`）。

說明：
- `Speaker A/B/C` 為輕量辨識能力，預設關閉，主要用於輔助閱讀，不建議視為法務等級歸屬判定。

---

## 5. 安裝與啟動

需求：
- Node.js 20+

```bash
git clone https://github.com/r5xb2/omni-translate.git
cd omni-translate
npm install
npm run dev
```

開啟 `http://localhost:5173`

---

## 6. 設定方式

### 6.1 網頁設定（建議）
在右下角 `設定` 視窗中可設定：
- Provider（Groq / OpenAI）
- STT 模型 / LLM 模型
- 模式（會議/對談記錄、單向內容記錄）
- 顯示（原文 / 翻譯 / 雙語）
- Speaker 辨識開關（預設關閉）

### 6.2 本機設定檔（自動回填）
系統會同步設定到：
- `config/local/app.local.yaml`

用途：
- 重開機或重啟服務後，自動回填 API Key 與主要設定。

注意：
- `config/local/` 內含敏感資訊，已在 `.gitignore` 排除，不會上傳 GitHub。

---

## 7. 操作流程（最短路徑）
1. 打開網頁，先進入 `設定` 填入 API Key。  
2. 按 `開始`，允許瀏覽器使用麥克風。  
3. 語音會自動分段並顯示在表格。  
4. 需要暫停可按 `暫停`，繼續按 `繼續`。  
5. 會議結束按 `停止`，選擇匯出逐字稿或 Record Package。  

---

## 8. 匯出規則

### 8.1 匯出逐字稿
- `transcript-*.md`
- `transcript-*.txt`

### 8.2 匯出 Record Package
會一次輸出兩個檔案：
- `record-*.md`（模板化紀錄稿）
- `transcript-*.md`（逐字稿）

---

## 9. 本機 / 沙箱兩種執行指令流程（固定章節）

### 9.1 本機（一般終端）
```bash
npm install
npm run dev
npm test
npm run build
```

### 9.2 沙箱（受限環境，例如 Codex sandbox）
優先使用專案內二進位，避免全域 npm/node 路徑差異：

```powershell
.\node_modules\.bin\vite.cmd
.\node_modules\.bin\vitest.cmd run
.\node_modules\.bin\vite.cmd build
```

若出現：
- `Cannot read directory "../../..": Access is denied.`
- `failed to load config from .../vite.config.ts`

通常是 ACL/沙箱限制，請改在允許提權的環境重跑同一指令。

---

## 10. 常用指令
```bash
# TypeScript 檢查
node .\node_modules\typescript\bin\tsc -p tsconfig.json --noEmit
node .\node_modules\typescript\bin\tsc -p tsconfig.node.json --noEmit

# 單元測試 / Build
npm test
npm run build

# 清理臨時檔（只清 temp/）
npm run clean:temp
```

---

## 11. 專案結構
```text
src/                 前端程式（UI、store、services、hooks）
config/              defaults/profile 設定
config/local/        本機設定檔（含 API Key，不進版控）
prompts/             system/user prompt 模組
templates/records/   紀錄模板（可自訂）
docs/                SDD / TDD / 設計文件
tests/               單元測試
scripts/             維運與清理腳本
temp/                臨時驗證輸出專用區
```

---

## 12. 文件入口
- [SDD](docs/SDD.md)
- [TDD](docs/TDD.md)

---

## 13. 安全聲明
- 專案不會將錄音原始檔長期存到專案目錄。
- API Key 可存在瀏覽器 LocalStorage 與 `config/local/app.local.yaml`。
- 請勿在共享或公用電腦保留本機設定檔。
