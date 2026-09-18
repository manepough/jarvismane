/**
 * src/hooks/useNetworkStatus.ts
 * Monitors browser online/offline events and updates the store.
 * When transitioning back to online, triggers the sync queue drain.
 */

import { useEffect } from 'react'
import { useStore } from '@/store'
import { drainSyncQueue } from '@/services/GitSyncService'

export function useNetworkStatus(): void {
  const { setNetworkStatus, updateSyncQueueEntry, removeSyncQueueEntry, settings } = useStore()

  useEffect(() => {
    // Set initial state
    setNetworkStatus(navigator.onLine ? 'online' : 'offline')

    const handleOnline = (): void => {
      setNetworkStatus('online')
      if (settings.offlineSyncEnabled) {
        drainSyncQueue((entry) => {
          if (entry.status === 'confirmed') {
            updateSyncQueueEntry(entry.id, entry)
            // Remove confirmed entries after a brief delay so UI can show confirmation
            setTimeout(() => removeSyncQueueEntry(entry.id), 2000)
          } else {
            updateSyncQueueEntry(entry.id, entry)
          }
        }).catch((err: unknown) => {
          console.error('[useNetworkStatus] Queue drain error:', err)
        })
      }
    }

    const handleOffline = (): void => {
      setNetworkStatus('offline')
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return (): void => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [setNetworkStatus, updateSyncQueueEntry, removeSyncQueueEntry, settings.offlineSyncEnabled])
}
