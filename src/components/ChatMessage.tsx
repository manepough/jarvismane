'use client'

import { useState, useCallback, type ReactElement } from 'react'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { downloadAttachment } from '@/services/AttachmentService'
import type { Message, Attachment } from '@/types'

const S = {
  row: (isUser: boolean) => ({
    display: 'flex',
    gap: '10px',
    flexDirection: (isUser ? 'row-reverse' : 'row') as 'row' | 'row-reverse',
    alignItems: 'flex-start',
  }),
  dot: (isUser: boolean, hasError: boolean) => ({
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    flexShrink: 0,
    marginTop: '8px',
    background: hasError ? '#ff4444' : isUser ? 'rgba(0,255,65,0.5)' : 'rgba(74,124,89,0.5)',
  }),
  msgWrap: (isUser: boolean) => ({
    maxWidth: '78%',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
    alignItems: isUser ? 'flex-end' : 'flex-start',
  }),
  imgGrid: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '8px',
  },
  imgBtn: {
    border: '1px solid rgba(0,255,65,0.2)',
    borderRadius: '8px',
    overflow: 'hidden',
    cursor: 'pointer',
    background: 'transparent',
    padding: 0,
  },
  fileChip: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    border: '1px solid rgba(0,255,65,0.2)',
    borderRadius: '8px',
    background: 'rgba(17,22,17,0.7)',
    cursor: 'pointer',
    fontFamily: 'monospace',
    fontSize: '11px',
    color: 'var(--text)',
  },
  bubble: (isUser: boolean, hasError: boolean) => ({
    position: 'relative' as const,
    borderRadius: '10px',
    padding: '10px 14px',
    fontSize: '13px',
    fontFamily: 'monospace',
    lineHeight: '1.6',
    color: 'var(--text)',
    background: isUser ? 'var(--dim)' : hasError ? 'rgba(255,68,68,0.08)' : 'var(--bg)',
    border: isUser
      ? '1px solid rgba(0,255,65,0.15)'
      : hasError
      ? '1px solid rgba(255,68,68,0.3)'
      : '1px solid rgba(0,255,65,0.08)',
    wordBreak: 'break-word' as const,
  }),
  copyBtn: {
    position: 'absolute' as const,
    top: '8px',
    right: '8px',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: 'rgba(74,124,89,0.5)',
    fontSize: '12px',
    padding: '2px 4px',
    borderRadius: '4px',
  },
  cursor: {
    display: 'inline-block',
    width: '8px',
    height: '14px',
    background: 'var(--primary)',
    marginLeft: '2px',
    verticalAlign: 'text-bottom',
    animation: 'blink 0.8s step-end infinite',
  },
  ts: {
    fontFamily: 'monospace',
    fontSize: '10px',
    color: 'rgba(74,124,89,0.35)',
    paddingLeft: '2px',
  },
  codeHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '4px 12px',
    background: 'rgba(17,22,17,0.9)',
    borderBottom: '1px solid rgba(0,255,65,0.15)',
    fontFamily: 'monospace',
    fontSize: '10px',
    color: 'rgba(74,124,89,0.6)',
    letterSpacing: '1px',
    textTransform: 'uppercase' as const,
  },
  codeWrap: {
    margin: '8px 0',
    borderRadius: '8px',
    overflow: 'hidden',
    border: '1px solid rgba(0,255,65,0.15)',
  },
  inlineCode: {
    background: 'rgba(17,22,17,0.9)',
    border: '1px solid rgba(0,255,65,0.15)',
    borderRadius: '4px',
    padding: '1px 6px',
    fontSize: '0.85em',
    color: 'var(--primary)',
    fontFamily: 'monospace',
  },
}

interface ChatMessageProps { message: Message }

