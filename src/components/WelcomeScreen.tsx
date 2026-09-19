'use client'

import { useState, useCallback, useEffect, type ReactElement } from 'react'
import { useStore } from '@/store'
import { validateApiKey, fetchAvailableModels } from '@/lib/openrouter'

interface WelcomeScreenProps {
  onOpenSettings: () => void
}

export function WelcomeScreen({ onOpenSettings }: WelcomeScreenProps): ReactElement {
  const { settings, updateSettings, createConversation } = useStore()
  const [inputKey, setInputKey] = useState('')
  const [validating, setValidating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [phase, setPhase] = useState<'signin' | 'ready'>(
    settings.openRouterApiKey.trim().length > 0 ? 'ready' : 'signin'
  )

  // If key already stored, go straight to ready
  useEffect(() => {
    if (settings.openRouterApiKey.trim().length > 0) setPhase('ready')
  }, [settings.openRouterApiKey])

  const handleConnect = useCallback(async () => {
    const key = inputKey.trim()
    if (!key) { setError('Paste your OpenRouter API key first.'); return }
    setValidating(true)
    setError(null)
    const valid = await validateApiKey(key)
    if (!valid) {
      setValidating(false)
      setError('Invalid key. Get one at openrouter.ai/keys')
      return
    }
    // Fetch and store best available models
    await fetchAvailableModels(key)
    updateSettings({ openRouterApiKey: key })
    setValidating(false)
    setPhase('ready')
  }, [inputKey, updateSettings])

  const handleStart = useCallback(() => createConversation(), [createConversation])

  if (phase === 'signin') {
    return (
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '32px 24px', minHeight: '100vh', background: 'var(--bg)',
      }}>
        <div style={{ width: '100%', maxWidth: '380px', display: 'flex', flexDirection: 'column', gap: '28px' }}>

          {/* Logo */}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'monospace', fontSize: '36px', fontWeight: 700, letterSpacing: '8px', color: 'var(--primary)' }}>
              JARVIS
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: '10px', color: 'rgba(74,124,89,0.6)', letterSpacing: '3px', marginTop: '6px' }}>
              CONNECT TO OPENROUTER
            </div>
          </div>

          <div style={{ height: '1px', background: 'rgba(0,255,65,0.12)' }} />

          {/* Sign in form */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ fontFamily: 'monospace', fontSize: '11px', color: 'rgba(212,245,212,0.6)', display: 'block', marginBottom: '8px', letterSpacing: '1px' }}>
                OPENROUTER API KEY
              </label>
              <input
                type="password"
                value={inputKey}
                onChange={e => { setInputKey(e.target.value); setError(null) }}
                onKeyDown={e => e.key === 'Enter' && handleConnect()}
                placeholder="sk-or-v1-..."
                style={{
                  width: '100%', padding: '12px 14px',
                  background: 'var(--dim)', border: '1px solid rgba(0,255,65,0.2)',
                  borderRadius: '8px', color: 'var(--text)', fontFamily: 'monospace',
                  fontSize: '13px', outline: 'none',
                }}
                onFocus={e => { e.target.style.borderColor = 'rgba(0,255,65,0.6)' }}
                onBlur={e => { e.target.style.borderColor = 'rgba(0,255,65,0.2)' }}
                spellCheck={false}
                autoComplete="off"
              />
            </div>

            {error && (
              <div style={{ fontFamily: 'monospace', fontSize: '11px', color: '#ff6666', padding: '8px 12px', background: 'rgba(255,68,68,0.08)', border: '1px solid rgba(255,68,68,0.2)', borderRadius: '6px' }}>
                {error}
              </div>
            )}

            <button
              onClick={handleConnect}
              disabled={validating || inputKey.trim() === ''}
              style={{
                padding: '12px', borderRadius: '8px',
                border: '1px solid rgba(0,255,65,0.5)',
                background: validating ? 'rgba(0,255,65,0.08)' : 'transparent',
                color: 'var(--primary)', fontFamily: 'monospace', fontSize: '13px',
                fontWeight: 600, cursor: validating ? 'wait' : 'pointer',
                letterSpacing: '1px', transition: 'all 0.15s',
                opacity: inputKey.trim() === '' ? 0.5 : 1,
              }}
            >
              {validating ? 'Connecting...' : 'Connect'}
            </button>

            <div style={{ textAlign: 'center' }}>
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontFamily: 'monospace', fontSize: '11px', color: 'rgba(74,124,89,0.6)', textDecoration: 'underline' }}
              >
                Get a free key at openrouter.ai/keys
              </a>
            </div>
          </div>

          {/* What Jarvis can do */}
          <div style={{ border: '1px solid rgba(0,255,65,0.1)', borderRadius: '8px', padding: '16px' }}>
            <div style={{ fontFamily: 'monospace', fontSize: '10px', color: 'rgba(74,124,89,0.4)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '10px' }}>
              What you get
            </div>
            {[
              'Auto-selects best available model',
              'Falls back through models on rate limit',
              'Race mode — fastest best answer wins',
              'Voice input + file/image attachments',
              'No restrictions on any topic',
              'Works offline with local command parser',
            ].map(item => (
              <div key={item} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', fontFamily: 'monospace', fontSize: '11px', color: 'var(--secondary)' }}>
                <span style={{ color: 'var(--primary)', fontSize: '8px' }}>◆</span>
                {item}
              </div>
            ))}
          </div>

        </div>
      </div>
    )
  }

  // Ready screen
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '32px 24px', minHeight: '100vh', background: 'var(--bg)',
    }}>
      <div style={{ width: '100%', maxWidth: '380px', display: 'flex', flexDirection: 'column', gap: '24px', textAlign: 'center' }}>
        <div>
          <div style={{ fontFamily: 'monospace', fontSize: '36px', fontWeight: 700, letterSpacing: '8px', color: 'var(--primary)' }}>
            JARVIS
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: '10px', color: 'rgba(74,124,89,0.6)', letterSpacing: '2px', marginTop: '6px' }}>
            READY
          </div>
        </div>

        <div style={{ height: '1px', background: 'rgba(0,255,65,0.12)' }} />

        <button
          onClick={handleStart}
          style={{
            padding: '14px', borderRadius: '8px',
            border: '1px solid rgba(0,255,65,0.5)',
            background: 'rgba(0,255,65,0.05)',
            color: 'var(--primary)', fontFamily: 'monospace',
            fontSize: '14px', fontWeight: 600, cursor: 'pointer',
            letterSpacing: '2px', transition: 'all 0.15s',
          }}
          onMouseEnter={e => { (e.target as HTMLButtonElement).style.background = 'rgba(0,255,65,0.1)'; (e.target as HTMLButtonElement).style.borderColor = 'var(--primary)' }}
          onMouseLeave={e => { (e.target as HTMLButtonElement).style.background = 'rgba(0,255,65,0.05)'; (e.target as HTMLButtonElement).style.borderColor = 'rgba(0,255,65,0.5)' }}
        >
          NEW CONVERSATION
        </button>

        <div style={{ fontFamily: 'monospace', fontSize: '11px', color: 'rgba(74,124,89,0.4)' }}>
          or select a conversation from the sidebar
        </div>

        <button
          onClick={() => { updateSettings({ openRouterApiKey: '' }); setPhase('signin'); setInputKey('') }}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'monospace', fontSize: '10px', color: 'rgba(74,124,89,0.3)', textDecoration: 'underline' }}
        >
          Switch API key
        </button>
      </div>
    </div>
  )
}
