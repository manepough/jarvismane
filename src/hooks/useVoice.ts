/**
 * src/hooks/useVoice.ts
 * Voice input state machine hook.
 * Delegates all MediaRecorder and Whisper logic to VoiceService.
 * Only manages the React state transition layer.
 */

import { useCallback, useRef } from 'react'
import { useStore } from '@/store'
import {
  startRecording,
  stopRecording,
  transcribeAudio,
  isRecording,
} from '@/services/VoiceService'
import type { VoicePermissionError, VoiceTranscriptionError } from '@/types'

export interface UseVoiceReturn {
  isRecording: boolean
  transcriptionState: 'idle' | 'recording' | 'transcribing' | 'done' | 'error'
  transcript: string
  errorMessage: string | null
  startVoiceInput: () => Promise<void>
  stopVoiceInput: () => void
  clearVoiceState: () => void
}

export function useVoice(onTranscriptReady: (transcript: string) => void): UseVoiceReturn {
  const { settings, voiceState, setVoiceState, resetVoiceState } = useStore()
  const audioBlobRef = useRef<Blob | null>(null)
  const mimeTypeRef = useRef<string>('audio/webm')

  const startVoiceInput = useCallback(async (): Promise<void> => {
    if (isRecording()) return

    setVoiceState({ transcriptionState: 'recording', errorMessage: null, transcript: '' })
    audioBlobRef.current = null

    try {
      await startRecording({
        onChunk: () => {
          // Chunk callback available for future VAD integration
        },
        onStop: (audioBlob, mimeType) => {
          audioBlobRef.current = audioBlob
          mimeTypeRef.current = mimeType
          handleTranscription(audioBlob, mimeType)
        },
        onError: (error: VoicePermissionError | VoiceTranscriptionError | Error) => {
          setVoiceState({
            transcriptionState: 'error',
            errorMessage: error.message,
          })
        },
      })
    } catch (err: unknown) {
      setVoiceState({
        transcriptionState: 'error',
        errorMessage: err instanceof Error ? err.message : 'Failed to start recording',
      })
    }
  }, [settings, setVoiceState])

  const handleTranscription = useCallback(
    async (audioBlob: Blob, mimeType: string): Promise<void> => {
      setVoiceState({ transcriptionState: 'transcribing' })

      if (settings.openRouterApiKey.trim() === '') {
        // No API key — cannot transcribe; provide audio feedback to user
        setVoiceState({
          transcriptionState: 'error',
          errorMessage: 'Set your OpenRouter API key in Settings to enable voice transcription.',
        })
        return
      }

      try {
        const transcript = await transcribeAudio(
          audioBlob,
          mimeType,
          // Whisper uses OpenAI key; if only OpenRouter key available, flag it
          settings.openRouterApiKey,
          settings.voiceLanguage
        )

        if (transcript.trim().length === 0) {
          setVoiceState({
            transcriptionState: 'error',
            errorMessage: 'No speech detected. Try speaking closer to the microphone.',
          })
          return
        }

        setVoiceState({ transcriptionState: 'done', transcript })
        onTranscriptReady(transcript)
      } catch (err: unknown) {
        setVoiceState({
          transcriptionState: 'error',
          errorMessage: err instanceof Error ? err.message : 'Transcription failed',
        })
      }
    },
    [settings, setVoiceState, onTranscriptReady]
  )

  const stopVoiceInput = useCallback((): void => {
    stopRecording()
  }, [])

  const clearVoiceState = useCallback((): void => {
    resetVoiceState()
    audioBlobRef.current = null
  }, [resetVoiceState])

  return {
    isRecording: voiceState.transcriptionState === 'recording',
    transcriptionState: voiceState.transcriptionState,
    transcript: voiceState.transcript,
    errorMessage: voiceState.errorMessage,
    startVoiceInput,
    stopVoiceInput,
    clearVoiceState,
  }
}
