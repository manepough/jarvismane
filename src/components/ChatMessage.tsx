'use client'

/**
 * src/components/ChatMessage.tsx
 * Renders a single message with:
 *  - Markdown + syntax-highlighted code blocks
 *  - Inline image previews for vision attachments
 *  - Download chips for non-image file attachments
 *  - Streaming cursor while isStreaming is true
 *  - Copy-to-clipboard button
 *  - Error state styling
 */

import { useState, useCallback, type ReactElement } from 'react'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Copy, Check, Download, FileText, AlertCircle } from 'lucide-react'
import { downloadAttachment } from '@/services/AttachmentService'
import type { Message, Attachment } from '@/types'

// ─── Props ────────────────────────────────────────────────────────────────────

interface ChatMessageProps {
  message: Message
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ChatMessage({ message }: ChatMessageProps): ReactElement {
  const [copied, setCopied] = useState<boolean>(false)
  const isUser = message.role === 'user'
  const hasError = message.errorDetail !== undefined

  const handleCopy = useCallback(async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard write failed (e.g. permission denied) — silent fail
    }
  }, [message.content])

  const imageAttachments = message.attachments.filter((a) => a.mediaType.startsWith('image/'))
  const fileAttachments = message.attachments.filter((a) => !a.mediaType.startsWith('image/'))

  return (
    <div className={`flex gap-3 group ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar dot */}
      <div
        className={`flex-shrink-0 mt-1 w-2 h-2 rounded-full self-start
          ${isUser
            ? 'bg-[var(--primary)]/60'
            : hasError
            ? 'bg-red-500/60'
            : 'bg-[var(--secondary)]/60'
          }`}
      />

      {/* Bubble */}
      <div
        className={`max-w-[75%] min-w-0 flex flex-col gap-2
          ${isUser ? 'items-end' : 'items-start'}`}
      >
        {/* Image attachments */}
        {imageAttachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {imageAttachments.map((att) => (
              <ImageAttachment key={att.id} attachment={att} />
            ))}
          </div>
        )}

        {/* File attachments */}
        {fileAttachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {fileAttachments.map((att) => (
              <FileAttachmentChip key={att.id} attachment={att} />
            ))}
          </div>
        )}

        {/* Message content */}
        {(message.content.length > 0 || message.isStreaming) && (
          <div
            className={`relative rounded-lg px-4 py-3 text-sm font-mono leading-relaxed
              ${isUser
                ? 'bg-[var(--dim)] border border-[var(--primary)]/20 text-[var(--text)]'
                : hasError
                ? 'bg-red-950/30 border border-red-500/30 text-red-300'
                : 'bg-[var(--bg)] border border-[var(--primary)]/10 text-[var(--text)]'
              }`}
          >
            {hasError && (
              <div className="flex items-center gap-1.5 mb-2 text-red-400 text-xs">
                <AlertCircle className="w-3 h-3" />
                <span>Error</span>
              </div>
            )}

            {isUser ? (
              <p className="whitespace-pre-wrap break-words">{message.content}</p>
            ) : (
              <MarkdownContent content={message.content} />
            )}

            {/* Streaming cursor */}
            {message.isStreaming && (
              <span className="inline-block w-1.5 h-4 bg-[var(--primary)] ml-0.5 animate-pulse" />
            )}

            {/* Copy button — only shown on hover for assistant messages */}
            {!isUser && !message.isStreaming && message.content.length > 0 && (
              <button
                type="button"
                onClick={handleCopy}
                title="Copy message"
                className="absolute top-2 right-2 p-1 rounded opacity-0 group-hover:opacity-100
                  text-[var(--secondary)] hover:text-[var(--primary)] transition-all"
              >
                {copied ? (
                  <Check className="w-3 h-3" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </button>
            )}
          </div>
        )}

        {/* Timestamp */}
        <span className="text-[10px] text-[var(--secondary)]/40 font-mono px-1">
          {formatTimestamp(message.timestamp)}
          {message.isOfflineGenerated && (
            <span className="ml-2 text-yellow-500/60">offline</span>
          )}
        </span>
      </div>
    </div>
  )
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

function MarkdownContent({ content }: { content: string }): ReactElement {
  return (
    <ReactMarkdown
      components={{
        code({ inline, className, children, ...props }: {
          inline?: boolean
          className?: string
          children?: React.ReactNode
        }) {
          const match = /language-(\w+)/.exec(className ?? '')
          const language = match?.[1] ?? ''
          const codeString = String(children).replace(/\n$/, '')

          if (!inline && language.length > 0) {
            return (
              <div className="my-2 rounded-md overflow-hidden border border-[var(--primary)]/20">
                <div className="flex items-center justify-between px-3 py-1 bg-[var(--dim)] border-b border-[var(--primary)]/20">
                  <span className="text-[10px] text-[var(--secondary)]/60 font-mono uppercase tracking-wider">
                    {language}
                  </span>
                  <CopyButton text={codeString} />
                </div>
                <SyntaxHighlighter
                  style={atomDark}
                  language={language}
                  PreTag="div"
                  customStyle={{
                    margin: 0,
                    borderRadius: 0,
                    background: 'transparent',
                    fontSize: '0.78rem',
                  }}
                  {...props}
                >
                  {codeString}
                </SyntaxHighlighter>
              </div>
            )
          }

          return (
            <code
              className="bg-[var(--dim)] border border-[var(--primary)]/20 rounded px-1.5 py-0.5 text-[0.8em] text-[var(--primary)]"
              {...props}
            >
              {children}
            </code>
          )
        },
        p({ children }) {
          return <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
        },
        ul({ children }) {
          return <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>
        },
        ol({ children }) {
          return <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>
        },
        li({ children }) {
          return <li className="text-[var(--text)]">{children}</li>
        },
        h1({ children }) {
          return <h1 className="text-lg font-semibold mb-2 text-[var(--primary)]">{children}</h1>
        },
        h2({ children }) {
          return <h2 className="text-base font-semibold mb-2 text-[var(--primary)]">{children}</h2>
        },
        h3({ children }) {
          return <h3 className="text-sm font-semibold mb-1 text-[var(--primary)]">{children}</h3>
        },
        blockquote({ children }) {
          return (
            <blockquote className="border-l-2 border-[var(--primary)]/40 pl-3 my-2 text-[var(--secondary)]">
              {children}
            </blockquote>
          )
        },
        a({ href, children }) {
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--primary)] underline hover:opacity-80"
            >
              {children}
            </a>
          )
        },
        table({ children }) {
          return (
            <div className="overflow-x-auto my-2">
              <table className="border-collapse text-xs w-full">{children}</table>
            </div>
          )
        },
        th({ children }) {
          return (
            <th className="border border-[var(--primary)]/20 px-3 py-1.5 text-left bg-[var(--dim)] text-[var(--primary)]">
              {children}
            </th>
          )
        },
        td({ children }) {
          return (
            <td className="border border-[var(--primary)]/20 px-3 py-1.5">
              {children}
            </td>
          )
        },
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }): ReactElement {
  const [copied, setCopied] = useState<boolean>(false)

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Silent fail
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="text-[var(--secondary)]/50 hover:text-[var(--primary)] transition-colors"
      title="Copy code"
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
    </button>
  )
}

function ImageAttachment({ attachment }: { attachment: Attachment }): ReactElement {
  const src = attachment.previewUrl ?? `data:${attachment.mediaType};base64,${attachment.data}`

  return (
    <button
      type="button"
      onClick={() => downloadAttachment(attachment)}
      title={`${attachment.filename} (${attachment.sizeLabel}) — click to download`}
      className="relative group/img block max-w-[320px] rounded-lg overflow-hidden
        border border-[var(--primary)]/20 hover:border-[var(--primary)]/60 transition-colors"
    >
      <img
        src={src}
        alt={attachment.filename}
        className="max-w-full max-h-64 object-contain block"
        loading="lazy"
      />
      <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/20 transition-colors
        flex items-center justify-center opacity-0 group-hover/img:opacity-100">
        <Download className="w-5 h-5 text-white drop-shadow" />
      </div>
    </button>
  )
}

function FileAttachmentChip({ attachment }: { attachment: Attachment }): ReactElement {
  return (
    <button
      type="button"
      onClick={() => downloadAttachment(attachment)}
      title={`Download ${attachment.filename} (${attachment.sizeLabel})`}
      className="flex items-center gap-2 px-3 py-2 rounded-lg
        border border-[var(--primary)]/20 hover:border-[var(--primary)]/60
        bg-[var(--dim)]/60 transition-colors text-left"
    >
      <FileText className="w-4 h-4 text-[var(--secondary)] flex-shrink-0" />
      <div>
        <div className="text-xs font-mono text-[var(--text)] truncate max-w-[160px]">
          {attachment.filename}
        </div>
        <div className="text-[10px] text-[var(--secondary)]/60">
          {attachment.sizeLabel}
        </div>
      </div>
      <Download className="w-3 h-3 text-[var(--secondary)]/50 flex-shrink-0" />
    </button>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}
