'use client'

import { useState, useCallback, useEffect, useRef, type ReactElement } from 'react'
import { useStore } from '@/store'

interface WelcomeScreenProps {
  onOpenSettings: () => void
}

// OpenRouter OAuth PKCE flow
// Docs: https://openrouter.ai/docs/oauth
const OR_OAUTH_URL = 'https://openrouter.ai/auth'
const APP_CALLBACK = typeof window !== 'undefined'
  ? `${window.location.origin}/auth/callback`
  : 'http://localhost:3000/auth/callback'

async function generatePKCE(): Promise<{ codeVerifier: string; codeChallenge: string }> {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  const codeVerifier = btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

  const encoder = new TextEncoder()
  const data = encoder.encode(codeVerifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

  return { codeVerifier, codeChallenge }
}

async function exchangeCodeForKey(code: string, codeVerifier: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', 'https://openrouter.ai/api/v1/auth/keys', true)
    xhr.setRequestHeader('Content-Type', 'application/json')
    xhr.timeout = 15000
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText) as { key?: string; error?: string }
        if (data.key) resolve(data.key)
        else reject(new Error(data.error ?? 'No key in response'))
      } catch { reject(new Error('Invalid response from OpenRouter')) }
    }
    xhr.onerror = () => reject(new Error('Network error exchanging code'))
    xhr.ontimeout = () => reject(new Error('Timeout exchanging code'))
    xhr.send(JSON.stringify({ code, code_verifier: codeVerifier }))
  })
}