export function ChatMessage({ message }: ChatMessageProps): ReactElement {
  const [copied, setCopied] = useState(false)
  const isUser = message.role === 'user'
  const hasError = !!message.errorDetail

  const handleCopy = useCallback(async () => {
    try { await navigator.clipboard.writeText(message.content); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch {}
  }, [message.content])

  const images = message.attachments.filter(a => a.mediaType.startsWith('image/'))
  const files  = message.attachments.filter(a => !a.mediaType.startsWith('image/'))

  return (
    <div style={S.row(isUser)}>
      <div style={S.dot(isUser, hasError)} />
      <div style={S.msgWrap(isUser)}>
        {images.length > 0 && (
          <div style={S.imgGrid}>
            {images.map(att => <ImageAtt key={att.id} att={att} />)}
          </div>
        )}
        {files.length > 0 && (
          <div style={S.imgGrid}>
            {files.map(att => <FileAtt key={att.id} att={att} />)}
          </div>
        )}
        {(message.content.length > 0 || message.isStreaming) && (
          <div style={S.bubble(isUser, hasError)}>
            {hasError && <div style={{ color: '#ff6666', fontSize: '11px', marginBottom: '6px' }}>⚠ Error</div>}
            {isUser
              ? <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{message.content}</p>
              : <MdContent content={message.content} />
            }
            {message.isStreaming && <span style={S.cursor} />}
            {!isUser && !message.isStreaming && message.content.length > 0 && (
              <button style={S.copyBtn} onClick={handleCopy} title="Copy">
                {copied ? '✓' : '⎘'}
              </button>
            )}
          </div>
        )}
        <div style={S.ts}>
          {fmt(message.timestamp)}
          {message.isOfflineGenerated && <span style={{ marginLeft: '8px', color: '#ffcc00' }}>offline</span>}
        </div>
      </div>
    </div>
  )
}

function ImageAtt({ att }: { att: Attachment }): ReactElement {
  const src = att.previewUrl ?? `data:${att.mediaType};base64,${att.data}`
  return (
    <button style={S.imgBtn} onClick={() => downloadAttachment(att)} title={`${att.filename} — click to download`}>
      <img src={src} alt={att.filename} style={{ maxWidth: '280px', maxHeight: '220px', objectFit: 'contain', display: 'block' }} loading="lazy" />
    </button>
  )
}

function FileAtt({ att }: { att: Attachment }): ReactElement {
  return (
    <button style={S.fileChip} onClick={() => downloadAttachment(att)} title={`Download ${att.filename}`}>
      <span>📄</span>
      <div style={{ textAlign: 'left' }}>
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px' }}>{att.filename}</div>
        <div style={{ fontSize: '10px', color: 'var(--secondary)', opacity: 0.6 }}>{att.sizeLabel}</div>
      </div>
      <span style={{ marginLeft: '4px', opacity: 0.5 }}>↓</span>
    </button>
  )
}

function CopyBtn({ text }: { text: string }): ReactElement {
  const [c, setC] = useState(false)
  return (
    <button
      onClick={async () => { try { await navigator.clipboard.writeText(text); setC(true); setTimeout(() => setC(false), 2000) } catch {} }}
      style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(74,124,89,0.5)', fontSize: '11px', padding: '2px' }}
    >
      {c ? '✓' : '⎘'}
    </button>
  )
}

function MdContent({ content }: { content: string }): ReactElement {
  return (
    <ReactMarkdown
      components={{
        code({ inline, className, children }: { inline?: boolean; className?: string; children?: React.ReactNode }) {
          const lang = /language-(\w+)/.exec(className ?? '')?.[1] ?? ''
          const code = String(children).replace(/\n$/, '')
          if (!inline && lang) {
            return (
              <div style={S.codeWrap}>
                <div style={S.codeHeader}>
                  <span>{lang}</span>
                  <CopyBtn text={code} />
                </div>
                <SyntaxHighlighter style={atomDark} language={lang} PreTag="div"
                  customStyle={{ margin: 0, borderRadius: 0, background: 'transparent', fontSize: '12px' }}>
                  {code}
                </SyntaxHighlighter>
              </div>
            )
          }
          return <code style={S.inlineCode}>{children}</code>
        },
        p({ children }) { return <p style={{ margin: '0 0 6px 0' }}>{children}</p> },
        ul({ children }) { return <ul style={{ margin: '4px 0', paddingLeft: '18px' }}>{children}</ul> },
        ol({ children }) { return <ol style={{ margin: '4px 0', paddingLeft: '18px' }}>{children}</ol> },
        li({ children }) { return <li style={{ marginBottom: '2px' }}>{children}</li> },
        h1({ children }) { return <h1 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--primary)', margin: '8px 0 4px' }}>{children}</h1> },
        h2({ children }) { return <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--primary)', margin: '6px 0 4px' }}>{children}</h2> },
        h3({ children }) { return <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--primary)', margin: '4px 0 2px' }}>{children}</h3> },
        blockquote({ children }) { return <blockquote style={{ borderLeft: '2px solid rgba(0,255,65,0.35)', paddingLeft: '10px', margin: '6px 0', color: 'var(--secondary)' }}>{children}</blockquote> },
        a({ href, children }) { return <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'underline' }}>{children}</a> },
        table({ children }) { return <div style={{ overflowX: 'auto', margin: '6px 0' }}><table style={{ borderCollapse: 'collapse', fontSize: '12px', width: '100%' }}>{children}</table></div> },
        th({ children }) { return <th style={{ border: '1px solid rgba(0,255,65,0.2)', padding: '4px 10px', background: 'var(--dim)', color: 'var(--primary)', textAlign: 'left' }}>{children}</th> },
        td({ children }) { return <td style={{ border: '1px solid rgba(0,255,65,0.15)', padding: '4px 10px' }}>{children}</td> },
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

function fmt(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
