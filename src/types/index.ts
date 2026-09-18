/**
 * src/types/index.ts
 * Central type registry for Jarvis. All domain types live here.
 * No type is defined inline in components or service files.
 */

// ─── Attachment / File Transfer ──────────────────────────────────────────────

export type AttachmentMediaType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/gif'
  | 'application/pdf'
  | 'text/plain'
  | 'text/markdown'
  | 'application/json'
  | 'audio/webm'
  | 'audio/mp4'
  | 'audio/wav'
  | 'video/mp4'
  | 'application/octet-stream'

export interface Attachment {
  id: string
  filename: string
  mediaType: AttachmentMediaType
  /** base64-encoded content for sending to LLM or storing locally */
  data: string
  /** Human-readable size string e.g. "1.2 MB" */
  sizeLabel: string
  /** Raw byte size */
  sizeBytes: number
  /** Whether Jarvis (assistant) sent this or the user sent it */
  sender: 'user' | 'assistant'
  /** URL.createObjectURL result for local preview; null after revocation */
  previewUrl: string | null
  uploadedAt: number
}

// ─── Message ─────────────────────────────────────────────────────────────────

export type MessageRole = 'user' | 'assistant' | 'system'

export type VoiceTranscriptionState = 'idle' | 'recording' | 'transcribing' | 'done' | 'error'

export interface Message {
  id: string
  role: MessageRole
  content: string
  attachments: Attachment[]
  timestamp: number
  model?: string
  persona?: string
  /** True when this message was produced by the offline local parser */
  isOfflineGenerated: boolean
  /** True while the assistant is still streaming tokens */
  isStreaming: boolean
  /** Voice input: original transcript before any editing */
  voiceTranscript?: string
  /** Error detail if this message represents a failed API call */
  errorDetail?: string
}

// ─── Conversation ─────────────────────────────────────────────────────────────

export interface Conversation {
  id: string
  title: string
  messages: Message[]
  createdAt: number
  updatedAt: number
  model: string
  persona: string
}

// ─── Persona ──────────────────────────────────────────────────────────────────

export interface Persona {
  id: string
  name: string
  description: string
  tone: string
  coreDirective: string
  systemPrompt: string
  emoji: string
  color: string
}

// ─── Voice ────────────────────────────────────────────────────────────────────

export interface VoiceState {
  transcriptionState: VoiceTranscriptionState
  transcript: string
  errorMessage: string | null
}

// ─── Offline Sync Queue ───────────────────────────────────────────────────────

export type SyncOperationType = 'git_commit' | 'git_push' | 'message_backup'

export type SyncQueueEntryStatus = 'pending' | 'in_flight' | 'confirmed' | 'failed'

export interface SyncQueueEntry {
  id: string
  operationType: SyncOperationType
  payload: Record<string, unknown>
  status: SyncQueueEntryStatus
  createdAt: number
  lastAttemptAt: number | null
  attemptCount: number
  errorMessage: string | null
  /** SHA acknowledged by remote; only set once remote confirms push */
  remoteAcknowledgedSha: string | null
}

// ─── Git ──────────────────────────────────────────────────────────────────────

export interface GitCommitResult {
  sha: string
  message: string
  timestamp: number
  pushedToRemote: boolean
}

export interface GitStatus {
  branch: string
  ahead: number
  behind: number
  staged: string[]
  unstaged: string[]
  untracked: string[]
}

// ─── Network ──────────────────────────────────────────────────────────────────

export type NetworkStatus = 'online' | 'offline' | 'unknown'

// ─── Shizuku ─────────────────────────────────────────────────────────────────

export type ShizukuServiceState = 'unavailable' | 'disconnected' | 'connected' | 'permission_denied'

export interface ShizukuCommandResult {
  exitCode: number
  stdout: string
  stderr: string
  durationMs: number
}

// ─── Typed Errors ─────────────────────────────────────────────────────────────

