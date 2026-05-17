import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

const ALLOWED_REALTIME_MODELS = [
  'gpt-realtime-whisper',
  'gpt-4o-transcribe',
  'gpt-4o-mini-transcribe',
]

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const RECORD_TEMPLATE_DIR = path.resolve(__dirname, 'templates', 'records')
const LOCAL_CONFIG_DIR = path.resolve(__dirname, 'config', 'local')
const LOCAL_CONFIG_FILE = path.resolve(LOCAL_CONFIG_DIR, 'app.local.yaml')

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk: Buffer) => { body += chunk.toString() })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

async function listRecordTemplates(): Promise<Array<{ id: string; name: string; content: string }>> {
  const dirItems = await fs.readdir(RECORD_TEMPLATE_DIR, { withFileTypes: true })
  const mdFiles = dirItems.filter((item) => item.isFile() && item.name.toLowerCase().endsWith('.md'))
  const loaded = await Promise.all(mdFiles.map(async (item) => {
    const filePath = path.resolve(RECORD_TEMPLATE_DIR, item.name)
    const content = await fs.readFile(filePath, 'utf8')
    const id = item.name.replace(/\.md$/i, '')
    const firstLine = content.split(/\r?\n/).find((line) => line.trim().length > 0) ?? ''
    const name = firstLine.startsWith('#') ? firstLine.replace(/^#+\s*/, '').trim() : id
    return { id, name, content }
  }))
  return loaded.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant-TW'))
}

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

        void (async () => {
          try {
            const body = await readBody(req)
            const { apiKey, model } = JSON.parse(body) as { apiKey?: string; model?: string }

            if (!apiKey || typeof apiKey !== 'string') {
              sendJson(res, 400, { error: 'apiKey 為必填字串' })
              return
            }
            if (!model || !ALLOWED_REALTIME_MODELS.includes(model)) {
              sendJson(res, 400, { error: `model 須為以下之一：${ALLOWED_REALTIME_MODELS.join(', ')}` })
              return
            }

            const upstream = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                session: {
                  type: 'transcription',
                },
              }),
            })

            const data = await upstream.json()
            sendJson(res, upstream.status, data)
          } catch (err) {
            sendJson(res, 500, { error: String(err) })
          }
        })()
      })

      server.middlewares.use('/record-templates', (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        if (req.method !== 'GET') {
          next()
          return
        }

        void (async () => {
          try {
            const templates = await listRecordTemplates()
            sendJson(res, 200, { templates })
          } catch (err) {
            sendJson(res, 500, { error: String(err) })
          }
        })()
      })

      server.middlewares.use('/local-config', (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        if (req.method === 'GET') {
          void (async () => {
            try {
              const raw = await fs.readFile(LOCAL_CONFIG_FILE, 'utf8').catch(() => '')
              if (!raw.trim()) {
                sendJson(res, 200, { config: null })
                return
              }
              const parsed = parseYaml(raw) ?? null
              sendJson(res, 200, { config: parsed })
            } catch (err) {
              sendJson(res, 500, { error: String(err) })
            }
          })()
          return
        }

        if (req.method === 'POST') {
          void (async () => {
            try {
              const rawBody = await readBody(req)
              const body = JSON.parse(rawBody) as { config?: unknown }
              if (!body.config || typeof body.config !== 'object') {
                sendJson(res, 400, { error: 'config 需為物件' })
                return
              }
              await fs.mkdir(LOCAL_CONFIG_DIR, { recursive: true })
              await fs.writeFile(LOCAL_CONFIG_FILE, stringifyYaml(body.config), 'utf8')
              sendJson(res, 200, { ok: true, file: LOCAL_CONFIG_FILE })
            } catch (err) {
              sendJson(res, 500, { error: String(err) })
            }
          })()
          return
        }

        next()
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
