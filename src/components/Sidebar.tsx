'use client'

import { useCallback, type ReactElement } from 'react'
import { useStore } from '@/store'
import type { Conversation } from '@/types'

interface SidebarProps {
  isOpen: boolean
  onToggle: () => void
  onOpenSettings: () => void
}

const S = {
  aside: (open: boolean) => ({
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    borderRight: '1px solid rgba(0,255,65,0.2)',
    background: 'rgba(17,22,17,0.5)',
    width: open ? '220px' : '48px',
    transition: 'width 0.2s',
    overflow: 'hidden',
  }),
  topRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 8px',
    borderBottom: '1px solid rgba(0,255,65,0.15)',
    flexShrink: 0,
  },
  iconBtn: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: '6px',
    borderRadius: '6px',
    color: 'var(--secondary)',
    fontSize: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
  },
  list: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '8px 4px',
  },
  empty: {
    fontFamily: 'monospace',
    fontSize: '10px',
    color: 'rgba(74,124,89,0.4)',
    textAlign: 'center' as const,
    padding: '24px 8px',
  },
  convItem: (active: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 10px',
    margin: '2px 0',
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: 'monospace',
    fontSize: '11px',
    color: active ? 'var(--primary)' : 'var(--secondary)',
    background: active ? 'var(--dim)' : 'transparent',
    border: active ? '1px solid rgba(0,255,65,0.2)' : '1px solid transparent',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
  }),
  convTitle: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    flex: 1,
  },
  delBtn: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: 'rgba(74,124,89,0.4)',
    fontSize: '12px',
    padding: '0 0 0 6px',
    flexShrink: 0,
  },
  bottomBar: {
    borderTop: '1px solid rgba(0,255,65,0.15)',
    padding: '8px',
    flexShrink: 0,
  },
  settingsBtn: (open: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    gap: open ? '8px' : '0',
    justifyContent: open ? 'flex-start' : 'center',
    width: '100%',
    padding: '8px',
    borderRadius: '6px',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--secondary)',
    fontFamily: 'monospace',
    fontSize: '12px',
    transition: 'background 0.15s',
  }),
}

export function Sidebar({ isOpen, onToggle, onOpenSettings }: SidebarProps): ReactElement {
  const { conversations, currentConversationId, createConversation, selectConversation, deleteConversation } = useStore()

  const handleDelete = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    deleteConversation(id)
  }, [deleteConversation])

  return (
    <aside style={S.aside(isOpen)}>
      <div style={S.topRow}>
        <button style={S.iconBtn} onClick={onToggle} title={isOpen ? 'Collapse' : 'Expand'}>
          {isOpen ? '◀' : '▶'}
        </button>
        {isOpen && (
          <button style={S.iconBtn} onClick={() => createConversation()} title="New conversation">
            ＋
          </button>
        )}
      </div>

      {isOpen && (
        <div style={S.list}>
          {conversations.length === 0 ? (
            <div style={S.empty}>No conversations yet</div>
          ) : (
            conversations.map((conv: Conversation) => (
              <div
                key={conv.id}
                style={S.convItem(conv.id === currentConversationId)}
                onClick={() => selectConversation(conv.id)}
              >
                <span style={S.convTitle}>{conv.title}</span>
                <button
                  style={S.delBtn}
                  onClick={(e) => handleDelete(e, conv.id)}
                  title="Delete"
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
      )}

      <div style={S.bottomBar}>
        <button
          style={S.settingsBtn(isOpen)}
          onClick={onOpenSettings}
          title="Settings"
        >
          <span>⚙</span>
          {isOpen && <span>Settings</span>}
        </button>
      </div>
    </aside>
  )
}
