import { useEffect, useState } from 'react'
import { Button } from '../shared/Button'
import { ExportSession } from '../../types'
import { ExportService } from '../../services/ExportService'
import { RecordTemplateDefinition, RecordTemplateService } from '../../services/RecordTemplateService'
import { RecordGenerationService } from '../../services/RecordGenerationService'
import { TranscriptRepairService } from '../../services/TranscriptRepairService'
import { useConfigStore } from '../../store/ConfigStore'

interface ExportModalProps {
  session: ExportSession
  onClose: () => void
  onConfirm: () => void
}

const FALLBACK_TEMPLATES: RecordTemplateDefinition[] = [
  {
    id: 'standard',
    name: '標準紀錄',
    content: '請整理為標準會議紀錄：摘要、重點、待辦、風險。輸出繁體中文。',
  },
  {
    id: 'action_items',
    name: '決策 / 待辦版',
    content: '請整理為決策與待辦清單：決策、任務、負責人、期限、阻塞。輸出繁體中文。',
  },
  {
    id: 'client',
    name: '客戶溝通版',
    content: '請整理為對客戶可閱讀紀錄：目標共識、需求回覆、後續行動、待確認事項。輸出繁體中文。',
  },
  {
    id: 'learning',
    name: '學習摘要版',
    content: '請整理為學習筆記：核心觀念、術語定義、練習建議、待釐清問題。輸出繁體中文。',
  },
]

export function ExportModal({ session, onClose, onConfirm }: ExportModalProps) {
  const count = session.messages.length
  const { config, getProviderConfig } = useConfigStore()
  const [templates, setTemplates] = useState<RecordTemplateDefinition[]>([])
  const [templateId, setTemplateId] = useState(config.defaultRecordTemplate)
  const [isGenerating, setIsGenerating] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [repairedTranscript, setRepairedTranscript] = useState('')

  useEffect(() => {
    void (async () => {
      try {
        const loaded = await RecordTemplateService.list()
        const chosen = loaded.length > 0 ? loaded : FALLBACK_TEMPLATES
        setTemplates(chosen)
        if (!chosen.some((item) => item.id === templateId)) {
          setTemplateId(chosen[0].id)
        }
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err)
        setTemplates(FALLBACK_TEMPLATES)
        setErrorMsg(`模板載入失敗，已改用內建模板：${detail}`)
      }
    })()
  }, [])

  const selectedTemplate = templates.find((item) => item.id === templateId) ?? null

  const getRepairedTranscript = async (): Promise<string> => {
    if (repairedTranscript.trim()) return repairedTranscript.trim()
    const { apiKey, apiBase } = getProviderConfig()
    if (!apiKey || apiKey.length < 10) {
      throw new Error('尚未設定有效 API Key，請先到設定頁完成。')
    }
    const repaired = await TranscriptRepairService.repair({
      session,
      apiKey,
      apiBase,
      llmModel: config.modelSettings.llmModel,
    })
    setRepairedTranscript(repaired)
    return repaired
  }

  const handleExportMarkdown = async () => {
    try {
      setIsGenerating(true)
      setErrorMsg('')
      const repaired = await getRepairedTranscript()
      ExportService.exportAsMarkdown(session, repaired)
      onConfirm()
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      setErrorMsg(`逐字稿修復失敗：${detail}`)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleExportTxt = async () => {
    try {
      setIsGenerating(true)
      setErrorMsg('')
      const repaired = await getRepairedTranscript()
      ExportService.exportAsTxt(session, repaired)
      onConfirm()
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      setErrorMsg(`逐字稿修復失敗：${detail}`)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleExportRecordPackage = async () => {
    if (!selectedTemplate) {
      setErrorMsg('尚未載入模板，請稍後再試。')
      return
    }
    try {
      setIsGenerating(true)
      setErrorMsg('')
      const { apiKey, apiBase } = getProviderConfig()
      if (!apiKey || apiKey.length < 10) {
        setErrorMsg('尚未設定有效 API Key，請先到設定頁完成。')
        return
      }
      const repaired = await getRepairedTranscript()

      const templatedContent = await RecordGenerationService.generate({
        session,
        templateName: selectedTemplate.name,
        templateInstruction: selectedTemplate.content,
        repairedTranscript: repaired,
        apiKey,
        apiBase,
        llmModel: config.modelSettings.llmModel,
      })

      ExportService.exportRecordPackage(session, templatedContent, selectedTemplate.name, repaired)
      onConfirm()
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      setErrorMsg(`生成紀錄稿失敗：${detail}`)
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-2xl p-6 flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-gray-800">會後匯出</h2>
        <p className="text-sm text-gray-600">共 {count} 筆內容。你可以先匯出逐字稿，或直接匯出完整紀錄包（包含逐字稿附錄）。</p>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-gray-200 p-4">
            <h3 className="mb-2 text-sm font-semibold text-gray-800">匯出逐字稿</h3>
            <p className="mb-3 text-xs text-gray-500">匯出前會先用會議修復 Prompt 清理噪訊與語義，再輸出逐字稿。</p>
            <div className="flex flex-col gap-2">
              <Button onClick={() => { void handleExportMarkdown() }} disabled={isGenerating}>
                {isGenerating ? '修復中…' : '📄 下載逐字稿（.md）'}
              </Button>
              <Button variant="ghost" onClick={() => { void handleExportTxt() }} disabled={isGenerating}>
                📝 下載逐字稿（.txt）
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <h3 className="mb-2 text-sm font-semibold text-blue-800">匯出完整紀錄包</h3>
            <p className="mb-3 text-xs text-blue-700">會輸出兩個檔案：模板化紀錄稿 + 逐字稿（分開檔案）。</p>

            <label className="mb-1 block text-xs font-medium text-blue-800">模板</label>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="mb-3 w-full rounded-lg border border-blue-200 bg-white px-2 py-2 text-xs"
            >
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
              ))}
            </select>

            <p className="mb-3 rounded bg-white px-2 py-2 text-xs text-gray-600">
              模板內容來源：`templates/records/*.md`，你可線下自行新增或修改。
            </p>
            {errorMsg && (
              <p className="mb-2 rounded bg-red-50 px-2 py-1 text-xs text-red-600">{errorMsg}</p>
            )}
            <Button onClick={() => { void handleExportRecordPackage() }} disabled={isGenerating || templates.length === 0}>
              {isGenerating ? '修復與生成中…' : '📦 匯出 Record Package（2 檔）'}
            </Button>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onConfirm}>
            略過，不導出
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            取消（返回）
          </Button>
        </div>
      </div>
    </div>
  )
}
