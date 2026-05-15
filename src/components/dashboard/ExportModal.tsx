import { Button } from '../shared/Button'
import { ExportSession } from '../../types'
import { ExportService } from '../../services/ExportService'

interface ExportModalProps {
  session: ExportSession
  onClose: () => void
  onConfirm: () => void
}

export function ExportModal({ session, onClose, onConfirm }: ExportModalProps) {
  const count = session.messages.length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-xl bg-white shadow-2xl p-6 flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-gray-800">會議結束，導出記錄</h2>
        <p className="text-sm text-gray-600">共 {count} 筆翻譯記錄，請選擇導出格式：</p>

        <div className="flex flex-col gap-2">
          <Button onClick={() => { ExportService.exportAsMarkdown(session); onConfirm() }}>
            📄 下載 Markdown（.md）
          </Button>
          <Button variant="ghost" onClick={() => { ExportService.exportAsTxt(session); onConfirm() }}>
            📝 下載純文字（.txt）
          </Button>
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
