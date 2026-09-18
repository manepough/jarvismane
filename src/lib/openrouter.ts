/**
 * src/lib/openrouter.ts
 * OpenRouter API integration with streaming, vision/file attachment support,
 * and offline fallback via the local command parser.
 *
 * All network calls include explicit timeouts and typed error handling.
 * No credential is stored in this module.
 */

import type { Message, Attachment } from '@/types'
import { APIKeyMissingError, APIRequestError } from '@/types'
import { parseOfflineCommand } from '@/services/OfflineCommandParser'
import { isVisionCompatibleType } from '@/services/AttachmentService'

// ─── Constants ────────────────────────────────────────────────────────────────

const OPENROUTER_API_URL: string = 'https://openrouter.ai/api/v1/chat/completions'
const REQUEST_TIMEOUT_MS: number = 90_000

// ─── Types ────────────────────────────────────────────────────────────────────

type OpenRouterContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | OpenRouterContentPart[]
}

export interface StreamCallbacks {
  onToken: (token: string) => void
  onDone: (fullContent: string) => void
  onError: (error: APIKeyMissingError | APIRequestError | Error) => void
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

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Stream a response from OpenRouter, calling onToken for each SSE chunk.
 * Falls back to the offline parser if apiKey is empty or network fails.
 */
export async function streamMessage(
  options: SendOptions,
  callbacks: StreamCallbacks
): Promise<void> {
  const { messages, systemPrompt, model, apiKey, attachments, signal, temperature, maxTokens } =
    options

  if (apiKey.trim() === '') {
    // Attempt offline fallback
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')
    if (lastUserMessage !== undefined) {
      const result = parseOfflineCommand(lastUserMessage.content)
      callbacks.onDone(result.response)
    } else {
      callbacks.onError(new APIKeyMissingError())
    }
    return
  }

  const openRouterMessages = buildOpenRouterMessages(messages, systemPrompt, attachments ?? [])

  const requestBody = {
    model,
    messages: openRouterMessages,
    stream: true,
    temperature: temperature ?? 0.7,
    max_tokens: maxTokens ?? 4096,
  }

  let response: Response
  try {
    response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
        'X-Title': 'Jarvis',
      },
      body: JSON.stringify(requestBody),
      signal: signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      // User-initiated abort — not an error
      return
    }
    // Network failure — try offline fallback
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')
    if (lastUserMessage !== undefined) {
      const result = parseOfflineCommand(lastUserMessage.content)
      callbacks.onDone('[Offline] ' + result.response)
    } else {
      callbacks.onError(new Error(`Network error: ${err instanceof Error ? err.message : String(err)}`))
    }
    return
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    callbacks.onError(new APIRequestError(response.status, body.slice(0, 300)))
    return
  }

  const reader = response.body?.getReader()
  if (reader === undefined || reader === null) {
    callbacks.onError(new Error('Response body is not readable'))
    return
  }

  const decoder = new TextDecoder('utf-8')
  let fullContent = ''
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data: ')) continue
        const data = trimmed.slice(6)
        if (data === '[DONE]') break

        try {
          const parsed = JSON.parse(data) as {
            choices?: { delta?: { content?: string } }[]
          }
          const token = parsed.choices?.[0]?.delta?.content ?? ''
          if (token.length > 0) {
            fullContent += token
            callbacks.onToken(token)
          }
        } catch {
          // Malformed SSE chunk — skip
        }
      }
    }
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      // User stopped generation — complete with what we have
      callbacks.onDone(fullContent)
      return
    }
    callbacks.onError(new Error(`Stream read error: ${err instanceof Error ? err.message : String(err)}`))
    return
  } finally {
    try {
      reader.releaseLock()
    } catch {
      // Non-fatal
    }
  }

  callbacks.onDone(fullContent)
}

// ─── Private Helpers ──────────────────────────────────────────────────────────

function buildOpenRouterMessages(
  messages: Message[],
  systemPrompt: string,
  attachments: Attachment[]
): OpenRouterMessage[] {
  const result: OpenRouterMessage[] = [
    { role: 'system', content: systemPrompt },
  ]

  for (const message of messages) {
    if (message.role === 'system') continue

    // If this is the last user message and there are attachments, embed them
    const isLastUser =
      message.role === 'user' &&
      messages.filter((m) => m.role === 'user').at(-1)?.id === message.id

    const msgAttachments = isLastUser
      ? [...(message.attachments ?? []), ...attachments]
      : (message.attachments ?? [])

    const visionAttachments = msgAttachments.filter(
      (a) => isVisionCompatibleType(a.mediaType) && a.data.length > 0
    )

    if (visionAttachments.length > 0) {
      const parts: OpenRouterContentPart[] = [{ type: 'text', text: message.content }]
      for (const att of visionAttachments) {
        parts.push({
          type: 'image_url',
          image_url: {
            url: `data:${att.mediaType};base64,${att.data}`,
          },
        })
      }
      result.push({ role: message.role as 'user' | 'assistant', content: parts })
    } else {
      // Include text-file content inline for non-vision attachments
      let content = message.content
      const textAttachments = msgAttachments.filter(
        (a) => !isVisionCompatibleType(a.mediaType) && a.data.length > 0
      )
      for (const att of textAttachments) {
        try {
          const decoded = atob(att.data)
          content += `\n\n[Attached file: ${att.filename}]\n${decoded.slice(0, 8000)}`
        } catch {
          content += `\n\n[Attached file: ${att.filename} — binary content not shown]`
        }
      }
      result.push({ role: message.role as 'user' | 'assistant', content })
    }
  }

  return result
}
