'use client'
/**
 * src/app/page.tsx
 * Root application shell.
 * Handles hydration guard, theme class injection, and top-level layout.
 */

import { useEffect, useState, type ReactElement } from 'react'
import { useStore } from '@/store'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'
import { setCredentialAccessor } from '@/services/GitSyncService'
import { Sidebar } from '@/components/Sidebar'
import { ChatArea } from '@/components/ChatArea'
import { SettingsModal } from '@/components/SettingsModal'
import { WelcomeScreen } from '@/components/WelcomeScreen'

export default function Home(): ReactElement {
  const {
    isHydrated,
    settings,
    currentConversationId,
    showSettings,
    setShowSettings,
  } = useStore()

  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true)

  // Monitor network state and drain offline queue on reconnect
  useNetworkStatus()

  // Wire git credential accessor to store on mount
  useEffect(() => {
    const { settings: s } = useStore.getState()
    setCredentialAccessor(() => ({
      pat: s.gitPersonalAccessToken,
      owner: s.gitRepoOwner,
      repo: s.gitRepoName,
      branch: s.gitBranch,
      authorName: s.gitAuthorName,
      authorEmail: s.gitAuthorEmail,
    }))
  }, [])

  // Sync theme class to <html>
  useEffect(() => {
    const root = document.documentElement
    root.classList.remove('theme-matrix', 'theme-hacker', 'theme-glyph', 'theme-minimal')
    root.classList.add(`theme-${settings.theme}`)
  }, [settings.theme])

  if (!isHydrated) {
    return (
      <div className={`theme-${settings.theme} theme-bg min-h-screen flex items-center justify-center`}>
        <div className="font-mono text-sm text-[var(--secondary)]">
          Loading...
        </div>
      </div>
    )
  }

  const hasApiKey = settings.openRouterApiKey.trim().length > 0

  return (
    <main className={`theme-${settings.theme} min-h-screen flex overflow-hidden`}
      style={{ background: 'var(--bg)', color: 'var(--text)' }}>

      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen((v) => !v)}
        onOpenSettings={() => setShowSettings(true)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {!hasApiKey || currentConversationId === null ? (
          <WelcomeScreen onOpenSettings={() => setShowSettings(true)} />
        ) : (
          <ChatArea />
        )}
      </div>

      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}
    </main>
  )
}
