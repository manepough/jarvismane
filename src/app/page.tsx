'use client'

import { useEffect, useState, type ReactElement } from 'react'
import { useStore } from '@/store'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'
import { setCredentialAccessor } from '@/services/GitSyncService'
import { Sidebar } from '@/components/Sidebar'
import { ChatArea } from '@/components/ChatArea'
import { SettingsModal } from '@/components/SettingsModal'
import { WelcomeScreen } from '@/components/WelcomeScreen'

export default function Home(): ReactElement {
  const { settings, currentConversationId, showSettings, setShowSettings } = useStore()
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false)

  useNetworkStatus()

  useEffect(() => {
    const { settings: s } = useStore.getState()
    setCredentialAccessor(() => ({
      pat: s.gitPersonalAccessToken, owner: s.gitRepoOwner,
      repo: s.gitRepoName, branch: s.gitBranch,
      authorName: s.gitAuthorName, authorEmail: s.gitAuthorEmail,
    }))
  }, [])

  useEffect(() => {
    const root = document.documentElement
    root.classList.remove('theme-matrix', 'theme-hacker', 'theme-glyph', 'theme-minimal')
    root.classList.add(`theme-${settings.theme}`)
  }, [settings.theme])

  const hasApiKey = settings.openRouterApiKey.trim().length > 0
  const hasConversation = currentConversationId !== null

  return (
    <main style={{
      display: 'flex', minHeight: '100vh', overflow: 'hidden',
      background: 'var(--bg)', color: 'var(--text)',
    }}>
      {/* Only show sidebar when signed in */}
      {hasApiKey && (
        <Sidebar
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen(v => !v)}
          onOpenSettings={() => setShowSettings(true)}
        />
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative' }}>
        {/* Settings button when signed in but no sidebar */}
        {hasApiKey && !sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            style={{
              position: 'absolute', top: '12px', left: '12px', zIndex: 10,
              background: 'transparent', border: '1px solid rgba(0,255,65,0.2)',
              borderRadius: '6px', color: 'var(--secondary)', cursor: 'pointer',
              padding: '6px 8px', fontFamily: 'monospace', fontSize: '14px',
            }}
            title="Open sidebar"
          >
            ☰
          </button>
        )}

        {!hasApiKey || !hasConversation ? (
          <WelcomeScreen onOpenSettings={() => setShowSettings(true)} />
        ) : (
          <ChatArea />
        )}
      </div>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </main>
  )
}
