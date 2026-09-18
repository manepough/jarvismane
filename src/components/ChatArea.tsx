'use client'

/**
 * src/components/ChatArea.tsx
 * Scrollable message list + sticky ChatInput.
 * Auto-scrolls to bottom on new messages unless the user has scrolled up.
 */

import { useRef, useEffect, useState, useCallback, type ReactElement } from 'react'
import { useStore } from '@/store'
import { ChatMessage } from './ChatMessage'
import { ChatInput } from './ChatInput'
import { ArrowDown } from 'lucide-react'

export function ChatArea(): ReactElement {
  const { currentConversation, personas, currentPersonaId, settings } = useStore()
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const [showScrollButton, setShowScrollButton] = useState<boolean>(false)

  const persona = personas.find((p) => p.id === currentPersonaId) ?? {
    id: 'jarvis',
    name: 'Jarvis',
    description: 'Your personal assistant.',
    tone: 'professional',
    coreDirective: '',
    systemPrompt: '',
    emoji: '',
    color: '#00ff41',
  }

  const isNearBottom = useCallback((): boolean => {
    const el = scrollRef.current
    if (el === null) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120
  }, [])

  const scrollToBottom = useCallback((): void => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    setShowScrollButton(false)
  }, [])

  useEffect(() => {
    if (isNearBottom()) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    } else {
      setShowScrollButton(true)
    }
  }, [currentConversation?.messages.length, isNearBottom])

  const handleScroll = useCallback((): void => {
    setShowScrollButton(!isNearBottom())
  }, [isNearBottom])

  if (currentConversation === null) return <></>

  const messages = currentConversation.messages

  return (
    <div className="flex flex-col h-screen">

      {/* Header */}
      <header className="flex-shrink-0 flex items-center justify-between px-5 py-3
        border-b border-[var(--primary)]/20 bg-[var(--dim)]/40">
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: persona.color }}
          />
          <span className="font-mono text-sm font-medium text-[var(--text)]">
            {persona.name}
          </span>
          <span className="text-[10px] font-mono text-[var(--secondary)]/50">
            {currentConversation.model.split('/').pop()}
          </span>
        </div>
        <span className="text-[10px] font-mono text-[var(--secondary)]/40">
          {messages.length} {messages.length === 1 ? 'message' : 'messages'}
        </span>
      </header>

      {/* Message list */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-5"
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <p className="font-mono text-sm text-[var(--secondary)]/50 text-center max-w-sm">
              {persona.description}
            </p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-5">
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Scroll to bottom button */}
      {showScrollButton && messages.length > 0 && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-24 right-5 p-2 rounded-full
            border border-[var(--primary)]/40 bg-[var(--dim)]/90
            hover:border-[var(--primary)] transition-colors shadow-lg"
          aria-label="Scroll to latest message"
        >
          <ArrowDown className="w-4 h-4 text-[var(--primary)]" />
        </button>
      )}

      {/* Input */}
      <ChatInput />
    </div>
  )
}
