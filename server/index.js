/**
 * OmniTranslate-GROQ API Proxy
 * 職責：僅設定 CORS Header，讓前端可以直接呼叫 GROQ API
 * 不轉發任何請求，不記錄任何 API Key 或會議內容
 */
const Fastify = require('fastify')
const cors = require('@fastify/cors')

const app = Fastify({ logger: false })

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',')

app.register(cors, {
  origin: ALLOWED_ORIGINS,
  methods: ['GET', 'OPTIONS'],
})

app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

const PORT = Number(process.env.PORT) || 3000

app.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
  if (err) {
    console.error(err)
    process.exit(1)
  }
  console.log(`OmniTranslate CORS server running on http://localhost:${PORT}`)
})
