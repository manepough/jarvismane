'use client'

/**
 * src/app/auth/callback/page.tsx
 * OpenRouter OAuth callback page.
 * OpenRouter redirects here with ?code=xxx after user logs in.
 * This page writes the code to localStorage so WelcomeScreen can pick it up.
 */

import { useEffect, useState, type ReactElement } from 'react'

export default function AuthCallback(): ReactElement {
  const [status, setStatus] = useState<'processing' | 'done' | 'error'>('processing')
  const [message, setMessage] = useState('Processing login...')

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const code = params.get('code')
      const error = params.get('error')

      if (error) {
        setStatus('error')
        setMessage(`Login error: ${error}`)
        return
      }

      if (!code) {
        setStatus('error')
        setMessage('No authorization code received.')
        return
      }

      // Write code to localStorage for WelcomeScreen to read
      localStorage.setItem('or_oauth_code', code)
      setStatus('done')
      setMessage('Login successful. Returning to Jarvis...')

      // Close this tab/window after a short delay
      setTimeout(() => {
        try { window.close() } catch {}
        // If window.close() doesn't work (main tab), redirect back
        window.location.href = '/'
      }, 1500)
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : 'Unexpected error')
    }
  }, [])

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#0a0e0a', color: '#d4f5d4', fontFamily: 'monospace', padding: '24px',
    }}>
      <div style={{ textAlign: 'center', maxWidth: '320px' }}>
        <div style={{ fontSize: '24px', fontWeight: 700, letterSpacing: '6px', color: '#00ff41', marginBottom: '24px' }}>
          JARVIS
        </div>
        <div style={{
          fontSize: '13px', lineHeight: '1.6',
          color: status === 'error' ? '#ff8888' : status === 'done' ? '#00ff41' : '#4a7c59',
        }}>
          {message}
        </div>
        {status === 'error' && (
          <button
            onClick={() => window.location.href = '/'}
            style={{
              marginTop: '20px', padding: '10px 20px', borderRadius: '8px',
              border: '1px solid rgba(0,255,65,0.4)', background: 'transparent',
              color: '#00ff41', fontFamily: 'monospace', fontSize: '12px', cursor: 'pointer',
            }}
          >
            Back to Jarvis
          </button>
        )}
      </div>
    </div>
  )
}
