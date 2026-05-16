/**
 * OmniTranslate-GROQ API Proxy
 * 職責：(1) 設定 CORS Header；(2) 代理 OpenAI Realtime ephemeral token 請求
 * 不轉發一般請求，不記錄任何 API Key 或會議內容
 */
const Fastify = require('fastify')
const cors = require('@fastify/cors')

const app = Fastify({ logger: false })

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',')

// 允許的 Realtime 模型（與前端 OPENAI_REALTIME_MODELS 保持一致）
const ALLOWED_REALTIME_MODELS = [
  'gpt-realtime-whisper',
  'gpt-4o-transcribe',
  'gpt-4o-mini-transcribe',
]

app.register(cors, {
  origin: ALLOWED_ORIGINS,
  methods: ['GET', 'POST', 'OPTIONS'],
})

app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

/**
 * POST /realtime-token
 * 接收 { apiKey, model }，向 OpenAI 取得短期 ephemeral token 後回傳。
 * 由前端呼叫；API Key 不會被記錄或儲存。
 */
app.post('/realtime-token', async (request, reply) => {
  const { apiKey, model } = request.body ?? {}

  if (!apiKey || typeof apiKey !== 'string') {
    return reply.status(400).send({ error: 'apiKey 為必填字串' })
  }
  if (!model || !ALLOWED_REALTIME_MODELS.includes(model)) {
    return reply.status(400).send({ error: `model 須為以下之一：${ALLOWED_REALTIME_MODELS.join(', ')}` })
  }

  const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    // transcription session 建立時不可提供 model；模型由 WebSocket session update 設定
    body: JSON.stringify({ session: { type: 'transcription' } }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'OpenAI API 回應異常' }))
    return reply.status(response.status).send(err)
  }

  const data = await response.json()
  return reply.send(data)
})

const PORT = Number(process.env.PORT) || 3000

app.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
  if (err) {
    console.error(err)
    process.exit(1)
  }
  console.log(`OmniTranslate CORS server running on http://localhost:${PORT}`)
})
