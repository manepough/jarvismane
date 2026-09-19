'use client'

import {
  useState, useRef, useEffect, useCallback,
  type KeyboardEvent, type ChangeEvent, type ReactElement,
} from 'react'
import { useStore } from '@/store'
import { streamMessage } from '@/lib/openrouter'
import { processUserFile, downloadAttachment } from '@/services/AttachmentService'
import { useVoice } from '@/hooks/useVoice'
import type { Attachment } from '@/types'
import { AttachmentSizeLimitError, AttachmentTypeError } from '@/types'

const S = {
  bar: {
    borderTop: '1px solid rgba(0,255,65,0.2)',
    background: 'rgba(17,22,17,0.7)',
    padding: '12px 16px',
    flexShrink: 0,
  },
  inner: {
    maxWidth: '800px',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  attachRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '8px',
  },
  chip: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 10px',
    borderRadius: '6px',
    border: '1px solid rgba(0,255,65,0.25)',
    background: 'rgba(17,22,17,0.9)',
    maxWidth: '180px',
    fontFamily: 'monospace',
    fontSize: '10px',
    color: 'var(--text)',
  },
  chipName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    cursor: 'pointer',
    flex: 1,
  },
  chipX: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: 'rgba(74,124,89,0.6)',
    fontSize: '12px',
    padding: '0',
    lineHeight: 1,
    flexShrink: 0,
  },
  inputRow: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '8px',
  },
  iconBtn: (active?: boolean, danger?: boolean) => ({
    flexShrink: 0,
    padding: '10px',
    borderRadius: '8px',
    border: `1px solid ${danger ? 'rgba(255,68,68,0.5)' : active ? 'rgba(255,68,68,0.6)' : 'rgba(0,255,65,0.25)'}`,
    background: danger ? 'rgba(255,68,68,0.1)' : active ? 'rgba(255,68,68,0.12)' : 'transparent',
    color: (active || danger) ? '#ff6666' : 'var(--secondary)',
    cursor: 'pointer',
    fontSize: '16px',
    lineHeight: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s',
    animation: active ? 'pulse 1s ease-in-out infinite' : 'none',
  }),
  textarea: {
    flex: 1,
    resize: 'none' as const,
    background: 'var(--bg)',
    border: '1px solid rgba(0,255,65,0.25)',
    borderRadius: '8px',
    padding: '10px 14px',
    color: 'var(--text)',
    fontFamily: 'monospace',
    fontSize: '13px',
    lineHeight: '1.5',
    minHeight: '44px',
    maxHeight: '200px',
    outline: 'none',
    transition: 'border-color 0.15s',
  },
  status: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontFamily: 'monospace',
    fontSize: '10px',
    color: 'rgba(74,124,89,0.5)',
    padding: '0 2px',
  },
  errText: {
    color: '#ff6666',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  streamText: {
    color: 'rgba(0,255,65,0.6)',
  },
}

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
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const persona = personas.find(p => p.id === currentPersonaId) ?? {
    id: 'jarvis', name: 'Jarvis', description: '', tone: '', coreDirective: '',
    systemPrompt: 'You are Jarvis, a direct and capable personal assistant.',
    emoji: '', color: '#00ff41',
  }

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
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

    addMessage(currentConversationId, { role: 'user', content: text, attachments: atts })
    const assistantId = addMessage(currentConversationId, {
      role: 'assistant', content: '',
      model: currentConversation?.model ?? 'anthropic/claude-sonnet-4-6',
      persona: persona.id,
    })

    setIsStreaming(true)
    setStreamingMessageId(assistantId)

    const ctrl = new AbortController()
    abortRef.current = ctrl
    let acc = ''

    await streamMessage(
      {
        messages: currentConversation?.messages ?? [],
        systemPrompt: persona.systemPrompt,
        model: currentConversation?.model ?? 'anthropic/claude-sonnet-4-6',
        apiKey: settings.openRouterApiKey,
        attachments: atts,
        signal: ctrl.signal,
      },
      {
        onToken: (t) => { acc += t; updateMessageContent(currentConversationId, assistantId, acc) },
        onDone: (full) => { updateMessageContent(currentConversationId, assistantId, full); finalizeStreamingMessage(currentConversationId, assistantId); abortRef.current = null },
        onError: (err) => { updateMessageContent(currentConversationId, assistantId, `Error: ${err.message}`, { errorDetail: err.message, isStreaming: false }); finalizeStreamingMessage(currentConversationId, assistantId); abortRef.current = null },
      }
    )
  }, [inputText, pendingAttachments, isStreaming, currentConversationId, currentConversation, persona, settings, addMessage, updateMessageContent, finalizeStreamingMessage, setIsStreaming, setStreamingMessageId])

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
        if (err instanceof AttachmentSizeLimitError || err instanceof AttachmentTypeError) {
          setAttachmentError(err.message)
        }
      }
    }
  }, [])

  const isDisabled = settings.openRouterApiKey.trim() === ''

  return (
    <div style={S.bar}>
      <div style={S.inner}>
        {attachmentError && (
          <div style={{ ...S.errText, fontFamily: 'monospace', fontSize: '11px' }}>
            {attachmentError}
            <button style={S.chipX} onClick={() => setAttachmentError(null)}>✕</button>
          </div>
        )}

        {pendingAttachments.length > 0 && (
          <div style={S.attachRow}>
            {pendingAttachments.map(att => (
              <div key={att.id} style={S.chip}>
                {att.mediaType.startsWith('image/') && att.previewUrl && (
                  <img src={att.previewUrl} alt="" style={{ width: 20, height: 20, objectFit: 'cover', borderRadius: 3 }} />
                )}
                <button style={S.chipName} onClick={() => downloadAttachment(att)} title={att.filename}>
                  {att.filename.length > 18 ? att.filename.slice(0, 16) + '...' : att.filename}
                </button>
                <button style={S.chipX} onClick={() => setPendingAttachments(p => p.filter(a => a.id !== att.id))}>✕</button>
              </div>
            ))}
          </div>
        )}

        <div style={S.inputRow}>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,application/pdf,text/plain,text/markdown,application/json,audio/*,video/mp4"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          <button
            style={S.iconBtn()}
            onClick={() => fileInputRef.current?.click()}
            disabled={isStreaming}
            title="Attach file"
          >
            📎
          </button>

          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={e => { e.target.style.borderColor = 'rgba(0,255,65,0.6)' }}
            onBlur={e => { e.target.style.borderColor = 'rgba(0,255,65,0.25)' }}
            placeholder={
              networkStatus === 'offline' ? 'Offline mode — local commands only' :
              isDisabled ? 'Add your OpenRouter API key in Settings' :
              'Type a message... (Enter to send, Shift+Enter for newline)'
            }
            disabled={isStreaming}
            rows={1}
            style={S.textarea}
          />

          {settings.voiceEnabled && (
            <button
              style={S.iconBtn(voice.transcriptionState === 'recording')}
              onClick={() => voice.transcriptionState === 'recording' ? voice.stopVoiceInput() : voice.startVoiceInput()}
              disabled={isStreaming || voice.transcriptionState === 'transcribing'}
              title={voice.transcriptionState === 'recording' ? 'Stop recording' : 'Voice input'}
            >
              {voice.transcriptionState === 'transcribing' ? '⏳' : voice.transcriptionState === 'recording' ? '⏹' : '🎤'}
            </button>
          )}

          {isStreaming ? (
            <button style={S.iconBtn(false, true)} onClick={() => { abortRef.current?.abort(); abortRef.current = null }} title="Stop">
              ⏹
            </button>
          ) : (
            <button
              style={S.iconBtn()}
              onClick={handleSubmit}
              disabled={(inputText.trim() === '' && pendingAttachments.length === 0) || isDisabled}
              title="Send"
            >
              ➤
            </button>
          )}
        </div>

        <div style={S.status}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {networkStatus === 'offline' && <span style={{ color: '#ffcc00' }}>● offline</span>}
            {isStreaming && <span style={S.streamText}>generating...</span>}
            {voice.transcriptionState === 'transcribing' && <span style={{ color: '#4dd0e1' }}>transcribing...</span>}
            {voice.errorMessage && <span style={{ color: '#ff6666' }}>{voice.errorMessage}</span>}
          </div>
          {inputText.length > 0 && <span>{inputText.length} chars</span>}
        </div>
      </div>
    </div>
  )
}
