'use client'

import {
  useState, useRef, useEffect, useCallback,
  type KeyboardEvent, type ChangeEvent, type ReactElement,
} from 'react'
import { useStore } from '@/store'
import { streamMessage, raceModels, MODEL_PRIORITY } from '@/lib/openrouter'
import { processUserFile, downloadAttachment } from '@/services/AttachmentService'
import { useVoice } from '@/hooks/useVoice'
import type { Attachment } from '@/types'
import { AttachmentSizeLimitError, AttachmentTypeError } from '@/types'
import { JARVIS_SYSTEM_PROMPT } from '@/lib/jarvisPrompt'

// ── Styles ────────────────────────────────────────────────────────────────

const S = {
  bar: { borderTop: '1px solid rgba(0,255,65,0.15)', background: 'rgba(10,14,10,0.95)', padding: '12px 16px', flexShrink: 0 },
  inner: { maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column' as const, gap: '8px' },
  attachRow: { display: 'flex', flexWrap: 'wrap' as const, gap: '6px' },
  chip: { display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(0,255,65,0.2)', background: 'rgba(17,22,17,0.9)', maxWidth: '180px', fontFamily: 'monospace', fontSize: '10px', color: 'var(--text)' },
  inputRow: { display: 'flex', alignItems: 'flex-end', gap: '8px' },
  btn: (danger?: boolean, active?: boolean, disabled?: boolean) => ({
    flexShrink: 0, width: '40px', height: '40px', borderRadius: '8px',
    border: `1px solid ${danger ? 'rgba(255,68,68,0.5)' : active ? 'rgba(255,68,68,0.5)' : 'rgba(0,255,65,0.2)'}`,
    background: danger ? 'rgba(255,68,68,0.1)' : active ? 'rgba(255,68,68,0.1)' : 'transparent',
    color: (danger || active) ? '#ff8888' : 'var(--secondary)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
    opacity: disabled ? 0.4 : 1, transition: 'all 0.15s', flexBasis: '40px',
  }),
  textarea: {
    flex: 1, resize: 'none' as const, background: 'var(--dim)',
    border: '1px solid rgba(0,255,65,0.2)', borderRadius: '8px',
    padding: '10px 14px', color: 'var(--text)', fontFamily: 'monospace',
    fontSize: '13px', lineHeight: '1.5', minHeight: '44px', maxHeight: '180px',
    outline: 'none', transition: 'border-color 0.15s',
  },
  statusRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'monospace', fontSize: '10px', color: 'rgba(74,124,89,0.4)', padding: '0 2px' },
  modeRow: { display: 'flex', gap: '6px', alignItems: 'center' },
  modePill: (active: boolean) => ({
    padding: '2px 8px', borderRadius: '4px', cursor: 'pointer',
    border: `1px solid ${active ? 'rgba(0,255,65,0.5)' : 'rgba(0,255,65,0.12)'}`,
    background: active ? 'rgba(0,255,65,0.08)' : 'transparent',
    color: active ? 'var(--primary)' : 'rgba(74,124,89,0.5)',
    fontFamily: 'monospace', fontSize: '9px', letterSpacing: '1px',
    transition: 'all 0.15s',
  }),
}

type SendMode = 'stream' | 'race'

export function ChatInput(): ReactElement {
  const {
    currentConversationId, currentConversation, personas, currentPersonaId,
    settings, isStreaming, networkStatus,
    addMessage, updateMessageContent, finalizeStreamingMessage,
    setIsStreaming, setStreamingMessageId,
  } = useStore()

  const [inputText, setInputText] = useState('')
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([])
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const [sendMode, setSendMode] = useState<SendMode>('stream')
  const [raceStatus, setRaceStatus] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const persona = personas.find(p => p.id === currentPersonaId) ?? {
    id: 'jarvis', name: 'Jarvis', description: '', tone: '', coreDirective: '',
    systemPrompt: JARVIS_SYSTEM_PROMPT, emoji: '', color: '#00ff41',
  }

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 180) + 'px'
  }, [inputText])

  const onTranscript = useCallback((t: string) => {
    setInputText(prev => prev.trim() ? `${prev} ${t}` : t)
    textareaRef.current?.focus()
  }, [])
  const voice = useVoice(onTranscript)

  const handleSubmit = useCallback(async () => {
    const text = inputText.trim()
    if ((!text && pendingAttachments.length === 0) || isStreaming || !currentConversationId) return

    const atts = [...pendingAttachments]
    setInputText('')
    setPendingAttachments([])
    setAttachmentError(null)
    setRaceStatus(null)

    addMessage(currentConversationId, { role: 'user', content: text, attachments: atts })
    const assistantId = addMessage(currentConversationId, {
      role: 'assistant', content: '',
      model: currentConversation?.model ?? MODEL_PRIORITY[0],
      persona: persona.id,
    })

    setIsStreaming(true)
    setStreamingMessageId(assistantId)
    const ctrl = new AbortController()
    abortRef.current = ctrl

    const msgs = currentConversation?.messages ?? []
    const sysPrompt = persona.systemPrompt || JARVIS_SYSTEM_PROMPT
    const apiKey = settings.openRouterApiKey
    const model = currentConversation?.model ?? MODEL_PRIORITY[0] ?? 'anthropic/claude-sonnet-4-6'

    if (sendMode === 'race') {
      // Race mode — try top models in parallel, display best
      setRaceStatus('Racing models...')
      try {
        const result = await raceModels(
          { messages: msgs, systemPrompt: sysPrompt, apiKey, attachments: atts },
          MODEL_PRIORITY,
          (lead) => {
            setRaceStatus(`Lead: ${lead.model.split('/')[1]} (${lead.durationMs}ms)`)
            updateMessageContent(currentConversationId, assistantId, lead.content)
          }
        )
        updateMessageContent(currentConversationId, assistantId, result.content, { model: result.model })
        setRaceStatus(null)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Race failed'
        updateMessageContent(currentConversationId, assistantId, `Error: ${msg}`, { errorDetail: msg })
      }
      finalizeStreamingMessage(currentConversationId, assistantId)
      abortRef.current = null
    } else {
      // Stream mode — with auto-fallback through models on error
      let acc = ''
      let attempted = 0
      const tryModel = async (m: string): Promise<void> => {
        attempted++
        acc = ''
        await streamMessage(
          { messages: msgs, systemPrompt: sysPrompt, model: m, apiKey, attachments: atts, signal: ctrl.signal },
          {
            onToken: (t) => { acc += t; updateMessageContent(currentConversationId, assistantId, acc) },
            onDone: (full) => {
              updateMessageContent(currentConversationId, assistantId, full, { model: m })
              finalizeStreamingMessage(currentConversationId, assistantId)
              abortRef.current = null
            },
            onError: async (err) => {
              // Rate limit or model error — try next model
              const isRetryable = err.message.includes('429') || err.message.includes('503') || err.message.includes('unavailable')
              const nextModel = MODEL_PRIORITY[attempted]
              if (isRetryable && nextModel && attempted < 4) {
                updateMessageContent(currentConversationId, assistantId, `[Switching to ${nextModel.split('/')[1]}...]`)
                await tryModel(nextModel)
              } else {
                updateMessageContent(currentConversationId, assistantId, `Error: ${err.message}`, { errorDetail: err.message })
                finalizeStreamingMessage(currentConversationId, assistantId)
                abortRef.current = null
              }
            },
          }
        )
      }
      await tryModel(model)
    }
  }, [
    inputText, pendingAttachments, isStreaming, currentConversationId,
    currentConversation, persona, settings, sendMode,
    addMessage, updateMessageContent, finalizeStreamingMessage,
    setIsStreaming, setStreamingMessageId,
  ])

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() }
  }, [handleSubmit])

  const handleFileChange = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    setAttachmentError(null)
    for (const file of files) {
      try {
        const att = await processUserFile(file, 'user')
        setPendingAttachments(prev => [...prev, att])
      } catch (err) {
        if (err instanceof AttachmentSizeLimitError || err instanceof AttachmentTypeError) setAttachmentError(err.message)
      }
    }
  }, [])

  return (
    <div style={S.bar}>
      <div style={S.inner}>

        {attachmentError && (
          <div style={{ fontFamily: 'monospace', fontSize: '11px', color: '#ff8888', display: 'flex', gap: '6px', alignItems: 'center' }}>
            {attachmentError}
            <button onClick={() => setAttachmentError(null)} style={{ background: 'none', border: 'none', color: '#ff8888', cursor: 'pointer', fontSize: '12px' }}>✕</button>
          </div>
        )}

        {pendingAttachments.length > 0 && (
          <div style={S.attachRow}>
            {pendingAttachments.map(att => (
              <div key={att.id} style={S.chip}>
                {att.mediaType.startsWith('image/') && att.previewUrl && (
                  <img src={att.previewUrl} alt="" style={{ width: 18, height: 18, objectFit: 'cover', borderRadius: 3 }} />
                )}
                <button onClick={() => downloadAttachment(att)} style={{ background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', fontFamily: 'monospace', fontSize: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px', padding: 0 }} title={att.filename}>
                  {att.filename.length > 16 ? att.filename.slice(0, 14) + '…' : att.filename}
                </button>
                <button onClick={() => setPendingAttachments(p => p.filter(a => a.id !== att.id))} style={{ background: 'none', border: 'none', color: 'rgba(74,124,89,0.5)', cursor: 'pointer', fontSize: '11px', padding: 0, flexShrink: 0 }}>✕</button>
              </div>
            ))}
          </div>
        )}

        <div style={S.inputRow}>
          <input ref={fileInputRef} type="file" multiple accept="image/*,application/pdf,text/plain,text/markdown,application/json,audio/*,video/mp4" style={{ display: 'none' }} onChange={handleFileChange} />

          <button style={S.btn(false, false, isStreaming)} onClick={() => fileInputRef.current?.click()} disabled={isStreaming} title="Attach file or image">
            📎
          </button>

          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={e => { e.target.style.borderColor = 'rgba(0,255,65,0.5)' }}
            onBlur={e => { e.target.style.borderColor = 'rgba(0,255,65,0.2)' }}
            placeholder={
              networkStatus === 'offline' ? 'Offline — local commands only' :
              'Message Jarvis... (Enter to send, Shift+Enter for newline)'
            }
            disabled={isStreaming}
            rows={1}
            style={S.textarea}
          />

          {settings.voiceEnabled && (
            <button
              style={S.btn(false, voice.transcriptionState === 'recording', isStreaming || voice.transcriptionState === 'transcribing')}
              onClick={() => voice.transcriptionState === 'recording' ? voice.stopVoiceInput() : voice.startVoiceInput()}
              disabled={isStreaming || voice.transcriptionState === 'transcribing'}
              title={voice.transcriptionState === 'recording' ? 'Stop recording' : 'Voice input'}
            >
              {voice.transcriptionState === 'transcribing' ? '⏳' : voice.transcriptionState === 'recording' ? '⏹' : '🎤'}
            </button>
          )}

          {isStreaming ? (
            <button style={S.btn(true)} onClick={() => { abortRef.current?.abort(); abortRef.current = null }} title="Stop">⏹</button>
          ) : (
            <button
              style={S.btn(false, false, (inputText.trim() === '' && pendingAttachments.length === 0) || settings.openRouterApiKey === '')}
              onClick={handleSubmit}
              disabled={(inputText.trim() === '' && pendingAttachments.length === 0) || settings.openRouterApiKey === ''}
              title="Send"
            >
              ➤
            </button>
          )}
        </div>

        <div style={S.statusRow}>
          <div style={S.modeRow}>
            <button style={S.modePill(sendMode === 'stream')} onClick={() => setSendMode('stream')}>STREAM</button>
            <button style={S.modePill(sendMode === 'race')} onClick={() => setSendMode('race')}>RACE</button>
            {networkStatus === 'offline' && <span style={{ color: '#ffcc00', fontSize: '9px' }}>● OFFLINE</span>}
            {isStreaming && sendMode === 'stream' && <span style={{ color: 'rgba(0,255,65,0.5)', fontSize: '9px' }}>generating...</span>}
            {raceStatus && <span style={{ color: 'rgba(0,255,65,0.6)', fontSize: '9px' }}>{raceStatus}</span>}
            {voice.transcriptionState === 'transcribing' && <span style={{ color: '#4dd0e1', fontSize: '9px' }}>transcribing...</span>}
          </div>
          {inputText.length > 0 && <span>{inputText.length}</span>}
        </div>
      </div>
    </div>
  )
}
