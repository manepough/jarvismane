'use client'

import { useRef, useEffect, useState, useCallback, type ReactElement } from 'react'
import { useStore } from '@/store'
import { ChatMessage } from './ChatMessage'
import { ChatInput } from './ChatInput'

export function ChatArea(): ReactElement {
  const { currentConversation, personas, currentPersonaId } = useStore()
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const [showScrollBtn, setShowScrollBtn] = useState(false)

  const persona = personas.find(p => p.id === currentPersonaId) ?? {
    id: 'jarvis', name: 'Jarvis', color: '#00ff41',
    description: 'Your personal assistant.', tone: '', coreDirective: '',
    systemPrompt: '', emoji: '',
  }

  const isNearBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120
  }, [])

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    setShowScrollBtn(false)
  }, [])

  useEffect(() => {
    if (isNearBottom()) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    else setShowScrollBtn(true)
  }, [currentConversation?.messages.length, isNearBottom])

  if (!currentConversation) return <></>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', position: 'relative' }}>
      {/* Header */}
      <div style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 20px',
        borderBottom: '1px solid rgba(0,255,65,0.15)',
        background: 'rgba(17,22,17,0.5)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: persona.color }} />
          <span style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>
            {persona.name}
          </span>
          <span style={{ fontFamily: 'monospace', fontSize: '10px', color: 'rgba(74,124,89,0.45)' }}>
            {currentConversation.model.split('/').pop()}
          </span>
        </div>
        <span style={{ fontFamily: 'monospace', fontSize: '10px', color: 'rgba(74,124,89,0.35)' }}>
          {currentConversation.messages.length} {currentConversation.messages.length === 1 ? 'message' : 'messages'}
        </span>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={() => setShowScrollBtn(!isNearBottom())}
        style={{ flex: 1, overflowY: 'auto', padding: '20px 16px' }}
      >
        {currentConversation.messages.length === 0 ? (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: '100%', fontFamily: 'monospace', fontSize: '13px',
            color: 'rgba(74,124,89,0.4)', textAlign: 'center',
          }}>
            {persona.description}
          </div>
        ) : (
          <div style={{ maxWidth: '760px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {currentConversation.messages.map(msg => (
              <ChatMessage key={msg.id} message={msg} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Scroll to bottom button */}
      {showScrollBtn && currentConversation.messages.length > 0 && (
        <button
          onClick={scrollToBottom}
          style={{
            position: 'absolute',
            bottom: '90px',
            right: '16px',
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            border: '1px solid rgba(0,255,65,0.4)',
            background: 'rgba(17,22,17,0.95)',
            color: 'var(--primary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '16px',
            boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
          }}
        >
          ↓
        </button>
      )}

      <ChatInput />
    </div>
  )
}
