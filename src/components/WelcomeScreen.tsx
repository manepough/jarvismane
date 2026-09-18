'use client'

/**
 * src/components/WelcomeScreen.tsx
 * Shown when no API key is configured or no conversation is active.
 * No fake counters, no vague hero text, no AI copy, no pill buttons.
 */

import { useCallback, type ReactElement } from 'react'
import { Settings, Plus } from 'lucide-react'
import { useStore } from '@/store'

interface WelcomeScreenProps {
  onOpenSettings: () => void
}

export function WelcomeScreen({ onOpenSettings }: WelcomeScreenProps): ReactElement {
  const { settings, createConversation } = useStore()

  const hasApiKey = settings.openRouterApiKey.trim().length > 0

  const handleNewConversation = useCallback((): void => {
    createConversation()
  }, [createConversation])

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-16 min-h-screen">
      <div className="w-full max-w-md space-y-8 text-center">

        {/* Wordmark */}
        <div>
          <h1 className="font-mono text-3xl font-bold tracking-widest text-[var(--primary)]">
            JARVIS
          </h1>
          <p className="mt-2 font-mono text-xs text-[var(--secondary)]/60 tracking-wider">
            LOCAL-FIRST VOICE AND TEXT ASSISTANT
          </p>
        </div>

        {/* Divider */}
        <div className="h-px bg-[var(--primary)]/20" />

        {!hasApiKey ? (
          /* No API key state */
          <div className="space-y-4">
            <p className="font-mono text-sm text-[var(--secondary)]">
              An OpenRouter API key is required to start.
            </p>
            <button
              type="button"
              onClick={onOpenSettings}
              className="inline-flex items-center gap-2 px-5 py-2.5
                border border-[var(--primary)]/50 hover:border-[var(--primary)]
                rounded-lg font-mono text-sm text-[var(--text)]
                hover:bg-[var(--dim)] transition-colors"
            >
              <Settings className="w-4 h-4" />
              Open Settings
            </button>
            <p className="font-mono text-[10px] text-[var(--secondary)]/40">
              Get a key at openrouter.ai/keys
            </p>
          </div>
        ) : (
          /* Has key, no active conversation */
          <div className="space-y-4">
            <p className="font-mono text-sm text-[var(--secondary)]">
              Start a new conversation or select one from the sidebar.
            </p>
            <button
              type="button"
              onClick={handleNewConversation}
              className="inline-flex items-center gap-2 px-5 py-2.5
                border border-[var(--primary)]/50 hover:border-[var(--primary)]
                rounded-lg font-mono text-sm text-[var(--text)]
                hover:bg-[var(--dim)] transition-colors"
            >
              <Plus className="w-4 h-4" />
              New conversation
            </button>
          </div>
        )}

        {/* Capability list — factual only */}
        <div className="text-left space-y-2 border border-[var(--primary)]/15 rounded-lg p-4">
          <p className="font-mono text-[10px] text-[var(--secondary)]/50 uppercase tracking-wider mb-3">
            Capabilities
          </p>
          {[
            'Text and voice input',
            'Image and file attachments',
            'Jarvis can send files for download',
            'Offline fallback with local command parser',
            'GitHub sync queue for conversation backup',
            'Shizuku shell integration (Android)',
          ].map((item) => (
            <div key={item} className="flex items-center gap-2 font-mono text-xs text-[var(--secondary)]">
              <span className="w-1 h-1 rounded-full bg-[var(--primary)]/60 flex-shrink-0" />
              {item}
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}
