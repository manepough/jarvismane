'use client'

import { useState, useCallback, type ReactElement, type ReactNode } from 'react'
import { useStore } from '@/store'
import { verifyRepoAccess, setCredentialAccessor } from '@/services/GitSyncService'
import type { Theme } from '@/types'

interface SettingsModalProps { onClose: () => void }
type Section = 'api' | 'voice' | 'git' | 'appearance'

const S = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    zIndex: 50,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.75)',
    backdropFilter: 'blur(4px)',
    padding: '16px',
  },
  modal: {
    width: '100%',
    maxWidth: '500px',
    maxHeight: '90vh',
    background: 'var(--bg)',
    border: '1px solid rgba(0,255,65,0.25)',
    borderRadius: '12px',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
    boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid rgba(0,255,65,0.15)',
    flexShrink: 0,
  },
  title: {
    fontFamily: 'monospace',
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--text)',
    letterSpacing: '2px',
    textTransform: 'uppercase' as const,
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--secondary)',
    fontSize: '18px',
    padding: '4px 8px',
    borderRadius: '6px',
    lineHeight: 1,
  },
  body: {
    display: 'flex',
    flex: 1,
    minHeight: 0,
  },
  nav: {
    width: '120px',
    borderRight: '1px solid rgba(0,255,65,0.15)',
    padding: '12px 8px',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  },
  navBtn: (active: boolean) => ({
    width: '100%',
    padding: '8px 10px',
    borderRadius: '6px',
    border: active ? '1px solid rgba(0,255,65,0.3)' : '1px solid transparent',
    background: active ? 'var(--dim)' : 'transparent',
    color: active ? 'var(--primary)' : 'var(--secondary)',
    fontFamily: 'monospace',
    fontSize: '11px',
    cursor: 'pointer',
    textAlign: 'left' as const,
    transition: 'all 0.15s',
  }),
  content: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '20px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '20px',
  },
  label: {
    fontFamily: 'monospace',
    fontSize: '11px',
    fontWeight: 500,
    color: 'rgba(212,245,212,0.7)',
    marginBottom: '6px',
    display: 'block',
  },
  hint: {
    fontFamily: 'monospace',
    fontSize: '10px',
    color: 'rgba(74,124,89,0.45)',
    marginTop: '4px',
  },
  input: {
    width: '100%',
    background: 'var(--dim)',
    border: '1px solid rgba(0,255,65,0.2)',
    borderRadius: '8px',
    padding: '10px 12px',
    color: 'var(--text)',
    fontFamily: 'monospace',
    fontSize: '12px',
    outline: 'none',
  },
  pwWrap: {
    position: 'relative' as const,
  },
  showBtn: {
    position: 'absolute' as const,
    right: '10px',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--secondary)',
    fontSize: '14px',
    lineHeight: 1,
  },
  grid2: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
  },
  verifyBtn: {
    padding: '8px 16px',
    border: '1px solid rgba(0,255,65,0.35)',
    borderRadius: '8px',
    background: 'transparent',
    color: 'var(--text)',
    fontFamily: 'monospace',
    fontSize: '11px',
    cursor: 'pointer',
    transition: 'border-color 0.15s',
  },
  statusOk: {
    color: '#4caf50',
    fontFamily: 'monospace',
    fontSize: '11px',
  },
  statusErr: {
    color: '#ff6666',
    fontFamily: 'monospace',
    fontSize: '11px',
  },
  toggleRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '16px',
  },
  toggleTrack: (on: boolean) => ({
    width: '40px',
    height: '22px',
    borderRadius: '11px',
    border: `1px solid ${on ? 'rgba(0,255,65,0.6)' : 'rgba(0,255,65,0.2)'}`,
    background: on ? 'rgba(0,255,65,0.2)' : 'var(--dim)',
    cursor: 'pointer',
    position: 'relative' as const,
    flexShrink: 0,
    transition: 'all 0.2s',
  }),
  toggleThumb: (on: boolean) => ({
    position: 'absolute' as const,
    top: '2px',
    left: on ? '19px' : '2px',
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    background: on ? 'var(--primary)' : 'rgba(74,124,89,0.4)',
    transition: 'left 0.2s',
  }),
  themeGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '8px',
  },
  themeBtn: (active: boolean) => ({
    padding: '10px',
    borderRadius: '8px',
    border: `1px solid ${active ? 'var(--primary)' : 'rgba(0,255,65,0.15)'}`,
    background: active ? 'var(--dim)' : 'transparent',
    color: active ? 'var(--primary)' : 'var(--secondary)',
    fontFamily: 'monospace',
    fontSize: '11px',
    cursor: 'pointer',
    textAlign: 'left' as const,
    transition: 'all 0.15s',
  }),
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }): ReactElement {
  return (
    <div>
      <label style={S.label}>{label}</label>
      {children}
      {hint && <div style={S.hint}>{hint}</div>}
    </div>
  )
}

function Toggle({ label, desc, value, onChange }: { label: string; desc: string; value: boolean; onChange: (v: boolean) => void }): ReactElement {
  return (
    <div style={S.toggleRow}>
      <div>
        <div style={S.label}>{label}</div>
        <div style={S.hint}>{desc}</div>
      </div>
      <button role="switch" aria-checked={value} onClick={() => onChange(!value)} style={S.toggleTrack(value)}>
        <span style={S.toggleThumb(value)} />
      </button>
    </div>
  )
}

