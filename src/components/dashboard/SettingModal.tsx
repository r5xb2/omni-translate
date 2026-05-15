import { useState, useEffect } from 'react'
import { useConfigStore } from '../../store/ConfigStore'
import { CryptoService } from '../../services/CryptoService'
import { GroqService } from '../../services/GroqService'
import { Button } from '../shared/Button'
import { Input } from '../shared/Input'
import {
  PROMPT_TEMPLATES,
  GROQ_STT_MODELS, GROQ_LLM_MODELS,
  OPENAI_STT_MODELS, OPENAI_LLM_MODELS,
  GROQ_API_BASE, OPENAI_API_BASE,
} from '../../utils/constants'
import { ApiProvider } from '../../types'

interface SettingModalProps {
  onClose: () => void
}

export function SettingModal({ onClose }: SettingModalProps) {
  const {
    config, getApiKey, setApiKey,
    getOpenAiKey, setOpenAiKey,
    updateConfig, clearConfig,
  } = useConfigStore()

  const [provider, setProvider] = useState<ApiProvider>(config.provider ?? 'groq')
  const [groqKeyInput, setGroqKeyInput] = useState('')
  const [openaiKeyInput, setOpenaiKeyInput] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [customPrompt, setCustomPrompt] = useState(config.systemPrompt)
  const [saved, setSaved] = useState(false)
  const [testState, setTestState] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')
  const [testMsg, setTestMsg] = useState('')

  const sttModels = provider === 'openai' ? OPENAI_STT_MODELS : GROQ_STT_MODELS
  const llmModels = provider === 'openai' ? OPENAI_LLM_MODELS : GROQ_LLM_MODELS

  const [sttModel, setSttModel] = useState(config.modelSettings.sttModel)
  const [llmModel, setLlmModel] = useState(config.modelSettings.llmModel)

  // 切換 provider 時重設模型為該 provider 的預設
  useEffect(() => {
    if (provider === 'openai') {
      setSttModel(OPENAI_STT_MODELS[0].value)
      setLlmModel(OPENAI_LLM_MODELS[0].value)
    } else {
      setSttModel(GROQ_STT_MODELS[0].value)
      setLlmModel(GROQ_LLM_MODELS[0].value)
    }
    setTestState('idle')
    setTestMsg('')
  }, [provider])

  const hasGroqKey = Boolean(getApiKey())
  const hasOpenAiKey = Boolean(getOpenAiKey())

  const handleSave = () => {
    if (groqKeyInput) setApiKey(groqKeyInput)
    if (openaiKeyInput) setOpenAiKey(openaiKeyInput)
    updateConfig({
      provider,
      systemPrompt: customPrompt,
      modelSettings: { sttModel, llmModel },
    })
    setSaved(true)
    setTimeout(() => { setSaved(false); onClose() }, 800)
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
      <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">設定</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        {/* 安全警告 */}
        <div className="rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2 text-xs text-yellow-800">
          ⚠ API Key 以 Base64 儲存於瀏覽器 LocalStorage，僅防止明文直接顯示。請勿在公用電腦使用。
        </div>

        {/* ─── 提供商切換 ─────────────────────────────────── */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">API 提供商</label>
          <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
            {(['groq', 'openai'] as ApiProvider[]).map((p) => (
              <button
                key={p}
                onClick={() => setProvider(p)}
                className={`flex-1 py-2 font-medium transition-colors ${
                  provider === p
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {p === 'groq' ? 'GROQ（LPU）' : 'OpenAI'}
              </button>
            ))}
          </div>
        </div>

        {/* ─── API Key（依提供商顯示）──────────────────────── */}
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
              onChange={(e) =>
                provider === 'groq'
                  ? setGroqKeyInput(e.target.value)
                  : setOpenaiKeyInput(e.target.value)
              }
              placeholder={
                (provider === 'groq' ? hasGroqKey : hasOpenAiKey)
                  ? '（留空不更改）'
                  : provider === 'groq' ? 'gsk_...' : 'sk-...'
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              aria-label={showKey ? '隱藏 Key' : '顯示 Key'}
            >
              {showKey ? '🙈' : '👁'}
            </button>
          </div>
          {provider === 'groq' && groqKeyInput && !CryptoService.isValidGroqKey(groqKeyInput) && (
            <span className="text-xs text-red-500">GROQ Key 格式不正確（應以 gsk_ 開頭）</span>
          )}
          <button
            type="button"
            onClick={handleTest}
            disabled={testState === 'testing'}
            className="mt-1 self-start rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
          >
            {testState === 'testing' ? '測試中…' : '🔌 測試連線'}
          </button>
          {testMsg && (
            <span className={`text-xs ${testState === 'ok' ? 'text-green-600' : 'text-red-600'}`}>
              {testMsg}
            </span>
          )}
        </div>

        {/* ─── 模型選擇 ────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">語音辨識（STT）</label>
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

        {/* ─── System Prompt ───────────────────────────────── */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">翻譯 Prompt 模板</label>
          <select
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none"
            onChange={(e) => { if (e.target.value) setCustomPrompt(e.target.value) }}
            value=""
          >
            <option value="">— 選擇預設模板 —</option>
            {PROMPT_TEMPLATES.map((t) => (
              <option key={t.label} value={t.value}>{t.label}</option>
            ))}
          </select>
          <textarea
            rows={3}
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-mono outline-none focus:border-blue-500 resize-none"
          />
        </div>

        {/* ─── VAD 設定 ────────────────────────────────────── */}
        <Input
          label={`靜音斷句閾值：${config.vadSilenceMs} ms（越小越敏感）`}
          type="range"
          min={200}
          max={2000}
          step={100}
          value={config.vadSilenceMs}
          onChange={(e) => updateConfig({ vadSilenceMs: Number(e.target.value) })}
          className="accent-blue-600"
        />

        {/* ─── 翻譯開關 ────────────────────────────────────── */}
        <div className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 bg-gray-50">
          <div>
            <p className="text-sm font-medium text-gray-800">啟用翻譯（LLM）</p>
            <p className="text-xs text-gray-500 mt-0.5">
              關閉後僅執行語音轉文字（STT），不呼叫 LLM，延遲更低
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={config.enableTranslation}
            onClick={() => updateConfig({ enableTranslation: !config.enableTranslation })}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
              config.enableTranslation ? 'bg-blue-600' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                config.enableTranslation ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* ─── 按鈕列 ─────────────────────────────────────── */}
        <div className="flex justify-between pt-1">
          <Button variant="ghost" size="sm" onClick={() => {
            if (confirm('確定要清除所有設定（包含 API Key）？')) clearConfig()
          }}>
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
