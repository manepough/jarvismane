/**
 * src/lib/openrouter.ts
 * OpenRouter API — streaming, model rotation, best-answer race mode.
 * Modeled on G0DM0D3's openrouter.ts patterns.
 */

import type { Message, Attachment } from '@/types'
import { APIKeyMissingError, APIRequestError } from '@/types'
import { parseOfflineCommand } from '@/services/OfflineCommandParser'
import { isVisionCompatibleType } from '@/services/AttachmentService'

const OR_URL = 'https://openrouter.ai/api/v1/chat/completions'
const OR_MODELS_URL = 'https://openrouter.ai/api/v1/models'

// ── Model priority list — best to fallback ──────────────────────────────────

export const MODEL_PRIORITY: string[] = [
  'anthropic/claude-opus-4-5',
  'anthropic/claude-sonnet-4-5',
  'google/gemini-2.5-pro',
  'openai/gpt-4o',
  'anthropic/claude-3.5-haiku',
  'google/gemini-flash-1.5',
  'openai/gpt-4o-mini',
  'mistralai/mistral-large',
  'meta-llama/llama-3.3-70b-instruct',
  'qwen/qwen-2.5-72b-instruct',
]

// ── Types ──────────────────────────────────────────────────────────────────

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

interface ORMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | ContentPart[]
}

export interface StreamCallbacks {
  onToken: (token: string) => void
  onDone: (fullContent: string) => void
  onError: (error: Error) => void
}

export interface SendOptions {
  messages: Message[]
  systemPrompt: string
  model: string
  apiKey: string
  attachments?: Attachment[]
  signal?: AbortSignal
  temperature?: number
  maxTokens?: number
}

// ── Validate API key ────────────────────────────────────────────────────────

export async function validateApiKey(apiKey: string): Promise<boolean> {
  try {
    const res = await fetch(OR_MODELS_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
    })
    return res.ok
  } catch {
    return false
  }
}

// ── Fetch available models ──────────────────────────────────────────────────

export async function fetchAvailableModels(apiKey: string): Promise<string[]> {
  try {
    const res = await fetch(OR_MODELS_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return MODEL_PRIORITY
    const data = await res.json() as { data: { id: string }[] }
    const ids = data.data.map(m => m.id)
    // Return priority list filtered to what's available, plus anything extra
    const prioritized = MODEL_PRIORITY.filter(m => ids.includes(m))
    const rest = ids.filter(id => !MODEL_PRIORITY.includes(id)).slice(0, 20)
    return [...prioritized, ...rest]
  } catch {
    return MODEL_PRIORITY
  }
}

// ── Stream a single model ───────────────────────────────────────────────────

export async function streamMessage(
  options: SendOptions,
  callbacks: StreamCallbacks
): Promise<void> {
  const { messages, systemPrompt, model, apiKey, attachments, signal, temperature, maxTokens } = options

  if (apiKey.trim() === '') {
    const last = [...messages].reverse().find(m => m.role === 'user')
    if (last) {
      const result = parseOfflineCommand(last.content)
      callbacks.onDone(result.response)
    } else {
      callbacks.onError(new APIKeyMissingError())
    }
    return
  }

  const orMessages = buildORMessages(messages, systemPrompt, attachments ?? [])

  let res: Response
  try {
    res = await fetch(OR_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://jarvis.local',
        'X-Title': 'Jarvis',
      },
      body: JSON.stringify({
        model,
        messages: orMessages,
        stream: true,
        temperature: temperature ?? 0.7,
        max_tokens: maxTokens ?? 4096,
      }),
      signal: signal ?? AbortSignal.timeout(90_000),
    })
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') return
    // Network fail — try offline
    const last = [...messages].reverse().find(m => m.role === 'user')
    if (last) {
      const result = parseOfflineCommand(last.content)
      callbacks.onDone('[Offline] ' + result.response)
    } else {
      callbacks.onError(new Error(`Network error: ${err instanceof Error ? err.message : String(err)}`))
    }
    return
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    callbacks.onError(new APIRequestError(res.status, body.slice(0, 300)))
    return
  }

  const reader = res.body?.getReader()
  if (!reader) { callbacks.onError(new Error('No response body')); return }

  const dec = new TextDecoder()
  let full = ''
  let buf = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        const t = line.trim()
        if (!t.startsWith('data: ')) continue
        const d = t.slice(6)
        if (d === '[DONE]') break
        try {
          const p = JSON.parse(d) as { choices?: { delta?: { content?: string } }[] }
          const tok = p.choices?.[0]?.delta?.content ?? ''
          if (tok) { full += tok; callbacks.onToken(tok) }
        } catch {}
      }
    }
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') { callbacks.onDone(full); return }
    callbacks.onError(new Error(`Stream error: ${err instanceof Error ? err.message : String(err)}`))
    return
  } finally {
    try { reader.releaseLock() } catch {}
  }

  callbacks.onDone(full)
}

