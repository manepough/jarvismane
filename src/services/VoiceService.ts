/**
 * src/services/VoiceService.ts
 * Voice input pipeline: MediaRecorder lifecycle, audio blob accumulation,
 * and transcription via OpenAI Whisper API with graceful offline fallback.
 *
 * Threading model: All MediaRecorder events are browser-native callbacks.
 * The transcription fetch runs in a separate async context.
 * This module never touches the DOM or React state directly.
 */

import type { Attachment } from '@/types'
import { VoicePermissionError, VoiceTranscriptionError } from '@/types'

// ─── Constants ────────────────────────────────────────────────────────────────

const WHISPER_ENDPOINT: string = 'https://api.openai.com/v1/audio/transcriptions'
const WHISPER_MODEL: string = 'whisper-1'
const MAX_RECORDING_MS: number = 120_000 // 2 minutes hard stop
const MIME_PREFERENCE: string[] = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']

// ─── Module State (singleton per browser tab) ─────────────────────────────────

let activeRecorder: MediaRecorder | null = null
let activeStream: MediaStream | null = null
let hardStopTimer: ReturnType<typeof setTimeout> | null = null

// ─── Public API ───────────────────────────────────────────────────────────────

export interface RecordingCallbacks {
  onChunk: (blob: Blob) => void
  onStop: (audioBlob: Blob, mimeType: string) => void
  onError: (error: VoicePermissionError | VoiceTranscriptionError | Error) => void
}

/**
 * Request microphone permission and start recording.
 * Throws VoicePermissionError if the browser denies access.
 * Calls onStop() with the accumulated audio blob when stopRecording() is called
 * or the 2-minute hard limit is reached.
 */
export async function startRecording(callbacks: RecordingCallbacks): Promise<void> {
  if (activeRecorder !== null) {
    stopRecording()
  }

  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })
  } catch (err: unknown) {
    if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
      throw new VoicePermissionError()
    }
    throw new Error(`Microphone access failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  const mimeType: string = selectSupportedMime()
  const chunks: Blob[] = []

  const recorder: MediaRecorder = new MediaRecorder(stream, { mimeType })

  recorder.ondataavailable = (event: BlobEvent): void => {
    if (event.data.size > 0) {
      chunks.push(event.data)
      callbacks.onChunk(event.data)
    }
  }

  recorder.onstop = (): void => {
    clearHardStop()
    releaseStream(stream)
    activeRecorder = null
    activeStream = null

    const audioBlob: Blob = new Blob(chunks, { type: mimeType })
    callbacks.onStop(audioBlob, mimeType)
  }

  recorder.onerror = (event: Event): void => {
    clearHardStop()
    releaseStream(stream)
    activeRecorder = null
    activeStream = null

    const detail: string =
      event instanceof ErrorEvent ? event.message : 'MediaRecorder produced an error event'
    callbacks.onError(new Error(`Recording error: ${detail}`))
  }

  activeStream = stream
  activeRecorder = recorder

  // Collect chunks every 250ms for low-latency onChunk callbacks
  recorder.start(250)

  // Enforce hard 2-minute stop to prevent runaway recording
  hardStopTimer = setTimeout(() => {
    if (activeRecorder?.state === 'recording') {
      stopRecording()
    }
  }, MAX_RECORDING_MS)
}

/**
 * Stop an active recording. If no recording is active, this is a no-op.
 */
export function stopRecording(): void {
  clearHardStop()
  if (activeRecorder !== null && activeRecorder.state !== 'inactive') {
    try {
      activeRecorder.stop()
    } catch {
      // If stop() throws (e.g. state race), clean up manually
      if (activeStream !== null) {
        releaseStream(activeStream)
      }
      activeRecorder = null
      activeStream = null
    }
  }
}

/**
 * Returns true if a recording is currently active.
 */
export function isRecording(): boolean {
  return activeRecorder !== null && activeRecorder.state === 'recording'
}

/**
 * Transcribe an audio blob using the OpenAI Whisper API.
 * Falls back to an empty string with a typed error if the network is unavailable.
 *
 * @param audioBlob - The audio blob produced by stopRecording
 * @param mimeType  - The MIME type of the blob
 * @param apiKey    - OpenAI API key (NOT OpenRouter — Whisper is a direct OAI call)
 * @param language  - BCP-47 language tag e.g. "en", "nl"
 */
export async function transcribeAudio(
  audioBlob: Blob,
  mimeType: string,
  apiKey: string,
  language: string = 'en'
): Promise<string> {
  const extension: string = mimeTypeToExtension(mimeType)
  const formData: FormData = new FormData()
  formData.append('file', audioBlob, `recording.${extension}`)
  formData.append('model', WHISPER_MODEL)
  formData.append('language', language)
  formData.append('response_format', 'text')

  let response: Response
  try {
    response = await fetch(WHISPER_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
      signal: AbortSignal.timeout(30_000),
    })
  } catch (err: unknown) {
    // Network failure or timeout — treat as offline
    const detail: string = err instanceof Error ? err.message : String(err)
    throw new VoiceTranscriptionError(`Network error during transcription: ${detail}`)
  }

  if (!response.ok) {
    const body: string = await response.text().catch(() => '')
    throw new VoiceTranscriptionError(
      `Whisper API returned HTTP ${response.status}: ${body.slice(0, 200)}`
    )
  }

  const transcript: string = (await response.text()).trim()
  return transcript
}

/**
 * Convert an audio Blob to an Attachment object for display/download.
 */
export function audioToAttachment(audioBlob: Blob, mimeType: string, filename: string): Attachment {
  return {
    id: crypto.randomUUID(),
    filename,
    mediaType: mimeType as Attachment['mediaType'],
    data: '', // Populated lazily if storage is needed; previewUrl handles playback
    sizeLabel: formatBytes(audioBlob.size),
    sizeBytes: audioBlob.size,
    sender: 'user',
    previewUrl: URL.createObjectURL(audioBlob),
    uploadedAt: Date.now(),
  }
}

// ─── Private Helpers ──────────────────────────────────────────────────────────

function selectSupportedMime(): string {
  for (const mime of MIME_PREFERENCE) {
    if (MediaRecorder.isTypeSupported(mime)) {
      return mime
    }
  }
  return ''
}

function releaseStream(stream: MediaStream): void {
  try {
    stream.getTracks().forEach((track) => track.stop())
  } catch {
    // Non-fatal; stream may already be closed
  }
}

function clearHardStop(): void {
  if (hardStopTimer !== null) {
    clearTimeout(hardStopTimer)
    hardStopTimer = null
  }
}

function mimeTypeToExtension(mimeType: string): string {
  const map: Record<string, string> = {
    'audio/webm': 'webm',
    'audio/webm;codecs=opus': 'webm',
    'audio/mp4': 'mp4',
    'audio/ogg': 'ogg',
    'audio/wav': 'wav',
  }
  return map[mimeType] ?? 'webm'
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}