export class JarvisBaseError extends Error {
  public readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'JarvisBaseError'
    this.code = code
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export class APIKeyMissingError extends JarvisBaseError {
  constructor() {
    super('API_KEY_MISSING', 'No API key is configured. Open Settings to add your OpenRouter key.')
    this.name = 'APIKeyMissingError'
  }
}

export class APIRequestError extends JarvisBaseError {
  public readonly httpStatus: number
  constructor(httpStatus: number, detail: string) {
    super('API_REQUEST_FAILED', `API request failed with HTTP ${httpStatus}: ${detail}`)
    this.name = 'APIRequestError'
    this.httpStatus = httpStatus
  }
}

export class AttachmentSizeLimitError extends JarvisBaseError {
  public readonly filename: string
  public readonly sizeBytes: number
  public readonly limitBytes: number
  constructor(filename: string, sizeBytes: number, limitBytes: number) {
    super(
      'ATTACHMENT_SIZE_LIMIT',
      `File "${filename}" is ${Math.round(sizeBytes / 1024 / 1024)}MB; maximum is ${Math.round(limitBytes / 1024 / 1024)}MB.`
    )
    this.name = 'AttachmentSizeLimitError'
    this.filename = filename
    this.sizeBytes = sizeBytes
    this.limitBytes = limitBytes
  }
}

export class AttachmentTypeError extends JarvisBaseError {
  public readonly filename: string
  public readonly detectedType: string
  constructor(filename: string, detectedType: string) {
    super(
      'ATTACHMENT_TYPE_BLOCKED',
      `File "${filename}" has unsupported type "${detectedType}".`
    )
    this.name = 'AttachmentTypeError'
    this.filename = filename
    this.detectedType = detectedType
  }
}

export class GitSyncNetworkError extends JarvisBaseError {
  constructor(detail: string) {
    super('GIT_SYNC_NETWORK', `Git sync failed due to network error: ${detail}`)
    this.name = 'GitSyncNetworkError'
  }
}

export class GitConflictError extends JarvisBaseError {
  public readonly branch: string
  constructor(branch: string) {
    super('GIT_CONFLICT', `Merge conflict on branch "${branch}". Conflict resolution in progress.`)
    this.name = 'GitConflictError'
    this.branch = branch
  }
}

export class GitCredentialError extends JarvisBaseError {
  constructor() {
    super('GIT_CREDENTIAL', 'Git credentials are missing or invalid. Configure SSH key or PAT in Settings.')
    this.name = 'GitCredentialError'
  }
}

export class VoicePermissionError extends JarvisBaseError {
  constructor() {
    super('VOICE_PERMISSION', 'Microphone access was denied. Grant microphone permission to use voice input.')
    this.name = 'VoicePermissionError'
  }
}

export class VoiceTranscriptionError extends JarvisBaseError {
  constructor(detail: string) {
    super('VOICE_TRANSCRIPTION', `Voice transcription failed: ${detail}`)
    this.name = 'VoiceTranscriptionError'
  }
}

export class ShizukuPermissionError extends JarvisBaseError {
  constructor() {
    super('SHIZUKU_PERMISSION', 'Shizuku permission denied. Grant USER_SERVICE permission in Shizuku app.')
    this.name = 'ShizukuPermissionError'
  }
}

export class ShizukuBinderError extends JarvisBaseError {
  constructor(detail: string) {
    super('SHIZUKU_BINDER', `Shizuku binder transaction failed: ${detail}`)
    this.name = 'ShizukuBinderError'
  }
}

export class ShizukuTimeoutError extends JarvisBaseError {
  public readonly commandPreview: string
  constructor(commandPreview: string, timeoutMs: number) {
    super(
      'SHIZUKU_TIMEOUT',
      `Shizuku command timed out after ${timeoutMs}ms: "${commandPreview.slice(0, 60)}"`
    )
    this.name = 'ShizukuTimeoutError'
    this.commandPreview = commandPreview
  }
}

export class OfflineQueueError extends JarvisBaseError {
  constructor(entryId: string, detail: string) {
    super('OFFLINE_QUEUE', `Sync queue entry "${entryId}" failed: ${detail}`)
    this.name = 'OfflineQueueError'
  }
}

// ─── App State Shape (subset — full in store/index.ts) ───────────────────────

export type Theme = 'matrix' | 'hacker' | 'glyph' | 'minimal'

export interface AppSettings {
  theme: Theme
  openRouterApiKey: string
  gitPersonalAccessToken: string
  gitRepoOwner: string
  gitRepoName: string
  gitBranch: string
  gitAuthorName: string
  gitAuthorEmail: string
  voiceEnabled: boolean
  voiceLanguage: string
  offlineSyncEnabled: boolean
}