// ── Race mode — try multiple models, return best non-empty response ─────────

export interface RaceResult {
  content: string
  model: string
  durationMs: number
}

export async function raceModels(
  options: Omit<SendOptions, 'model'>,
  models: string[],
  onLead?: (result: RaceResult) => void
): Promise<RaceResult> {
  const { messages, systemPrompt, apiKey, attachments, temperature, maxTokens } = options

  const orMessages = buildORMessages(messages, systemPrompt, attachments ?? [])

  const attempt = (model: string): Promise<RaceResult | null> =>
    new Promise(resolve => {
      const start = Date.now()
      fetch(OR_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://jarvis.local',
          'X-Title': 'Jarvis',
        },
        body: JSON.stringify({
          model,
          messages: orMessages,
          stream: false,
          temperature: temperature ?? 0.7,
          max_tokens: maxTokens ?? 2048,
        }),
        signal: AbortSignal.timeout(30_000),
      })
        .then(res => res.ok ? res.json() : null)
        .then((data: { choices?: { message?: { content?: string } }[] } | null) => {
          const content = data?.choices?.[0]?.message?.content?.trim() ?? ''
          if (content.length > 0) {
            resolve({ content, model, durationMs: Date.now() - start })
          } else {
            resolve(null)
          }
        })
        .catch(() => resolve(null))
    })

  // Fire all models in parallel — return first good result, notify on each lead
  return new Promise((resolve, reject) => {
    let best: RaceResult | null = null
    let settled = 0

    models.slice(0, 5).forEach(model => {
      attempt(model).then(result => {
        settled++
        if (result !== null) {
          if (best === null || result.content.length > best.content.length) {
            best = result
            onLead?.(result)
          }
        }
        if (settled === Math.min(models.length, 5)) {
          if (best !== null) resolve(best)
          else reject(new Error('All models failed'))
        }
      })
    })
  })
}

// ── Helpers ────────────────────────────────────────────────────────────────

function buildORMessages(
  messages: Message[],
  systemPrompt: string,
  attachments: Attachment[]
): ORMessage[] {
  const result: ORMessage[] = [{ role: 'system', content: systemPrompt }]

  for (const msg of messages) {
    if (msg.role === 'system') continue
    const isLastUser =
      msg.role === 'user' &&
      messages.filter(m => m.role === 'user').at(-1)?.id === msg.id

    const msgAtts = isLastUser
      ? [...(msg.attachments ?? []), ...attachments]
      : (msg.attachments ?? [])

    const visionAtts = msgAtts.filter(a => isVisionCompatibleType(a.mediaType) && a.data.length > 0)

    if (visionAtts.length > 0) {
      const parts: ContentPart[] = [{ type: 'text', text: msg.content }]
      for (const att of visionAtts) {
        parts.push({ type: 'image_url', image_url: { url: `data:${att.mediaType};base64,${att.data}` } })
      }
      result.push({ role: msg.role as 'user' | 'assistant', content: parts })
    } else {
      let content = msg.content
      const textAtts = msgAtts.filter(a => !isVisionCompatibleType(a.mediaType) && a.data.length > 0)
      for (const att of textAtts) {
        try { content += `\n\n[File: ${att.filename}]\n${atob(att.data).slice(0, 8000)}` }
        catch { content += `\n\n[File: ${att.filename} — binary]` }
      }
      result.push({ role: msg.role as 'user' | 'assistant', content })
    }
  }
  return result
}
