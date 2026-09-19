'use client'

import { useState, useCallback, useEffect, useRef, type ReactElement } from 'react'
import { useStore } from '@/store'

interface WelcomeScreenProps {
  onOpenSettings: () => void
}

export function WelcomeScreen({ onOpenSettings: _onOpenSettings }: WelcomeScreenProps): ReactElement {
  const { settings, updateSettings, createConversation } = useStore()
  const [inputKey, setInputKey] = useState('')
  const [validating, setValidating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [phase, setPhase] = useState<'signin' | 'ready'>(
    settings.openRouterApiKey.trim().length > 0 ? 'ready' : 'signin'
  )
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (settings.openRouterApiKey.trim().length > 0) setPhase('ready')
  }, [settings.openRouterApiKey])

  const handleConnect = useCallback(() => {
    const key = inputKey.trim()
    if (!key) { setError('Paste your OpenRouter API key first.'); return }

    setValidating(true)
    setError(null)

    // Use XMLHttpRequest for max WebView compatibility — no AbortSignal needed
    const xhr = new XMLHttpRequest()
    xhr.open('GET', 'https://openrouter.ai/api/v1/models', true)
    xhr.setRequestHeader('Authorization', `Bearer ${key}`)
    xhr.timeout = 10000

    xhr.onload = () => {
      setValidating(false)
      if (xhr.status === 200) {
        updateSettings({ openRouterApiKey: key })
        setPhase('ready')
      } else if (xhr.status === 401 || xhr.status === 403) {
        setError('Invalid key. Get one at openrouter.ai/keys')
      } else {
        // Accept the key anyway — might be a temporary server issue
        updateSettings({ openRouterApiKey: key })
        setPhase('ready')
      }
    }

    xhr.onerror = () => {
      setValidating(false)
      // Network error — save the key anyway and let the chat handle errors
      if (key.startsWith('sk-or-')) {
        updateSettings({ openRouterApiKey: key })
        setPhase('ready')
      } else {
        setError('Could not verify key. Check your internet connection.')
      }
    }

    xhr.ontimeout = () => {
      setValidating(false)
      // Timeout — save the key anyway if it looks valid
      if (key.startsWith('sk-or-') || key.length > 20) {
        updateSettings({ openRouterApiKey: key })
        setPhase('ready')
      } else {
        setError('Request timed out. Try again.')
      }
    }

    xhr.send()
  }, [inputKey, updateSettings])

  const handleStart = useCallback(() => createConversation(), [createConversation])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleConnect()
  }, [handleConnect])

  if (phase === 'signin') {
    return (
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '32px 20px', minHeight: '100vh', background: 'var(--bg)',
      }}>
        <div style={{ width: '100%', maxWidth: '360px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'monospace', fontSize: '34px', fontWeight: 700, letterSpacing: '8px', color: 'var(--primary)', marginBottom: '6px' }}>
              JARVIS
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: '10px', color: 'rgba(74,124,89,0.55)', letterSpacing: '3px' }}>
              CONNECT YOUR OPENROUTER ACCOUNT
            </div>
          </div>

          <div style={{ height: '1px', background: 'rgba(0,255,65,0.1)' }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <div style={{ fontFamily: 'monospace', fontSize: '10px', color: 'rgba(212,245,212,0.5)', letterSpacing: '1px', marginBottom: '8px' }}>
                API KEY
              </div>
              <input
                ref={inputRef}
                type="password"
                value={inputKey}
                onChange={e => { setInputKey(e.target.value); setError(null) }}
                onKeyDown={handleKeyDown}
                placeholder="sk-or-v1-..."
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                style={{
                  width: '100%', padding: '12px 14px',
                  background: 'var(--dim)',
                  border: `1px solid ${error ? 'rgba(255,68,68,0.4)' : 'rgba(0,255,65,0.2)'}`,
                  borderRadius: '8px', color: 'var(--text)',
                  fontFamily: 'monospace', fontSize: '13px', outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {error && (
              <div style={{
                fontFamily: 'monospace', fontSize: '11px', color: '#ff8888',
                padding: '8px 12px', background: 'rgba(255,68,68,0.06)',
                border: '1px solid rgba(255,68,68,0.2)', borderRadius: '6px',
              }}>
                {error}
              </div>
            )}

            <button
              onClick={handleConnect}
              disabled={validating}
              style={{
                width: '100%', padding: '13px',
                borderRadius: '8px',
                border: '1px solid rgba(0,255,65,0.45)',
                background: validating ? 'rgba(0,255,65,0.06)' : 'rgba(0,255,65,0.04)',
                color: 'var(--primary)',
                fontFamily: 'monospace', fontSize: '13px', fontWeight: 600,
                cursor: validating ? 'wait' : 'pointer',
                letterSpacing: '1px', transition: 'all 0.15s',
                boxSizing: 'border-box',
              }}
            >
              {validating ? 'Connecting...' : 'Connect'}
            </button>

            <div style={{ textAlign: 'center' }}>
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontFamily: 'monospace', fontSize: '11px', color: 'rgba(74,124,89,0.5)', textDecoration: 'underline' }}
              >
                Get a free key at openrouter.ai/keys
              </a>
            </div>
          </div>

          <div style={{ border: '1px solid rgba(0,255,65,0.08)', borderRadius: '8px', padding: '14px' }}>
            <div style={{ fontFamily: 'monospace', fontSize: '9px', color: 'rgba(74,124,89,0.35)', letterSpacing: '2px', textTransform: 'uppercase' as const, marginBottom: '10px' }}>
              Capabilities
            </div>
            {[
              'Auto-selects best model — falls back on rate limit',
              'Race mode — all models compete, best answer wins',
              'Voice input + image and file attachments',
              'No topic restrictions',
              'Offline local command parser',
            ].map(item => (
              <div key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '7px' }}>
                <span style={{ color: 'var(--primary)', fontSize: '7px', marginTop: '3px', flexShrink: 0 }}>◆</span>
                <span style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--secondary)', lineHeight: '1.4' }}>{item}</span>
              </div>
            ))}
          </div>

        </div>
      </div>
    )
  }

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '32px 20px', minHeight: '100vh', background: 'var(--bg)',
    }}>
      <div style={{ width: '100%', maxWidth: '360px', display: 'flex', flexDirection: 'column', gap: '20px', textAlign: 'center' }}>
        <div>
          <div style={{ fontFamily: 'monospace', fontSize: '34px', fontWeight: 700, letterSpacing: '8px', color: 'var(--primary)', marginBottom: '6px' }}>
            JARVIS
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: '10px', color: 'rgba(74,124,89,0.55)', letterSpacing: '2px' }}>
            READY
          </div>
        </div>

        <div style={{ height: '1px', background: 'rgba(0,255,65,0.1)' }} />

        <button
          onClick={handleStart}
          style={{
            width: '100%', padding: '14px',
            borderRadius: '8px',
            border: '1px solid rgba(0,255,65,0.45)',
            background: 'rgba(0,255,65,0.04)',
            color: 'var(--primary)', fontFamily: 'monospace',
            fontSize: '13px', fontWeight: 600, cursor: 'pointer',
            letterSpacing: '2px', transition: 'all 0.15s',
            boxSizing: 'border-box',
          }}
        >
          NEW CONVERSATION
        </button>

        <div style={{ fontFamily: 'monospace', fontSize: '11px', color: 'rgba(74,124,89,0.35)' }}>
          or select one from the sidebar  ☰
        </div>

        <button
          onClick={() => { updateSettings({ openRouterApiKey: '' }); setPhase('signin'); setInputKey(''); setError(null) }}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'monospace', fontSize: '10px', color: 'rgba(74,124,89,0.25)', textDecoration: 'underline', padding: '4px' }}
        >
          Switch API key
        </button>
      </div>
    </div>
  )
}
