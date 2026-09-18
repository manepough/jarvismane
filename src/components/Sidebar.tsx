'use client'

/**
 * src/components/Sidebar.tsx
 * Conversation list + new conversation button + settings link.
 * No fake metrics. No counters of dubious origin.
 */

import { useCallback, type ReactElement } from 'react'
import { Plus, Trash2, Settings, PanelLeftClose, PanelLeft } from 'lucide-react'
import { useStore } from '@/store'
import type { Conversation } from '@/types'

interface SidebarProps {
  isOpen: boolean
  onToggle: () => void
  onOpenSettings: () => void
}

export function Sidebar({ isOpen, onToggle, onOpenSettings }: SidebarProps): ReactElement {
  const {
    conversations,
    currentConversationId,
    createConversation,
    selectConversation,
    deleteConversation,
  } = useStore()

  const handleNew = useCallback((): void => {
    createConversation()
  }, [createConversation])

  const handleDelete = useCallback(
    (e: React.MouseEvent, id: string): void => {
      e.stopPropagation()
      deleteConversation(id)
    },
    [deleteConversation]
  )

  return (
    <aside
      className={`flex-shrink-0 flex flex-col border-r border-[var(--primary)]/20
        bg-[var(--dim)]/30 transition-all duration-200 overflow-hidden
        ${isOpen ? 'w-56' : 'w-12'}`}
    >
      {/* Top controls */}
      <div className="flex items-center justify-between px-2 py-3 border-b border-[var(--primary)]/20">
        <button
          type="button"
          onClick={onToggle}
          className="p-1.5 rounded-md text-[var(--secondary)] hover:text-[var(--text)] hover:bg-[var(--dim)] transition-colors"
          title={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {isOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
        </button>
        {isOpen && (
          <button
            type="button"
            onClick={handleNew}
            className="p-1.5 rounded-md text-[var(--secondary)] hover:text-[var(--primary)] hover:bg-[var(--dim)] transition-colors"
            title="New conversation"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Conversation list */}
      {isOpen && (
        <div className="flex-1 overflow-y-auto py-2">
          {conversations.length === 0 ? (
            <p className="text-[10px] font-mono text-[var(--secondary)]/40 text-center px-4 py-8">
              No conversations yet
            </p>
          ) : (
            conversations.map((conv: Conversation) => (
              <div
                key={conv.id}
                role="button"
                tabIndex={0}
                onClick={() => selectConversation(conv.id)}
                onKeyDown={(e) => { if (e.key === 'Enter') selectConversation(conv.id) }}
                className={`group flex items-center justify-between px-3 py-2 mx-1 rounded-lg
                  cursor-pointer text-xs font-mono transition-colors
                  ${currentConversationId === conv.id
                    ? 'bg-[var(--dim)] text-[var(--primary)] border border-[var(--primary)]/20'
                    : 'text-[var(--secondary)] hover:bg-[var(--dim)]/60 hover:text-[var(--text)]'
                  }`}
              >
                <span className="truncate">{conv.title}</span>
                <button
                  type="button"
                  onClick={(e) => handleDelete(e, conv.id)}
                  className="flex-shrink-0 opacity-0 group-hover:opacity-100
                    text-[var(--secondary)]/50 hover:text-red-400 transition-all ml-1"
                  title="Delete conversation"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Settings button */}
      <div className="border-t border-[var(--primary)]/20 p-2">
        <button
          type="button"
          onClick={onOpenSettings}
          className={`flex items-center gap-2 w-full px-2 py-2 rounded-md
            text-[var(--secondary)] hover:text-[var(--text)] hover:bg-[var(--dim)] transition-colors
            ${isOpen ? 'justify-start' : 'justify-center'}`}
          title="Settings"
        >
          <Settings className="w-4 h-4 flex-shrink-0" />
          {isOpen && <span className="text-xs font-mono">Settings</span>}
        </button>
      </div>
    </aside>
  )
}
