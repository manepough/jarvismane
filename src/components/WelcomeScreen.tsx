'use client'

import { useCallback, type ReactElement } from 'react'
import { useStore } from '@/store'

interface WelcomeScreenProps {
  onOpenSettings: () => void
}

const S = {
  root: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    minHeight: '100vh',
    background: 'var(--bg)',
  },
  inner: {
    width: '100%',
    maxWidth: '400px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '24px',
  },
  title: {
    fontFamily: 'monospace',
    fontSize: '32px',
    fontWeight: 700,
    letterSpacing: '6px',
    color: 'var(--primary)',
    textAlign: 'center' as const,
  },
  subtitle: {
    fontFamily: 'monospace',
    fontSize: '10px',
    color: 'rgba(74,124,89,0.7)',
    letterSpacing: '3px',
    textAlign: 'center' as const,
    marginTop: '4px',
  },
  divider: {
    height: '1px',
    background: 'rgba(0,255,65,0.15)',
  },
  desc: {
    fontFamily: 'monospace',
    fontSize: '13px',
    color: 'var(--secondary)',
    textAlign: 'center' as const,
  },
  btn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 20px',
    border: '1px solid rgba(0,255,65,0.5)',
    borderRadius: '8px',
    background: 'transparent',
    color: 'var(--text)',
    fontFamily: 'monospace',
    fontSize: '13px',
    cursor: 'pointer',
    transition: 'border-color 0.2s, background 0.2s',
    alignSelf: 'center' as const,
  },
  hint: {
    fontFamily: 'monospace',
    fontSize: '10px',
    color: 'rgba(74,124,89,0.5)',
    textAlign: 'center' as const,
  },
  capBox: {
    border: '1px solid rgba(0,255,65,0.15)',
    borderRadius: '8px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  capTitle: {
    fontFamily: 'monospace',
    fontSize: '10px',
    color: 'rgba(74,124,89,0.5)',
    letterSpacing: '2px',
    textTransform: 'uppercase' as const,
    marginBottom: '4px',
  },
  capItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontFamily: 'monospace',
    fontSize: '12px',
    color: 'var(--secondary)',
  },
  dot: {
    width: '5px',
    height: '5px',
    borderRadius: '50%',
    background: 'rgba(0,255,65,0.5)',
    flexShrink: 0,
  },
}

export function WelcomeScreen({ onOpenSettings }: WelcomeScreenProps): ReactElement {
  const { settings, createConversation } = useStore()
  const hasApiKey = settings.openRouterApiKey.trim().length > 0

  const handleNew = useCallback(() => createConversation(), [createConversation])

  return (
    <div style={S.root}>
      <div style={S.inner}>
        <div>
          <div style={S.title}>JARVIS</div>
          <div style={S.subtitle}>LOCAL-FIRST VOICE AND TEXT ASSISTANT</div>
        </div>

        <div style={S.divider} />

        {!hasApiKey ? (
          <>
            <p style={S.desc}>An OpenRouter API key is required to start.</p>
            <button
              style={S.btn}
              onClick={onOpenSettings}
              onMouseEnter={e => { (e.target as HTMLButtonElement).style.borderColor = 'var(--primary)'; (e.target as HTMLButtonElement).style.background = 'var(--dim)' }}
              onMouseLeave={e => { (e.target as HTMLButtonElement).style.borderColor = 'rgba(0,255,65,0.5)'; (e.target as HTMLButtonElement).style.background = 'transparent' }}
            >
              Settings
            </button>
            <p style={S.hint}>Get a key at openrouter.ai/keys</p>
          </>
        ) : (
          <>
            <p style={S.desc}>Start a new conversation or select one from the sidebar.</p>
            <button
              style={S.btn}
              onClick={handleNew}
              onMouseEnter={e => { (e.target as HTMLButtonElement).style.borderColor = 'var(--primary)'; (e.target as HTMLButtonElement).style.background = 'var(--dim)' }}
              onMouseLeave={e => { (e.target as HTMLButtonElement).style.borderColor = 'rgba(0,255,65,0.5)'; (e.target as HTMLButtonElement).style.background = 'transparent' }}
            >
              + New conversation
            </button>
          </>
        )}

        <div style={S.capBox}>
          <div style={S.capTitle}>Capabilities</div>
          {[
            'Text and voice input',
            'Image and file attachments',
            'Jarvis can send files for download',
            'Offline fallback with local command parser',
            'GitHub sync queue for conversation backup',
            'Shizuku shell integration (Android)',
          ].map(item => (
            <div key={item} style={S.capItem}>
              <div style={S.dot} />
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
