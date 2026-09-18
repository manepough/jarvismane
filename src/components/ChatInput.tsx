'use client'

/**
 * src/components/ChatInput.tsx
 * Chat input bar with:
 *  - Text textarea (auto-resize, Shift+Enter newline)
 *  - Voice record/stop button
 *  - File/image attachment button (multi-select)
 *  - Attachment preview strip with remove controls
 *  - Send and abort streaming buttons
 *  - Offline status indicator
 *
 * No business logic here. All API calls route through openrouter.ts.
 * All file processing routes through AttachmentService.ts.
 */

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type KeyboardEvent,
  type ChangeEvent,
  type ReactElement,
} from 'react'
import { Send, Square, Mic, MicOff, Paperclip, X, Loader2, WifiOff } from 'lucide-react'
import { useStore } from '@/store'
import { streamMessage } from '@/lib/openrouter'
import { processUserFile, downloadAttachment } from '@/services/AttachmentService'
import { useVoice } from '@/hooks/useVoice'
import type { Attachment } from '@/types'
import { AttachmentSizeLimitError, AttachmentTypeError } from '@/types'

// ─── Component ────────────────────────────────────────────────────────────────

export function ChatInput(): ReactElement {
  const {
    currentConversationId,
    currentConversation,
    personas,
    currentPersonaId,
    settings,
    isStreaming,
    networkStatus,
    addMessage,
    updateMessageContent,
    finalizeStreamingMessage,
    setIsStreaming,
    setStreamingMessageId,
  } = useStore()

  const [inputText, setInputText] = useState<string>('')
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([])
  const [attachmentError, setAttachmentError] = useState<string | null>(null)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const persona = personas.find((p) => p.id === currentPersonaId) ?? { id: "jarvis", name: "Jarvis", description: "Your personal assistant.", tone: "professional", coreDirective: "", systemPrompt: "", emoji: "", color: "#00ff41" }

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (el === null) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`
  }, [inputText])

  // When voice produces a transcript, fill the input
  const handleTranscriptReady = useCallback((transcript: string): void => {
    setInputText((prev) => (prev.trim().length === 0 ? transcript : `${prev} ${transcript}`))
    textareaRef.current?.focus()
  }, [])

  const voice = useVoice(handleTranscriptReady)

  // ── Submission ──────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async (): Promise<void> => {
    const text = inputText.trim()
    if ((text.length === 0 && pendingAttachments.length === 0) || isStreaming) return
    if (currentConversationId === null) return

    const attachmentsCopy = [...pendingAttachments]
    setInputText('')
    setPendingAttachments([])
    setAttachmentError(null)

    // Add user message
    addMessage(currentConversationId, {
      role: 'user',
      content: text,
      attachments: attachmentsCopy,
    })

    // Add placeholder assistant message
    const assistantMessageId = addMessage(currentConversationId, {
      role: 'assistant',
      content: '',
      model: currentConversation?.model ?? 'anthropic/claude-sonnet-4-6',
      persona: persona.id,
    })

    setIsStreaming(true)
    setStreamingMessageId(assistantMessageId)

    const controller = new AbortController()
    abortControllerRef.current = controller

    let accumulated = ''

    await streamMessage(
      {
        messages: currentConversation?.messages ?? [],
        systemPrompt: persona.systemPrompt,
        model: currentConversation?.model ?? 'anthropic/claude-sonnet-4-6',
        apiKey: settings.openRouterApiKey,
        attachments: attachmentsCopy,
        signal: controller.signal,
      },
      {
        onToken: (token: string) => {
          accumulated += token
          updateMessageContent(currentConversationId, assistantMessageId, accumulated)
        },
        onDone: (fullContent: string) => {
          updateMessageContent(currentConversationId, assistantMessageId, fullContent)
          finalizeStreamingMessage(currentConversationId, assistantMessageId)
          abortControllerRef.current = null
        },
        onError: (error: Error) => {
          updateMessageContent(
            currentConversationId,
            assistantMessageId,
            `Error: ${error.message}`,
            { errorDetail: error.message, isStreaming: false }
          )
          finalizeStreamingMessage(currentConversationId, assistantMessageId)
          abortControllerRef.current = null
        },
      }
    )
  }, [
    inputText,
    pendingAttachments,
    isStreaming,
    currentConversationId,
    currentConversation,
    persona,
    settings,
    addMessage,
    updateMessageContent,
    finalizeStreamingMessage,
    setIsStreaming,
    setStreamingMessageId,
  ])

  const handleAbort = useCallback((): void => {
    if (abortControllerRef.current !== null) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
  }, [])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>): void => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  // ── File Attachment ─────────────────────────────────────────────────────────

  const handleFileChange = useCallback(async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    // Reset input so the same file can be re-selected
    e.target.value = ''

    setAttachmentError(null)

    const processed: Attachment[] = []
    for (const file of files) {
      try {
        const attachment = await processUserFile(file, 'user')
        processed.push(attachment)
      } catch (err: unknown) {
        if (err instanceof AttachmentSizeLimitError || err instanceof AttachmentTypeError) {
          setAttachmentError(err.message)
        } else {
          setAttachmentError(`Failed to process "${file.name}": ${err instanceof Error ? err.message : 'unknown error'}`)
        }
      }
    }

    if (processed.length > 0) {
      setPendingAttachments((prev) => [...prev, ...processed])
    }
  }, [])

  const removeAttachment = useCallback((id: string): void => {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id))
  }, [])

  const isDisabled = settings.openRouterApiKey.trim() === '' && networkStatus !== 'offline'

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="border-t border-[var(--primary)]/30 bg-[var(--dim)]/60 px-4 py-3">
      <div className="max-w-4xl mx-auto space-y-2">

        {/* Attachment error */}
        {attachmentError !== null && (
          <div className="text-xs text-red-400 font-mono px-1 flex items-center gap-2">
            <span>{attachmentError}</span>
            <button onClick={() => setAttachmentError(null)} className="text-red-400/60 hover:text-red-400">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Pending attachment strip */}
        {pendingAttachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {pendingAttachments.map((att) => (
              <AttachmentChip
                key={att.id}
                attachment={att}
                onRemove={() => removeAttachment(att.id)}
              />
            ))}
          </div>
        )}

        {/* Input row */}
        <div className="flex items-end gap-2">

          {/* File picker */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,application/pdf,text/plain,text/markdown,application/json,audio/*,video/mp4"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isStreaming}
            title="Attach file or image"
            className="flex-shrink-0 p-2.5 rounded-lg border border-[var(--primary)]/30
              hover:border-[var(--primary)]/70 hover:bg-[var(--dim)]
              transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Paperclip className="w-4 h-4 text-[var(--secondary)]" />
          </button>

          {/* Textarea */}
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                networkStatus === 'offline'
                  ? 'Offline mode -- local commands only'
                  : isDisabled
                  ? 'Add your OpenRouter API key in Settings'
                  : 'Type a message... (Shift+Enter for new line)'
              }
              disabled={isStreaming}
              rows={1}
              className="w-full resize-none bg-[var(--bg)] border border-[var(--primary)]/30
                rounded-lg px-4 py-3 pr-3 text-[var(--text)] placeholder:text-[var(--secondary)]/50
                focus:outline-none focus:border-[var(--primary)]/70
                disabled:opacity-50 font-mono text-sm
                transition-colors"
              style={{ minHeight: '48px', maxHeight: '240px' }}
            />
          </div>

          {/* Voice button */}
          {settings.voiceEnabled && (
            <VoiceButton voice={voice} disabled={isStreaming} />
          )}

          {/* Send / Stop */}
          {isStreaming ? (
            <button
              type="button"
              onClick={handleAbort}
              title="Stop generation"
              className="flex-shrink-0 p-2.5 rounded-lg border border-red-500/50
                bg-red-500/10 hover:bg-red-500/20 transition-colors"
            >
              <Square className="w-4 h-4 text-red-400" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={
                (inputText.trim().length === 0 && pendingAttachments.length === 0) || isDisabled
              }
              title="Send message"
              className="flex-shrink-0 p-2.5 rounded-lg border border-[var(--primary)]/30
                hover:border-[var(--primary)] hover:bg-[var(--dim)]
                transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4 text-[var(--primary)]" />
            </button>
          )}
        </div>

        {/* Status bar */}
        <div className="flex items-center justify-between text-[10px] font-mono text-[var(--secondary)]/60 px-1">
          <div className="flex items-center gap-3">
            {networkStatus === 'offline' && (
              <span className="flex items-center gap-1 text-yellow-500/80">
                <WifiOff className="w-3 h-3" />
                offline
              </span>
            )}
            {isStreaming && (
              <span className="flex items-center gap-1 text-[var(--primary)]/70">
                <Loader2 className="w-3 h-3 animate-spin" />
                generating
              </span>
            )}
            {voice.transcriptionState === 'transcribing' && (
              <span className="text-cyan-400/70">transcribing audio...</span>
            )}
            {voice.errorMessage !== null && (
              <span className="text-red-400/80">{voice.errorMessage}</span>
            )}
          </div>
          <span>
            {inputText.length > 0 ? `${inputText.length} chars` : ''}
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface VoiceButtonProps {
  voice: ReturnType<typeof useVoice>
  disabled: boolean
}

function VoiceButton({ voice, disabled }: VoiceButtonProps): ReactElement {
  const isActive = voice.transcriptionState === 'recording'
  const isProcessing = voice.transcriptionState === 'transcribing'

  const handleClick = (): void => {
    if (isActive) {
      voice.stopVoiceInput()
    } else {
      voice.startVoiceInput()
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || isProcessing}
      title={isActive ? 'Stop recording' : 'Start voice input'}
      className={`flex-shrink-0 p-2.5 rounded-lg border transition-colors
        disabled:opacity-40 disabled:cursor-not-allowed
        ${isActive
          ? 'border-red-500/70 bg-red-500/15 text-red-400 animate-pulse'
          : isProcessing
          ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-400'
          : 'border-[var(--primary)]/30 hover:border-[var(--primary)]/70 hover:bg-[var(--dim)]'
        }`}
    >
      {isProcessing ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : isActive ? (
        <MicOff className="w-4 h-4" />
      ) : (
        <Mic className="w-4 h-4 text-[var(--secondary)]" />
      )}
    </button>
  )
}

interface AttachmentChipProps {
  attachment: Attachment
  onRemove: () => void
}

function AttachmentChip({ attachment, onRemove }: AttachmentChipProps): ReactElement {
  const isImage = attachment.mediaType.startsWith('image/')

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md
      border border-[var(--primary)]/30 bg-[var(--dim)]/80 max-w-[200px]">
      {isImage && attachment.previewUrl !== null ? (
        <img
          src={attachment.previewUrl}
          alt={attachment.filename}
          className="w-6 h-6 object-cover rounded"
        />
      ) : (
        <Paperclip className="w-3 h-3 text-[var(--secondary)] flex-shrink-0" />
      )}
      <button
        type="button"
        onClick={() => downloadAttachment(attachment)}
        className="text-[10px] font-mono text-[var(--text)]/80 truncate hover:text-[var(--primary)] transition-colors"
        title={`${attachment.filename} (${attachment.sizeLabel}) — click to download`}
      >
        {attachment.filename.length > 20
          ? `${attachment.filename.slice(0, 18)}...`
          : attachment.filename}
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="flex-shrink-0 text-[var(--secondary)]/60 hover:text-red-400 transition-colors"
        title="Remove attachment"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}
