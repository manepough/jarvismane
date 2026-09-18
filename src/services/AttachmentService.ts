/**
 * src/services/AttachmentService.ts
 * Handles all file/image attachment ingestion for both user uploads and
 * Jarvis-generated file outputs. Completely decoupled from UI components.
 *
 * Responsibilities:
 *  - MIME type validation against allowlist
 *  - Size limit enforcement
 *  - base64 encoding for API submission and local storage
 *  - Object URL lifecycle (create → track → revoke on cleanup)
 *  - Human-readable size formatting
 */

import { v4 as uuidv4 } from 'uuid'
import type { Attachment, AttachmentMediaType } from '@/types'
import {
  AttachmentSizeLimitError,
  AttachmentTypeError,
} from '@/types'

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_ATTACHMENT_BYTES: number = 20 * 1024 * 1024 // 20 MB hard limit

const ALLOWED_MEDIA_TYPES: ReadonlySet<string> = new Set<AttachmentMediaType>([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/json',
  'audio/webm',
  'audio/mp4',
  'audio/wav',
  'video/mp4',
  'application/octet-stream',
])

// Object URLs created by this service that must be revoked on cleanup
const activeObjectUrls: Map<string, string> = new Map<string, string>()

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Process a File selected by the user and return a validated Attachment.
 * Throws typed errors — never returns null or undefined on failure.
 */
export async function processUserFile(
  file: File,
  sender: 'user' | 'assistant' = 'user'
): Promise<Attachment> {
  const mediaType: string = file.type || 'application/octet-stream'

  if (!ALLOWED_MEDIA_TYPES.has(mediaType)) {
    throw new AttachmentTypeError(file.name, mediaType)
  }

  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new AttachmentSizeLimitError(file.name, file.size, MAX_ATTACHMENT_BYTES)
  }

  const data: string = await fileToBase64(file)
  const previewUrl: string | null = createTrackedObjectUrl(file)

  const attachment: Attachment = {
    id: uuidv4(),
    filename: sanitizeFilename(file.name),
    mediaType: mediaType as AttachmentMediaType,
    data,
    sizeLabel: formatBytes(file.size),
    sizeBytes: file.size,
    sender,
    previewUrl,
    uploadedAt: Date.now(),
  }

  return attachment
}

/**
 * Build an Attachment from raw base64 data (e.g. for Jarvis-generated files).
 * The caller is responsible for supplying a valid mediaType from the allowlist.
 */
export function buildAssistantAttachment(params: {
  filename: string
  mediaType: AttachmentMediaType
  data: string
  sizeBytes: number
}): Attachment {
  const { filename, mediaType, data, sizeBytes } = params

  if (!ALLOWED_MEDIA_TYPES.has(mediaType)) {
    throw new AttachmentTypeError(filename, mediaType)
  }

  const blob: Blob = base64ToBlob(data, mediaType)
  const previewUrl: string | null = createTrackedObjectUrl(blob)

  return {
    id: uuidv4(),
    filename: sanitizeFilename(filename),
    mediaType,
    data,
    sizeLabel: formatBytes(sizeBytes),
    sizeBytes,
    sender: 'assistant',
    previewUrl,
    uploadedAt: Date.now(),
  }
}

/**
 * Trigger a browser download of an attachment.
 * Safe to call even if previewUrl has been revoked — recreates from base64.
 */
export function downloadAttachment(attachment: Attachment): void {
  const url: string =
    attachment.previewUrl ?? URL.createObjectURL(base64ToBlob(attachment.data, attachment.mediaType))

  const anchor: HTMLAnchorElement = document.createElement('a')
  anchor.href = url
  anchor.download = attachment.filename
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)

  // If we created a temporary URL above, clean it up after the click
  if (!attachment.previewUrl) {
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

/**
 * Revoke all object URLs created during this session. Call on app unmount
 * or when clearing conversation history to prevent memory leaks.
 */
export function revokeAllObjectUrls(): void {
  for (const [, url] of activeObjectUrls) {
    try {
      URL.revokeObjectURL(url)
    } catch {
      // Individual revocation failures are non-fatal
    }
  }
  activeObjectUrls.clear()
}

/**
 * Revoke the object URL for a single attachment by its id.
 */
export function revokeAttachmentUrl(attachmentId: string): void {
  const url: string | undefined = activeObjectUrls.get(attachmentId)
  if (url !== undefined) {
    try {
      URL.revokeObjectURL(url)
    } catch {
      // Non-fatal
    }
    activeObjectUrls.delete(attachmentId)
  }
}

/**
 * Returns whether a given mediaType is an image that can be sent to vision-capable LLMs.
 */
export function isVisionCompatibleType(mediaType: AttachmentMediaType): boolean {
  return (
    mediaType === 'image/jpeg' ||
    mediaType === 'image/png' ||
    mediaType === 'image/webp' ||
    mediaType === 'image/gif'
  )
}

/**
 * Returns whether a given mediaType is a text-extractable document.
 */
export function isTextExtractableType(mediaType: AttachmentMediaType): boolean {
  return (
    mediaType === 'text/plain' ||
    mediaType === 'text/markdown' ||
    mediaType === 'application/json' ||
    mediaType === 'application/pdf'
  )
}

// ─── Private Helpers ──────────────────────────────────────────────────────────

function fileToBase64(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader: FileReader = new FileReader()
    reader.onload = (): void => {
      const result: string | ArrayBuffer | null = reader.result
      if (typeof result !== 'string') {
        reject(new Error('FileReader produced non-string result'))
        return
      }
      // result is "data:<mediaType>;base64,<data>" — strip the prefix
      const base64: string = result.split(',')[1] ?? ''
      resolve(base64)
    }
    reader.onerror = (): void => {
      reject(new Error(`FileReader error reading "${file.name}": ${reader.error?.message ?? 'unknown'}`))
    }
    reader.readAsDataURL(file)
  })
}

function base64ToBlob(base64: string, mediaType: string): Blob {
  const binary: string = atob(base64)
  const buffer: ArrayBuffer = new ArrayBuffer(binary.length)
  const view: Uint8Array = new Uint8Array(buffer)
  for (let i = 0; i < binary.length; i++) {
    view[i] = binary.charCodeAt(i)
  }
  return new Blob([buffer], { type: mediaType })
}

function createTrackedObjectUrl(source: File | Blob): string | null {
  try {
    const url: string = URL.createObjectURL(source)
    // We use the URL itself as a deduplication key since attachment IDs
    // aren't assigned until after this call
    activeObjectUrls.set(url, url)
    return url
  } catch {
    return null
  }
}

function sanitizeFilename(name: string): string {
  // Strip path traversal characters and null bytes; limit to 255 chars
  return name.replace(/[/\\:*?"<>|]/g, '_').replace(/\0/g, '').slice(0, 255)
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}
