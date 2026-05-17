import { useEffect, useState } from 'react'
import { useConfigStore } from '../../store/ConfigStore'
import { CryptoService } from '../../services/CryptoService'
import { GroqService } from '../../services/GroqService'
import { RecordTemplateService } from '../../services/RecordTemplateService'
import { Button } from '../shared/Button'
import { Input } from '../shared/Input'
import {
  GROQ_STT_MODELS, GROQ_LLM_MODELS,
  OPENAI_STT_MODELS, OPENAI_LLM_MODELS,
  GROQ_API_BASE, OPENAI_API_BASE,
  OPENAI_REALTIME_MODELS,
  INTERACTION_MODE_OPTIONS,
  RECORD_TEMPLATE_OPTIONS,
} from '../../utils/constants'
import { ApiProvider, SttMode } from '../../types'

interface SettingModalProps {
  onClose: () => void
}

export function SettingModal({ onClose }: SettingModalProps) {
  const {
    config, getApiKey, setApiKey,
    getOpenAiKey, setOpenAiKey,
    updateConfig, clearConfig,
    persistToLocalConfig,
  } = useConfigStore()

  const [provider, setProvider] = useState<ApiProvider>(config.provider ?? 'groq')
  const [groqKeyInput, setGroqKeyInput] = useState('')
  const [openaiKeyInput, setOpenaiKeyInput] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testState, setTestState] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')
  const [testMsg, setTestMsg] = useState('')

  const sttModels = provider === 'openai' ? OPENAI_STT_MODELS : GROQ_STT_MODELS
  const llmModels = provider === 'openai' ? OPENAI_LLM_MODELS : GROQ_LLM_MODELS

  const savedStt = config.modelSettings.sttModel
  const savedLlm = config.modelSettings.llmModel
  const [groqSttModel, setGroqSttModel] = useState(() =>
    GROQ_STT_MODELS.some((m) => m.value === savedStt) ? savedStt : GROQ_STT_MODELS[0].value,
  )
  const [openaiSttModel, setOpenaiSttModel] = useState(() =>
    OPENAI_STT_MODELS.some((m) => m.value === savedStt) ? savedStt : OPENAI_STT_MODELS[0].value,
  )
  const [groqLlmModel, setGroqLlmModel] = useState(() =>
    GROQ_LLM_MODELS.some((m) => m.value === savedLlm) ? savedLlm : GROQ_LLM_MODELS[0].value,
  )
  const [openaiLlmModel, setOpenaiLlmModel] = useState(() =>
    OPENAI_LLM_MODELS.some((m) => m.value === savedLlm) ? savedLlm : OPENAI_LLM_MODELS[0].value,
  )

  const sttModel = provider === 'openai' ? openaiSttModel : groqSttModel
  const setSttModel = provider === 'openai' ? setOpenaiSttModel : setGroqSttModel
  const llmModel = provider === 'openai' ? openaiLlmModel : groqLlmModel
  const setLlmModel = provider === 'openai' ? setOpenaiLlmModel : setGroqLlmModel

  const [interactionMode, setInteractionMode] = useState(config.interactionMode)
  const [defaultRecordTemplate, setDefaultRecordTemplate] = useState(config.defaultRecordTemplate)
  const [recordTemplateOptions, setRecordTemplateOptions] = useState<{ value: string; label: string }[]>(
    RECORD_TEMPLATE_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label })),
  )

  const [sttMode, setSttMode] = useState<SttMode>(() => config.sttMode ?? 'standard')
  const [realtimeModel, setRealtimeModel] = useState(() => config.realtimeModel ?? OPENAI_REALTIME_MODELS[0].value)
  const [speakerDiarizationEnabled, setSpeakerDiarizationEnabled] = useState(config.speakerDiarizationEnabled)
  const [enableTranslation, setEnableTranslation] = useState(config.enableTranslation)
  const [sttLanguageHint, setSttLanguageHint] = useState(config.sttLanguageHint ?? 'auto')
  const [sttPrompt, setSttPrompt] = useState(config.sttPrompt ?? '')
  const [zhPunctuationRepairEnabled, setZhPunctuationRepairEnabled] = useState(config.zhPunctuationRepairEnabled)
  const [zhPunctuationMinChars, setZhPunctuationMinChars] = useState(config.zhPunctuationMinChars)
  const [vadSilenceMs, setVadSilenceMs] = useState(config.vadSilenceMs)
  const [vadMaxDurationMs, setVadMaxDurationMs] = useState(config.vadMaxDurationMs)
  const [sttPromptAdvancedOpen, setSttPromptAdvancedOpen] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        const templates = await RecordTemplateService.list()
        if (templates.length === 0) return
        setRecordTemplateOptions(templates.map((tpl) => ({ value: tpl.id, label: tpl.name })))
      } catch {
        // ignore and use fallback options
      }
    })()
  }, [])

  const hasGroqKey = Boolean(getApiKey()) || Boolean(groqKeyInput)
  const hasOpenAiKey = Boolean(getOpenAiKey()) || Boolean(openaiKeyInput)

  const handleSave = () => {
    if (groqKeyInput) setApiKey(groqKeyInput)
    if (openaiKeyInput) setOpenAiKey(openaiKeyInput)
    updateConfig({
      provider,
      modelSettings: { sttModel, llmModel },
      interactionMode,
      defaultRecordTemplate,
      sttMode,
      realtimeModel,
      speakerDiarizationEnabled,
      enableTranslation,
      sttLanguageHint,
      sttPrompt,
      zhPunctuationRepairEnabled,
      zhPunctuationMinChars,
      vadSilenceMs,
      vadMaxDurationMs,
    })
    void persistToLocalConfig()
    setSaved(true)
    setTimeout(() => {
      setSaved(false)
      onClose()
    }, 700)
  }

  const handleTest = async () => {
    const keyToTest = provider === 'openai'
      ? (openaiKeyInput || getOpenAiKey())
      : (groqKeyInput || getApiKey())
    const apiBase = provider === 'openai' ? OPENAI_API_BASE : GROQ_API_BASE

    if (!keyToTest) {
      setTestState('fail')
      setTestMsg('❌ 請先輸入 API Key')
      return
    }
    setTestState('testing')
    setTestMsg('')
    const result = await GroqService.testConnection(keyToTest, apiBase)
    setTestState(result.ok ? 'ok' : 'fail')
    setTestMsg(result.message)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-2xl p-6 flex flex-col gap-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">設定</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <div className="rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2 text-xs text-yellow-800">
          ⚠ API Key 會儲存在瀏覽器 LocalStorage，並同步到本機設定檔 `config/local/app.local.yaml`。請勿在公用電腦使用。
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">使用模式</label>
            <select
              value={interactionMode}
              onChange={(e) => setInteractionMode(e.target.value as typeof interactionMode)}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs outline-none focus:border-blue-500"
            >
              {INTERACTION_MODE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">預設紀錄模板</label>
            <select
              value={defaultRecordTemplate}
              onChange={(e) => setDefaultRecordTemplate(e.target.value as typeof defaultRecordTemplate)}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs outline-none focus:border-blue-500"
            >
              {recordTemplateOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
            主畫面可即時切換顯示模式（原文/翻譯/雙語）
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">API 提供商</label>
          <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
            {(['groq', 'openai'] as ApiProvider[]).map((p) => (
              <button
                key={p}
                onClick={() => { setProvider(p); setTestState('idle'); setTestMsg('') }}
                className={`flex-1 py-2 font-medium transition-colors ${
                  provider === p ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {p === 'groq' ? 'GROQ（LPU）' : 'OpenAI'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">
            {provider === 'groq' ? 'GROQ' : 'OpenAI'} API Key
            {provider === 'groq' && hasGroqKey && <span className="ml-2 text-green-600">✓ 已設定</span>}
            {provider === 'openai' && hasOpenAiKey && <span className="ml-2 text-green-600">✓ 已設定</span>}
          </label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={provider === 'groq' ? groqKeyInput : openaiKeyInput}
              onChange={(e) => provider === 'groq' ? setGroqKeyInput(e.target.value) : setOpenaiKeyInput(e.target.value)}
              placeholder={(provider === 'groq' ? hasGroqKey : hasOpenAiKey) ? '（留空不更改）' : provider === 'groq' ? 'gsk_...' : 'sk-...'}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showKey ? '🙈' : '👁'}
            </button>
          </div>
          {provider === 'groq' && groqKeyInput && !CryptoService.isValidGroqKey(groqKeyInput) && (
            <span className="text-xs text-red-500">GROQ Key 格式不正確（應以 gsk_ 開頭）</span>
          )}
          <button
            type="button"
            onClick={() => { void handleTest() }}
            disabled={testState === 'testing'}
            className="mt-1 self-start rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
          >
            {testState === 'testing' ? '測試中…' : '🔌 測試連線'}
          </button>
          {testMsg && (
            <span className={`text-xs ${testState === 'ok' ? 'text-green-600' : 'text-red-600'}`}>{testMsg}</span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">語音辨識模式</label>
            <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
              {([
                { value: 'standard', label: '標準模式' },
                { value: 'openai-realtime', label: '即時模式' },
              ] as { value: SttMode; label: string }[]).map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setSttMode(m.value)}
                  className={`flex-1 py-2 text-xs font-medium transition-colors ${
                    sttMode === m.value ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">Realtime 模型（即時模式用）</label>
            <select
              value={realtimeModel}
              onChange={(e) => setRealtimeModel(e.target.value)}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs outline-none focus:border-blue-500"
              disabled={sttMode !== 'openai-realtime'}
            >
              {OPENAI_REALTIME_MODELS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">語音辨識模型（STT）</label>
            <select
              value={sttModel}
              onChange={(e) => setSttModel(e.target.value)}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs outline-none focus:border-blue-500"
            >
              {sttModels.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">翻譯模型（LLM）</label>
            <select
              value={llmModel}
              onChange={(e) => setLlmModel(e.target.value)}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs outline-none focus:border-blue-500"
            >
              {llmModels.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 bg-gray-50">
            <div>
              <p className="text-sm font-medium text-gray-800">講者辨識（Speaker A/B/C）</p>
              <p className="text-xs text-gray-500">對談模式可切換，建議多人會議再開啟</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={speakerDiarizationEnabled}
              onClick={() => setSpeakerDiarizationEnabled((v) => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${speakerDiarizationEnabled ? 'bg-blue-600' : 'bg-gray-300'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${speakerDiarizationEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 bg-gray-50">
            <div>
              <p className="text-sm font-medium text-gray-800">啟用翻譯（LLM）</p>
              <p className="text-xs text-gray-500">關閉後只做 STT（可保留標點修復）</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enableTranslation}
              onClick={() => setEnableTranslation((v) => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${enableTranslation ? 'bg-blue-600' : 'bg-gray-300'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${enableTranslation ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 bg-gray-50">
            <div>
              <p className="text-sm font-medium text-gray-800">中文標點修復</p>
              <p className="text-xs text-gray-500">啟用後使用 LLM 修復中文標點</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={zhPunctuationRepairEnabled}
              onClick={() => setZhPunctuationRepairEnabled((v) => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${zhPunctuationRepairEnabled ? 'bg-blue-600' : 'bg-gray-300'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${zhPunctuationRepairEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">STT 語言提示</label>
            <select
              value={sttLanguageHint}
              onChange={(e) => setSttLanguageHint(e.target.value)}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs outline-none focus:border-blue-500"
            >
              <option value="auto">auto（自動）</option>
              <option value="zh">zh</option>
              <option value="en">en</option>
              <option value="ja">ja</option>
            </select>
          </div>
          <Input
            label={`中文標點修復最小字數：${zhPunctuationMinChars}`}
            type="range"
            min={1}
            max={20}
            step={1}
            value={zhPunctuationMinChars}
            onChange={(e) => setZhPunctuationMinChars(Number(e.target.value))}
            className="accent-blue-600"
          />
        </div>

        <Input
          label={`靜音斷句閾值：${vadSilenceMs} ms（越小越敏感）`}
          type="range"
          min={200}
          max={2000}
          step={100}
          value={vadSilenceMs}
          onChange={(e) => setVadSilenceMs(Number(e.target.value))}
          className="accent-blue-600"
        />

        <Input
          label={`語音段落最大長度：${vadMaxDurationMs} ms`}
          type="range"
          min={5000}
          max={40000}
          step={1000}
          value={vadMaxDurationMs}
          onChange={(e) => setVadMaxDurationMs(Number(e.target.value))}
          className="accent-blue-600"
        />

        <button
          type="button"
          onClick={() => setSttPromptAdvancedOpen((v) => !v)}
          className="self-start rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
        >
          {sttPromptAdvancedOpen ? '收合術語提示' : '展開術語提示（STT Prompt）'}
        </button>

        {sttPromptAdvancedOpen && (
          <div className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-gray-50 p-4">
            <label className="text-xs font-medium text-gray-600">STT Prompt（專有名詞/術語）</label>
            <textarea
              rows={3}
              value={sttPrompt}
              onChange={(e) => setSttPrompt(e.target.value)}
              placeholder="可輸入專有名詞，例如：OmniTranslate, NVMe, GPT-4o"
              className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-mono outline-none focus:border-blue-500 resize-none"
            />
          </div>
        )}

        <div className="flex justify-between pt-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (confirm('確定要清除所有設定（包含 API Key）？')) clearConfig()
            }}
          >
            清除設定
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>取消</Button>
            <Button onClick={handleSave} disabled={saved}>
              {saved ? '已儲存 ✓' : '儲存'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