export function SettingsModal({ onClose }: SettingsModalProps): ReactElement {
  const { settings, updateSettings } = useStore()
  const [section, setSection] = useState<Section>('api')
  const [showKey, setShowKey] = useState(false)
  const [showPat, setShowPat] = useState(false)
  const [gitStatus, setGitStatus] = useState<'idle'|'checking'|'ok'|'error'>('idle')
  const [gitErr, setGitErr] = useState<string|null>(null)

  const verifyGit = useCallback(async () => {
    setGitStatus('checking'); setGitErr(null)
    setCredentialAccessor(() => ({
      pat: settings.gitPersonalAccessToken, owner: settings.gitRepoOwner,
      repo: settings.gitRepoName, branch: settings.gitBranch,
      authorName: settings.gitAuthorName, authorEmail: settings.gitAuthorEmail,
    }))
    try { await verifyRepoAccess(); setGitStatus('ok') }
    catch (e) { setGitStatus('error'); setGitErr(e instanceof Error ? e.message : 'Failed') }
  }, [settings])

  const THEMES: { value: Theme; label: string }[] = [
    { value: 'matrix', label: 'Matrix' },
    { value: 'hacker', label: 'Hacker' },
    { value: 'glyph', label: 'Glyph' },
    { value: 'minimal', label: 'Minimal' },
  ]

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={S.modal}>
        <div style={S.header}>
          <div style={S.title}>Settings</div>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.body}>
          <nav style={S.nav}>
            {(['api','voice','git','appearance'] as Section[]).map(s => (
              <button key={s} style={S.navBtn(section === s)} onClick={() => setSection(s)}>
                {s === 'api' ? 'API' : s === 'voice' ? 'Voice' : s === 'git' ? 'Git Sync' : 'Appearance'}
              </button>
            ))}
          </nav>
          <div style={S.content}>
            {section === 'api' && (
              <>
                <Field label="OpenRouter API Key" hint="Get yours at openrouter.ai/keys">
                  <div style={S.pwWrap}>
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={settings.openRouterApiKey}
                      onChange={e => updateSettings({ openRouterApiKey: e.target.value.trim() })}
                      placeholder="sk-or-..."
                      style={{ ...S.input, paddingRight: '36px' }}
                      spellCheck={false}
                    />
                    <button style={S.showBtn} onClick={() => setShowKey(v => !v)}>{showKey ? '🙈' : '👁'}</button>
                  </div>
                </Field>

              </>
            )}
            {section === 'voice' && (
              <>
                <Toggle
                  label="Enable voice input"
                  desc="Show mic button in chat. Requires Whisper API."
                  value={settings.voiceEnabled}
                  onChange={v => updateSettings({ voiceEnabled: v })}
                />
                <Field label="Language" hint="BCP-47 tag: en, nl, de, fr, ...">
                  <input
                    type="text"
                    value={settings.voiceLanguage}
                    onChange={e => updateSettings({ voiceLanguage: e.target.value.trim() })}
                    placeholder="en"
                    style={S.input}
                    maxLength={10}
                  />
                </Field>
              </>
            )}
            {section === 'git' && (
              <>
                <Toggle
                  label="Enable offline sync"
                  desc="Queue conversation backups and push to GitHub when online."
                  value={settings.offlineSyncEnabled}
                  onChange={v => updateSettings({ offlineSyncEnabled: v })}
                />
                <Field label="Personal Access Token" hint="Requires repo write scope.">
                  <div style={S.pwWrap}>
                    <input
                      type={showPat ? 'text' : 'password'}
                      value={settings.gitPersonalAccessToken}
                      onChange={e => updateSettings({ gitPersonalAccessToken: e.target.value.trim() })}
                      placeholder="github_pat_..."
                      style={{ ...S.input, paddingRight: '36px' }}
                      spellCheck={false}
                    />
                    <button style={S.showBtn} onClick={() => setShowPat(v => !v)}>{showPat ? '🙈' : '👁'}</button>
                  </div>
                </Field>
                <div style={S.grid2}>
                  <Field label="Owner" hint="GitHub username or org">
                    <input type="text" value={settings.gitRepoOwner} onChange={e => updateSettings({ gitRepoOwner: e.target.value.trim() })} placeholder="username" style={S.input} />
                  </Field>
                  <Field label="Repository">
                    <input type="text" value={settings.gitRepoName} onChange={e => updateSettings({ gitRepoName: e.target.value.trim() })} placeholder="my-repo" style={S.input} />
                  </Field>
                </div>
                <Field label="Branch">
                  <input type="text" value={settings.gitBranch} onChange={e => updateSettings({ gitBranch: e.target.value.trim() })} placeholder="main" style={S.input} />
                </Field>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <button
                    style={S.verifyBtn}
                    onClick={verifyGit}
                    disabled={gitStatus === 'checking' || !settings.gitPersonalAccessToken || !settings.gitRepoOwner || !settings.gitRepoName}
                  >
                    {gitStatus === 'checking' ? 'Checking...' : 'Verify connection'}
                  </button>
                  {gitStatus === 'ok' && <span style={S.statusOk}>✓ Connected</span>}
                  {gitStatus === 'error' && <span style={S.statusErr}>✕ {gitErr}</span>}
                </div>
              </>
            )}
            {section === 'appearance' && (
              <Field label="Theme">
                <div style={S.themeGrid}>
                  {THEMES.map(t => (
                    <button key={t.value} style={S.themeBtn(settings.theme === t.value)} onClick={() => updateSettings({ theme: t.value })}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </Field>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

