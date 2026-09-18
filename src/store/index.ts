/**
 * src/store/index.ts
 * Jarvis application state — single source of truth.
 * Built with Zustand + persist middleware.
 * All state transitions are deterministic and explicit.
 * No inline business logic — store only manages state shape and transitions.
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { v4 as uuidv4 } from 'uuid'
import type {
  Message,
  Conversation,
  Persona,
  Attachment,
  VoiceState,
  SyncQueueEntry,
  NetworkStatus,
  AppSettings,
  Theme,
} from '@/types'
import { JARVIS_SYSTEM_PROMPT } from '@/lib/jarvisPrompt'

// ─── Default Personas ─────────────────────────────────────────────────────────

const DEFAULT_PERSONAS: Persona[] = [
  {
    id: 'jarvis',
    name: 'Jarvis',
    description: 'Your personal assistant. Direct, capable, no fluff.',
    tone: 'professional',
    coreDirective: 'Help the user accomplish tasks with precision and speed.',
    systemPrompt: JARVIS_SYSTEM_PROMPT,
    emoji: '',
    color: '#00ff41',
  },
  {
    id: 'dev',
    name: 'Dev Mode',
    description: 'Code-focused. Outputs production-grade implementations.',
    tone: 'technical',
    coreDirective: 'Write complete, typed, production-ready code without placeholders.',
    systemPrompt: `You are a principal-level software engineer. You write complete, production-ready code with explicit types, error handling, and no placeholders. You never truncate code blocks.`,
    emoji: '',
    color: '#ff8c00',
  },
  {
    id: 'analyst',
    name: 'Analyst',
    description: 'Data-driven reasoning and structured analysis.',
    tone: 'analytical',
    coreDirective: 'Analyze information systematically and present structured findings.',
    systemPrompt: `You are a senior analyst. You reason from evidence, structure your findings clearly, and quantify uncertainty. You avoid speculation without labeling it as such.`,
    emoji: '',
    color: '#e94560',
  },
]

// ─── State Interface ──────────────────────────────────────────────────────────

export interface JarvisState {
  // Hydration
  isHydrated: boolean

  // Settings
  settings: AppSettings

  // Conversations
  conversations: Conversation[]
  currentConversationId: string | null
  currentConversation: Conversation | null

  // Streaming
  isStreaming: boolean
  streamingMessageId: string | null

  // Voice
  voiceState: VoiceState

  // Network
  networkStatus: NetworkStatus

  // Sync queue (persisted)
  syncQueue: SyncQueueEntry[]

  // Personas
  personas: Persona[]
  currentPersonaId: string

  // UI
  showSettings: boolean
  sidebarOpen: boolean

  // ── Actions ────────────────────────────────────────────────────────────────

  setHydrated: () => void

  // Settings
  updateSettings: (patch: Partial<AppSettings>) => void

  // Conversations
  createConversation: (personaId?: string) => string
  selectConversation: (id: string) => void
  deleteConversation: (id: string) => void
  updateConversationTitle: (id: string, title: string) => void
  clearAllConversations: () => void

  // Messages
  addMessage: (
    conversationId: string,
    message: Omit<Message, 'id' | 'timestamp' | 'isStreaming' | 'isOfflineGenerated' | 'attachments'>
      & Partial<Pick<Message, 'attachments' | 'isOfflineGenerated'>>
  ) => string
  updateMessageContent: (
    conversationId: string,
    messageId: string,
    content: string,
    extra?: Partial<Message>
  ) => void
  finalizeStreamingMessage: (conversationId: string, messageId: string) => void
  addAttachmentToMessage: (
    conversationId: string,
    messageId: string,
    attachment: Attachment
  ) => void

  // Voice
  setVoiceState: (patch: Partial<VoiceState>) => void
  resetVoiceState: () => void

  // Network
  setNetworkStatus: (status: NetworkStatus) => void

  // Sync queue
  loadSyncQueue: (entries: SyncQueueEntry[]) => void
  addSyncQueueEntry: (entry: SyncQueueEntry) => void
  updateSyncQueueEntry: (id: string, patch: Partial<SyncQueueEntry>) => void
  removeSyncQueueEntry: (id: string) => void

  // Streaming
  setIsStreaming: (streaming: boolean) => void
  setStreamingMessageId: (id: string | null) => void

  // UI
  setShowSettings: (show: boolean) => void
  setSidebarOpen: (open: boolean) => void
  setCurrentPersonaId: (id: string) => void
}

// ─── Default Settings ─────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'matrix',
  openRouterApiKey: '',
  gitPersonalAccessToken: '',
  gitRepoOwner: '',
  gitRepoName: '',
  gitBranch: 'main',
  gitAuthorName: 'Jarvis',
  gitAuthorEmail: 'jarvis@local',
  voiceEnabled: true,
  voiceLanguage: 'en',
  offlineSyncEnabled: false,
}

const DEFAULT_VOICE_STATE: VoiceState = {
  transcriptionState: 'idle',
  transcript: '',
  errorMessage: null,
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useStore = create<JarvisState>()(
  persist(
    (set, get) => ({
      isHydrated: false,
      settings: DEFAULT_SETTINGS,
      conversations: [],
      currentConversationId: null,
      get currentConversation(): Conversation | null {
        const s = get()
        return s.conversations.find((c) => c.id === s.currentConversationId) ?? null
      },
      isStreaming: false,
      streamingMessageId: null,
      voiceState: DEFAULT_VOICE_STATE,
      networkStatus: 'unknown',
      syncQueue: [],
      personas: DEFAULT_PERSONAS,
      currentPersonaId: 'jarvis',
      showSettings: false,
      sidebarOpen: true,

      // ── Hydration ──────────────────────────────────────────────────────────

      setHydrated: () => set({ isHydrated: true }),

      // ── Settings ───────────────────────────────────────────────────────────

      updateSettings: (patch) =>
        set((s) => ({ settings: { ...s.settings, ...patch } })),

      // ── Conversations ──────────────────────────────────────────────────────

      createConversation: (personaId?: string) => {
        const id = uuidv4()
        const persona = personaId ?? get().currentPersonaId
        const conversation: Conversation = {
          id,
          title: 'New conversation',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          model: 'anthropic/claude-sonnet-4-6',
          persona,
        }
        set((s) => ({
          conversations: [conversation, ...s.conversations],
          currentConversationId: id,
        }))
        return id
      },

      selectConversation: (id) => set({ currentConversationId: id }),

      deleteConversation: (id) =>
        set((s) => {
          const next = s.conversations.filter((c) => c.id !== id)
          return {
            conversations: next,
            currentConversationId:
              s.currentConversationId === id
                ? (next[0]?.id ?? null)
                : s.currentConversationId,
          }
        }),

      updateConversationTitle: (id, title) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === id ? { ...c, title, updatedAt: Date.now() } : c
          ),
        })),

      clearAllConversations: () =>
        set({ conversations: [], currentConversationId: null }),

      // ── Messages ───────────────────────────────────────────────────────────

      addMessage: (conversationId, message) => {
        const messageId = uuidv4()
        const fullMessage: Message = {
          id: messageId,
          role: message.role,
          content: message.content,
          attachments: message.attachments ?? [],
          timestamp: Date.now(),
          model: message.model,
          persona: message.persona,
          isOfflineGenerated: message.isOfflineGenerated ?? false,
          isStreaming: message.role === 'assistant',
          voiceTranscript: message.voiceTranscript,
          errorDetail: message.errorDetail,
        }

        set((s) => ({
          conversations: s.conversations.map((c) => {
            if (c.id !== conversationId) return c
            const messages = [...c.messages, fullMessage]
            // Auto-title from first user message
            const title =
              c.messages.length === 0 && message.role === 'user'
                ? message.content.slice(0, 60)
                : c.title
            return { ...c, messages, title, updatedAt: Date.now() }
          }),
        }))

        return messageId
      },

      updateMessageContent: (conversationId, messageId, content, extra) =>
        set((s) => ({
          conversations: s.conversations.map((c) => {
            if (c.id !== conversationId) return c
            return {
              ...c,
              messages: c.messages.map((m) =>
                m.id === messageId ? { ...m, content, ...(extra ?? {}) } : m
              ),
              updatedAt: Date.now(),
            }
          }),
        })),

      finalizeStreamingMessage: (conversationId, messageId) =>
        set((s) => ({
          conversations: s.conversations.map((c) => {
            if (c.id !== conversationId) return c
            return {
              ...c,
              messages: c.messages.map((m) =>
                m.id === messageId ? { ...m, isStreaming: false } : m
              ),
            }
          }),
          isStreaming: false,
          streamingMessageId: null,
        })),

      addAttachmentToMessage: (conversationId, messageId, attachment) =>
        set((s) => ({
          conversations: s.conversations.map((c) => {
            if (c.id !== conversationId) return c
            return {
              ...c,
              messages: c.messages.map((m) =>
                m.id === messageId
                  ? { ...m, attachments: [...m.attachments, attachment] }
                  : m
              ),
            }
          }),
        })),

      // ── Voice ──────────────────────────────────────────────────────────────

      setVoiceState: (patch) =>
        set((s) => ({ voiceState: { ...s.voiceState, ...patch } })),

      resetVoiceState: () => set({ voiceState: DEFAULT_VOICE_STATE }),

      // ── Network ────────────────────────────────────────────────────────────

      setNetworkStatus: (status) => set({ networkStatus: status }),

      // ── Sync Queue ─────────────────────────────────────────────────────────

      loadSyncQueue: (entries) => set({ syncQueue: entries }),

      addSyncQueueEntry: (entry) =>
        set((s) => ({ syncQueue: [...s.syncQueue, entry] })),

      updateSyncQueueEntry: (id, patch) =>
        set((s) => ({
          syncQueue: s.syncQueue.map((e) =>
            e.id === id ? { ...e, ...patch } : e
          ),
        })),

      removeSyncQueueEntry: (id) =>
        set((s) => ({ syncQueue: s.syncQueue.filter((e) => e.id !== id) })),

      // ── Streaming ──────────────────────────────────────────────────────────

      setIsStreaming: (streaming) => set({ isStreaming: streaming }),
      setStreamingMessageId: (id) => set({ streamingMessageId: id }),

      // ── UI ─────────────────────────────────────────────────────────────────

      setShowSettings: (show) => set({ showSettings: show }),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setCurrentPersonaId: (id) => set({ currentPersonaId: id }),
    }),
    {
      name: 'jarvis-v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        settings: s.settings,
        conversations: s.conversations,
        currentConversationId: s.currentConversationId,
        syncQueue: s.syncQueue,
        currentPersonaId: s.currentPersonaId,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.setHydrated()
        }
      },
    }
  )
)
