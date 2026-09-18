'use client'

/**
 * src/components/SettingsModal.tsx
 * Settings panel for Jarvis.
 * Sections: API, Voice, Git Sync, Appearance.
 * All form fields write directly to the store via updateSettings.
 * Git PAT is stored in localStorage (the best available web-context storage).
 * No fake metrics, no placeholder text, no truncation.
 */

import { useState, useCallback, type ReactElement, type ReactNode } from 'react'
import { X, Eye, EyeOff, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { useStore } from '@/store'
import { verifyRepoAccess, setCredentialAccessor } from '@/services/GitSyncService'
import type { Theme } from '@/types'

interface SettingsModalProps {
  onClose: () => void
}

type SettingsSection = 'api' | 'voice' | 'git' | 'appearance'

export function SettingsModal({ onClose }: SettingsModalProps): ReactElement {
  const { settings, updateSettings } = useStore()
  const [activeSection, setActiveSection] = useState<SettingsSection>('api')
  const [showApiKey, setShowApiKey] = useState<boolean>(false)
  const [showPat, setShowPat] = useState<boolean>(false)
  const [gitVerifyState, setGitVerifyState] = useState<'idle' | 'checking' | 'ok' | 'error'>('idle')
  const [gitVerifyError, setGitVerifyError] = useState<string | null>(null)

  const handleVerifyGit = useCallback(async (): Promise<void> => {
    setGitVerifyState('checking')
    setGitVerifyError(null)

    setCredentialAccessor(() => ({
      pat: settings.gitPersonalAccessToken,
      owner: settings.gitRepoOwner,
      repo: settings.gitRepoName,
      branch: settings.gitBranch,
      authorName: settings.gitAuthorName,
      authorEmail: settings.gitAuthorEmail,
    }))

    try {
      await verifyRepoAccess()
      setGitVerifyState('ok')
    } catch (err: unknown) {
      setGitVerifyState('error')
      setGitVerifyError(err instanceof Error ? err.message : 'Verification failed')
    }
  }, [settings])

  const THEMES: { value: Theme; label: string }[] = [
    { value: 'matrix', label: 'Matrix' },
    { value: 'hacker', label: 'Hacker' },
    { value: 'glyph', label: 'Glyph' },
    { value: 'minimal', label: 'Minimal' },
  ]

  const NAV: { id: SettingsSection; label: string }[] = [
    { id: 'api', label: 'API' },
    { id: 'voice', label: 'Voice' },
    { id: 'git', label: 'Git Sync' },
    { id: 'appearance', label: 'Appearance' },
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-xl mx-4 bg-[var(--bg)] border border-[var(--primary)]/30 rounded-xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--primary)]/20">
          <h2 className="font-mono text-sm font-semibold text-[var(--text)] tracking-wide uppercase">
            Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-[var(--secondary)] hover:text-[var(--text)] hover:bg-[var(--dim)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Sidebar nav */}
          <nav className="w-36 border-r border-[var(--primary)]/20 flex-shrink-0 py-4 px-2">
            {NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveSection(item.id)}
                className={`w-full text-left px-3 py-2 rounded-md text-xs font-mono transition-colors mb-1
                  ${activeSection === item.id
                    ? 'bg-[var(--dim)] text-[var(--primary)] border border-[var(--primary)]/30'
                    : 'text-[var(--secondary)] hover:text-[var(--text)] hover:bg-[var(--dim)]/50'
                  }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-5">

            {/* ── API ─────────────────────────────────────────────────────── */}
            {activeSection === 'api' && (
              <div className="space-y-5">
                <FieldGroup
                  label="OpenRouter API Key"
                  hint="Required for all LLM requests. Get yours at openrouter.ai/keys"
                >
                  <div className="relative">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={settings.openRouterApiKey}
                      onChange={(e) => updateSettings({ openRouterApiKey: e.target.value.trim() })}
                      placeholder="sk-or-..."
                      className={INPUT_CLASS}
                      spellCheck={false}
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--secondary)] hover:text-[var(--text)] transition-colors"
                    >
                      {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </FieldGroup>

                <FieldGroup
                  label="Default model"
                  hint="OpenRouter model ID. Examples: anthropic/claude-sonnet-4-6, openai/gpt-4o"
                >
                  <input
                    type="text"
                    value={settings.gitBranch}
                    onChange={(e) => updateSettings({ gitBranch: e.target.value.trim() })}
                    placeholder="anthropic/claude-sonnet-4-6"
                    className={INPUT_CLASS}
                    spellCheck={false}
                  />
                </FieldGroup>
              </div>
            )}

            {/* ── Voice ────────────────────────────────────────────────────── */}
            {activeSection === 'voice' && (
              <div className="space-y-5">
                <ToggleField
                  label="Enable voice input"
                  description="Show microphone button in chat input. Uses Whisper API for transcription."
                  value={settings.voiceEnabled}
                  onChange={(v) => updateSettings({ voiceEnabled: v })}
                />
                <FieldGroup
                  label="Language"
                  hint="BCP-47 language tag for transcription. Examples: en, nl, de, fr"
                >
                  <input
                    type="text"
                    value={settings.voiceLanguage}
                    onChange={(e) => updateSettings({ voiceLanguage: e.target.value.trim().toLowerCase() })}
                    placeholder="en"
                    className={INPUT_CLASS}
                    maxLength={10}
                  />
                </FieldGroup>
              </div>
            )}

            {/* ── Git Sync ─────────────────────────────────────────────────── */}
            {activeSection === 'git' && (
              <div className="space-y-5">
                <ToggleField
                  label="Enable offline sync"
                  description="Queue conversation backups locally and push to GitHub when online."
                  value={settings.offlineSyncEnabled}
                  onChange={(v) => updateSettings({ offlineSyncEnabled: v })}
                />

                <FieldGroup label="Personal Access Token" hint="Requires repo write scope.">
                  <div className="relative">
                    <input
                      type={showPat ? 'text' : 'password'}
                      value={settings.gitPersonalAccessToken}
                      onChange={(e) => updateSettings({ gitPersonalAccessToken: e.target.value.trim() })}
                      placeholder="github_pat_..."
                      className={INPUT_CLASS}
                      spellCheck={false}
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPat((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--secondary)] hover:text-[var(--text)] transition-colors"
                    >
                      {showPat ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </FieldGroup>

                <div className="grid grid-cols-2 gap-3">
                  <FieldGroup label="Owner" hint="GitHub username or org">
                    <input
                      type="text"
                      value={settings.gitRepoOwner}
                      onChange={(e) => updateSettings({ gitRepoOwner: e.target.value.trim() })}
                      placeholder="username"
                      className={INPUT_CLASS}
                    />
                  </FieldGroup>
                  <FieldGroup label="Repository" hint="Repo name (not full URL)">
                    <input
                      type="text"
                      value={settings.gitRepoName}
                      onChange={(e) => updateSettings({ gitRepoName: e.target.value.trim() })}
                      placeholder="my-repo"
                      className={INPUT_CLASS}
                    />
                  </FieldGroup>
                </div>

                <FieldGroup label="Branch" hint="Target branch for commits">
                  <input
                    type="text"
                    value={settings.gitBranch}
                    onChange={(e) => updateSettings({ gitBranch: e.target.value.trim() })}
                    placeholder="main"
                    className={INPUT_CLASS}
                  />
                </FieldGroup>

                <div className="grid grid-cols-2 gap-3">
                  <FieldGroup label="Commit author name" hint="">
                    <input
                      type="text"
                      value={settings.gitAuthorName}
                      onChange={(e) => updateSettings({ gitAuthorName: e.target.value })}
                      placeholder="Jarvis"
                      className={INPUT_CLASS}
                    />
                  </FieldGroup>
                  <FieldGroup label="Commit author email" hint="">
                    <input
                      type="email"
                      value={settings.gitAuthorEmail}
                      onChange={(e) => updateSettings({ gitAuthorEmail: e.target.value.trim() })}
                      placeholder="jarvis@local"
                      className={INPUT_CLASS}
                    />
                  </FieldGroup>
                </div>

                {/* Verify button */}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleVerifyGit}
                    disabled={
                      gitVerifyState === 'checking' ||
                      settings.gitPersonalAccessToken.trim() === '' ||
                      settings.gitRepoOwner.trim() === '' ||
                      settings.gitRepoName.trim() === ''
                    }
                    className="px-4 py-2 text-xs font-mono border border-[var(--primary)]/40
                      hover:border-[var(--primary)] rounded-lg transition-colors
                      disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {gitVerifyState === 'checking' ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Verifying...
                      </span>
                    ) : 'Verify connection'}
                  </button>

                  {gitVerifyState === 'ok' && (
                    <span className="flex items-center gap-1.5 text-xs text-green-400 font-mono">
                      <CheckCircle className="w-3.5 h-3.5" />
                      Connected
                    </span>
                  )}
                  {gitVerifyState === 'error' && (
                    <span className="flex items-center gap-1.5 text-xs text-red-400 font-mono">
                      <XCircle className="w-3.5 h-3.5" />
                      {gitVerifyError ?? 'Failed'}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* ── Appearance ───────────────────────────────────────────────── */}
            {activeSection === 'appearance' && (
              <div className="space-y-5">
                <FieldGroup label="Theme" hint="">
                  <div className="grid grid-cols-2 gap-2">
                    {THEMES.map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => updateSettings({ theme: t.value })}
                        className={`px-3 py-2.5 rounded-lg border text-xs font-mono text-left transition-colors
                          ${settings.theme === t.value
                            ? 'border-[var(--primary)] bg-[var(--dim)] text-[var(--primary)]'
                            : 'border-[var(--primary)]/20 text-[var(--secondary)] hover:border-[var(--primary)]/50 hover:text-[var(--text)]'
                          }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </FieldGroup>
              </div>
            )}

          </div>
        </div>

      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const INPUT_CLASS =
  'w-full bg-[var(--dim)] border border-[var(--primary)]/20 rounded-lg px-3 py-2.5 ' +
  'text-xs font-mono text-[var(--text)] placeholder:text-[var(--secondary)]/40 ' +
  'focus:outline-none focus:border-[var(--primary)]/60 transition-colors'

function FieldGroup({
  label,
  hint,
  children,
}: {
  label: string
  hint: string
  children: ReactNode
}): ReactElement {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-mono text-[var(--text)]/80 font-medium">{label}</label>
      {children}
      {hint.length > 0 && (
        <p className="text-[10px] font-mono text-[var(--secondary)]/50">{hint}</p>
      )}
    </div>
  )
}

function ToggleField({
  label,
  description,
  value,
  onChange,
}: {
  label: string
  description: string
  value: boolean
  onChange: (v: boolean) => void
}): ReactElement {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-xs font-mono text-[var(--text)]/80 font-medium">{label}</div>
        <div className="text-[10px] font-mono text-[var(--secondary)]/50 mt-0.5">{description}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`flex-shrink-0 w-10 h-5 rounded-full border transition-colors relative
          ${value
            ? 'bg-[var(--primary)]/30 border-[var(--primary)]/60'
            : 'bg-[var(--dim)] border-[var(--primary)]/20'
          }`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 rounded-full transition-transform
            ${value
              ? 'translate-x-5 bg-[var(--primary)]'
              : 'translate-x-0.5 bg-[var(--secondary)]/40'
            }`}
        />
      </button>
    </div>
  )
}
