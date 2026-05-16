import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { IncomingMessage, ServerResponse } from 'node:http'

const ALLOWED_REALTIME_MODELS = [
  'gpt-realtime-whisper',
  'gpt-4o-transcribe',
  'gpt-4o-mini-transcribe',
]

/**
 * Vite plugin：在 dev server 直接處理 /realtime-token 請求
 * 等同原本的 Fastify server，但不需要另外啟動程序
 */
function realtimeTokenPlugin() {
  return {
    name: 'realtime-token-middleware',
    configureServer(server: { middlewares: { use: (path: string, fn: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void } }) {
      server.middlewares.use('/realtime-token', (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        if (req.method !== 'POST') {
          next()
          return
        }

        let body = ''
        req.on('data', (chunk: Buffer) => { body += chunk.toString() })
        req.on('end', () => {
          void (async () => {
            res.setHeader('Content-Type', 'application/json')
            try {
              const { apiKey, model } = JSON.parse(body) as { apiKey?: string; model?: string }

              if (!apiKey || typeof apiKey !== 'string') {
                res.statusCode = 400
                res.end(JSON.stringify({ error: 'apiKey 為必填字串' }))
                return
              }
              if (!model || !ALLOWED_REALTIME_MODELS.includes(model)) {
                res.statusCode = 400
                res.end(JSON.stringify({ error: `model 須為以下之一：${ALLOWED_REALTIME_MODELS.join(', ')}` }))
                return
              }

              const upstream = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  'Content-Type': 'application/json',
                },
                // transcription session 建立時不可提供 model；模型在 WS session update 設定
                body: JSON.stringify({
                  session: {
                    type: 'transcription',
                  },
                }),
              })

              const data = await upstream.json()
              res.statusCode = upstream.status
              res.end(JSON.stringify(data))
            } catch (err) {
              res.statusCode = 500
              res.end(JSON.stringify({ error: String(err) }))
            }
          })()
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), realtimeTokenPlugin()],
  server: {
    port: 5173,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  optimizeDeps: {
    include: ['@ricky0123/vad-web', 'onnxruntime-web'],
  },
})