export function WelcomeScreen({ onOpenSettings: _o }: WelcomeScreenProps): ReactElement {
  const { settings, updateSettings, createConversation } = useStore()
  const [phase, setPhase] = useState<'signin' | 'waiting' | 'ready'>(
    settings.openRouterApiKey.trim().length > 0 ? 'ready' : 'signin'
  )
  const [manualKey, setManualKey] = useState('')
  const [showManual, setShowManual] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const codeVerifierRef = useRef<string>('')

  useEffect(() => {
    if (settings.openRouterApiKey.trim().length > 0) setPhase('ready')
  }, [settings.openRouterApiKey])

  // Poll for OAuth callback via localStorage (set by callback page)
  useEffect(() => {
    if (phase !== 'waiting') return
    const interval = setInterval(() => {
      try {
        const code = localStorage.getItem('or_oauth_code')
        if (code) {
          localStorage.removeItem('or_oauth_code')
          clearInterval(interval)
          setStatus('Getting your API key...')
          exchangeCodeForKey(code, codeVerifierRef.current)
            .then(key => {
              updateSettings({ openRouterApiKey: key })
              setPhase('ready')
              setStatus(null)
            })
            .catch(err => {
              setError(err instanceof Error ? err.message : 'Failed to get API key')
              setPhase('signin')
              setStatus(null)
            })
        }
      } catch {}
    }, 500)
    return () => clearInterval(interval)
  }, [phase, updateSettings])

  const handleOAuthLogin = useCallback(async () => {
    setError(null)
    setStatus('Opening OpenRouter login...')
    try {
      const { codeVerifier, codeChallenge } = await generatePKCE()
      codeVerifierRef.current = codeVerifier
      localStorage.setItem('or_code_verifier', codeVerifier)

      const params = new URLSearchParams({
        callback_url: APP_CALLBACK,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      })

      const loginUrl = `${OR_OAUTH_URL}?${params.toString()}`
      window.open(loginUrl, '_blank', 'width=500,height=700,scrollbars=yes')
      setPhase('waiting')
      setStatus('Waiting for login... Complete it in the browser window.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start login')
      setStatus(null)
    }
  }, [])

  const handleManualConnect = useCallback(() => {
    const key = manualKey.trim()
    if (!key) { setError('Paste your API key first.'); return }
    updateSettings({ openRouterApiKey: key })
    setPhase('ready')
  }, [manualKey, updateSettings])

  const handleStart = useCallback(() => createConversation(), [createConversation])

  const btn = (label: string, onClick: () => void, primary = true, disabled = false) => (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%', padding: '13px',
        borderRadius: '8px',
        border: `1px solid ${primary ? 'rgba(0,255,65,0.5)' : 'rgba(0,255,65,0.2)'}`,
        background: primary ? 'rgba(0,255,65,0.06)' : 'transparent',
        color: primary ? 'var(--primary)' : 'var(--secondary)',
        fontFamily: 'monospace', fontSize: '13px',
        fontWeight: primary ? 600 : 400,
        cursor: disabled ? 'not-allowed' : 'pointer',
        letterSpacing: primary ? '1px' : '0',
        opacity: disabled ? 0.5 : 1,
        boxSizing: 'border-box' as const,
        transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  )

  if (phase === 'ready') {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 20px', minHeight: '100vh', background: 'var(--bg)' }}>
        <div style={{ width: '100%', maxWidth: '360px', display: 'flex', flexDirection: 'column', gap: '20px', textAlign: 'center' }}>
          <div>
            <div style={{ fontFamily: 'monospace', fontSize: '34px', fontWeight: 700, letterSpacing: '8px', color: 'var(--primary)' }}>JARVIS</div>
            <div style={{ fontFamily: 'monospace', fontSize: '10px', color: 'rgba(74,124,89,0.5)', letterSpacing: '2px', marginTop: '6px' }}>READY</div>
          </div>
          <div style={{ height: '1px', background: 'rgba(0,255,65,0.1)' }} />
          {btn('NEW CONVERSATION', handleStart)}
          <div style={{ fontFamily: 'monospace', fontSize: '11px', color: 'rgba(74,124,89,0.35)' }}>
            or select one from the sidebar  ☰
          </div>
          <button onClick={() => { updateSettings({ openRouterApiKey: '' }); setPhase('signin'); setManualKey(''); setError(null) }}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'monospace', fontSize: '10px', color: 'rgba(74,124,89,0.25)', textDecoration: 'underline', padding: '4px' }}>
            Switch account
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 20px', minHeight: '100vh', background: 'var(--bg)' }}>
      <div style={{ width: '100%', maxWidth: '360px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'monospace', fontSize: '34px', fontWeight: 700, letterSpacing: '8px', color: 'var(--primary)', marginBottom: '6px' }}>JARVIS</div>
          <div style={{ fontFamily: 'monospace', fontSize: '10px', color: 'rgba(74,124,89,0.5)', letterSpacing: '3px' }}>
            {phase === 'waiting' ? 'WAITING FOR LOGIN...' : 'SIGN IN TO GET STARTED'}
          </div>
        </div>

        <div style={{ height: '1px', background: 'rgba(0,255,65,0.1)' }} />

        {status && (
          <div style={{ fontFamily: 'monospace', fontSize: '11px', color: 'rgba(0,255,65,0.6)', textAlign: 'center', padding: '8px', background: 'rgba(0,255,65,0.05)', borderRadius: '6px', border: '1px solid rgba(0,255,65,0.1)' }}>
            {status}
          </div>
        )}

        {error && (
          <div style={{ fontFamily: 'monospace', fontSize: '11px', color: '#ff8888', padding: '8px 12px', background: 'rgba(255,68,68,0.06)', border: '1px solid rgba(255,68,68,0.2)', borderRadius: '6px' }}>
            {error}
          </div>
        )}

        {phase === 'waiting' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--secondary)', textAlign: 'center', lineHeight: '1.6' }}>
              Complete login in the browser window that opened. This page will update automatically.
            </div>
            {btn('Cancel', () => { setPhase('signin'); setStatus(null); setError(null) }, false)}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {btn('Log in with OpenRouter', handleOAuthLogin)}

            <div style={{ textAlign: 'center' }}>
              <button
                onClick={() => setShowManual(v => !v)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'monospace', fontSize: '10px', color: 'rgba(74,124,89,0.4)', textDecoration: 'underline' }}
              >
                {showManual ? 'Hide manual entry' : 'Paste API key manually'}
              </button>
            </div>

            {showManual && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <input
                  type="password"
                  value={manualKey}
                  onChange={e => { setManualKey(e.target.value); setError(null) }}
                  onKeyDown={e => e.key === 'Enter' && handleManualConnect()}
                  placeholder="sk-or-v1-..."
                  autoComplete="off"
                  spellCheck={false}
                  style={{
                    width: '100%', padding: '11px 14px',
                    background: 'var(--dim)', border: '1px solid rgba(0,255,65,0.2)',
                    borderRadius: '8px', color: 'var(--text)',
                    fontFamily: 'monospace', fontSize: '13px', outline: 'none',
                    boxSizing: 'border-box' as const,
                  }}
                />
                {btn('Connect', handleManualConnect, true, manualKey.trim() === '')}
              </div>
            )}

            <div style={{ textAlign: 'center' }}>
              <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer"
                style={{ fontFamily: 'monospace', fontSize: '10px', color: 'rgba(74,124,89,0.4)', textDecoration: 'underline' }}>
                Get a free key at openrouter.ai/keys
              </a>
            </div>
          </div>
        )}

        <div style={{ border: '1px solid rgba(0,255,65,0.08)', borderRadius: '8px', padding: '14px' }}>
          <div style={{ fontFamily: 'monospace', fontSize: '9px', color: 'rgba(74,124,89,0.3)', letterSpacing: '2px', textTransform: 'uppercase' as const, marginBottom: '10px' }}>What you get</div>
          {['Auto-selects best model — falls back on rate limit', 'Race mode — all models compete, best answer wins', 'Voice input + image and file attachments', 'No topic restrictions', 'Works offline with local parser'].map(item => (
            <div key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '6px' }}>
              <span style={{ color: 'var(--primary)', fontSize: '7px', marginTop: '3px', flexShrink: 0 }}>◆</span>
              <span style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--secondary)', lineHeight: '1.4' }}>{item}</span>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}
