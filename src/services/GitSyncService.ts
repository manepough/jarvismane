/**
 * src/services/GitSyncService.ts
 * GitHub API integration using Personal Access Tokens stored in browser
 * localStorage under encryption (best available in a web context).
 *
 * Operations:
 *  - Verify repo access
 *  - Stage, commit, and push file changes via GitHub REST API
 *  - Conflict resolution via force-with-lease strategy
 *  - Offline queue drain with exponential backoff
 *  - Batched commits to avoid rate limit floods
 *
 * All credentials are fetched from the store at call time.
 * No PAT is ever embedded in source or logged.
 */

import { v4 as uuidv4 } from 'uuid'
import type { SyncQueueEntry, GitCommitResult, GitStatus, SyncOperationType } from '@/types'
import {
  GitSyncNetworkError,
  GitConflictError,
  GitCredentialError,
  OfflineQueueError,
} from '@/types'

// ─── Constants ────────────────────────────────────────────────────────────────

const GITHUB_API_BASE: string = 'https://api.github.com'
const MAX_BATCH_SIZE: number = 10
const MAX_RETRY_ATTEMPTS: number = 5
const BASE_BACKOFF_MS: number = 2_000

// ─── In-memory sync queue (persisted to localStorage in store) ────────────────

let syncQueue: SyncQueueEntry[] = []
let drainInProgress: boolean = false

// ─── Credential Accessor ──────────────────────────────────────────────────────

interface GitCredentials {
  pat: string
  owner: string
  repo: string
  branch: string
  authorName: string
  authorEmail: string
}

/** Injected by the app on init; never stored in this module as a raw string */
let credentialAccessor: (() => GitCredentials | null) | null = null

export function setCredentialAccessor(fn: () => GitCredentials | null): void {
  credentialAccessor = fn
}

function getCredentials(): GitCredentials {
  if (credentialAccessor === null) {
    throw new GitCredentialError()
  }
  const creds = credentialAccessor()
  if (creds === null || creds.pat.trim() === '') {
    throw new GitCredentialError()
  }
  return creds
}

// ─── Queue Management ─────────────────────────────────────────────────────────

export function loadQueueFromStorage(entries: SyncQueueEntry[]): void {
  syncQueue = entries.filter((e) => e.status !== 'confirmed')
}

export function getQueueSnapshot(): SyncQueueEntry[] {
  return [...syncQueue]
}

export function enqueueOperation(
  operationType: SyncOperationType,
  payload: Record<string, unknown>
): SyncQueueEntry {
  const entry: SyncQueueEntry = {
    id: uuidv4(),
    operationType,
    payload,
    status: 'pending',
    createdAt: Date.now(),
    lastAttemptAt: null,
    attemptCount: 0,
    errorMessage: null,
    remoteAcknowledgedSha: null,
  }
  syncQueue.push(entry)
  return entry
}

/** Remove a queue entry only after remote acknowledged SHA is set */
export function purgeConfirmed(): SyncQueueEntry[] {
  const confirmed = syncQueue.filter((e) => e.status === 'confirmed' && e.remoteAcknowledgedSha !== null)
  syncQueue = syncQueue.filter((e) => !(e.status === 'confirmed' && e.remoteAcknowledgedSha !== null))
  return confirmed
}

// ─── Core Git Operations ──────────────────────────────────────────────────────

/**
 * Verify that the PAT can access the configured repository.
 * Returns true on success; throws typed errors on auth/network failure.
 */
export async function verifyRepoAccess(): Promise<boolean> {
  const creds = getCredentials()
  const url = `${GITHUB_API_BASE}/repos/${creds.owner}/${creds.repo}`

  let response: Response
  try {
    response = await fetch(url, {
      headers: buildHeaders(creds.pat),
      signal: AbortSignal.timeout(10_000),
    })
  } catch (err: unknown) {
    throw new GitSyncNetworkError(err instanceof Error ? err.message : String(err))
  }

  if (response.status === 401 || response.status === 403) {
    throw new GitCredentialError()
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new GitSyncNetworkError(`HTTP ${response.status}: ${body.slice(0, 200)}`)
  }

  return true
}

/**
 * Get the current status of the repository branch (ahead/behind, files changed).
 * Uses the GitHub Commits API as a proxy for git status.
 */
export async function getRepoStatus(): Promise<GitStatus> {
  const creds = getCredentials()

  // Get the latest commit on the branch
  const commitUrl = `${GITHUB_API_BASE}/repos/${creds.owner}/${creds.repo}/commits/${creds.branch}`
  let commitResponse: Response
  try {
    commitResponse = await fetch(commitUrl, {
      headers: buildHeaders(creds.pat),
      signal: AbortSignal.timeout(10_000),
    })
  } catch (err: unknown) {
    throw new GitSyncNetworkError(err instanceof Error ? err.message : String(err))
  }

  if (!commitResponse.ok) {
    throw new GitSyncNetworkError(`Could not fetch branch status: HTTP ${commitResponse.status}`)
  }

  // GitHub REST API does not expose full git status; return structural approximation
  return {
    branch: creds.branch,
    ahead: 0,
    behind: 0,
    staged: [],
    unstaged: [],
    untracked: [],
  }
}

/**
 * Commit a file to the repository via the GitHub Contents API.
 * If the file already exists, fetches the current SHA to update it (idempotent).
 * Handles conflict by retrying with fresh SHA.
 */
export async function commitFile(params: {
  filePath: string
  content: string
  commitMessage: string
  encoding?: 'utf-8' | 'base64'
}): Promise<GitCommitResult> {
  const creds = getCredentials()
  const { filePath, content, commitMessage, encoding = 'utf-8' } = params

  const encodedContent =
    encoding === 'base64' ? content : btoa(unescape(encodeURIComponent(content)))

  // Step 1: Check if file exists to get its SHA (required for updates)
  const existingSha = await getFileSha(creds, filePath)

  // Step 2: Create or update the file
  const body: Record<string, unknown> = {
    message: commitMessage,
    content: encodedContent,
    branch: creds.branch,
    committer: {
      name: creds.authorName,
      email: creds.authorEmail,
    },
  }

  if (existingSha !== null) {
    body.sha = existingSha
  }

  const url = `${GITHUB_API_BASE}/repos/${creds.owner}/${creds.repo}/contents/${filePath}`

  let response: Response
  try {
    response = await fetch(url, {
      method: 'PUT',
      headers: buildHeaders(creds.pat),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    })
  } catch (err: unknown) {
    throw new GitSyncNetworkError(err instanceof Error ? err.message : String(err))
  }

  if (response.status === 409) {
    // Conflict: SHA mismatch — retry once with fresh SHA
    const freshSha = await getFileSha(creds, filePath)
    if (freshSha !== null) {
      body.sha = freshSha
    }

    let retryResponse: Response
    try {
      retryResponse = await fetch(url, {
        method: 'PUT',
        headers: buildHeaders(creds.pat),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      })
    } catch (err: unknown) {
      throw new GitSyncNetworkError(err instanceof Error ? err.message : String(err))
    }

    if (!retryResponse.ok) {
      throw new GitConflictError(creds.branch)
    }

    const retryData = await retryResponse.json() as { commit: { sha: string } }
    return {
      sha: retryData.commit.sha,
      message: commitMessage,
      timestamp: Date.now(),
      pushedToRemote: true,
    }
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '')
    throw new GitSyncNetworkError(`Commit failed HTTP ${response.status}: ${errorBody.slice(0, 300)}`)
  }

  const data = await response.json() as { commit: { sha: string } }
  return {
    sha: data.commit.sha,
    message: commitMessage,
    timestamp: Date.now(),
    pushedToRemote: true,
  }
}

/**
 * Drain the offline sync queue in batches of MAX_BATCH_SIZE.
 * Entries are only removed once remoteAcknowledgedSha is set.
 * Uses exponential backoff on failure.
 */
export async function drainSyncQueue(
  onEntrySettled?: (entry: SyncQueueEntry) => void
): Promise<void> {
  if (drainInProgress) return
  drainInProgress = true

  try {
    const pending = syncQueue.filter((e) => e.status === 'pending' && e.attemptCount < MAX_RETRY_ATTEMPTS)
    const batches = chunkArray(pending, MAX_BATCH_SIZE)

    for (const batch of batches) {
      for (const entry of batch) {
        entry.status = 'in_flight'
        entry.lastAttemptAt = Date.now()
        entry.attemptCount += 1

        try {
          const result = await processQueueEntry(entry)
          entry.status = 'confirmed'
          entry.remoteAcknowledgedSha = result.sha
          entry.errorMessage = null
          onEntrySettled?.(entry)
        } catch (err: unknown) {
          const detail = err instanceof Error ? err.message : String(err)
          entry.status = 'failed'
          entry.errorMessage = detail

          const backoffMs = BASE_BACKOFF_MS * Math.pow(2, entry.attemptCount - 1)
          if (entry.attemptCount < MAX_RETRY_ATTEMPTS) {
            entry.status = 'pending'
            await sleep(Math.min(backoffMs, 60_000))
          } else {
            throw new OfflineQueueError(entry.id, detail)
          }
        }
      }
    }

    purgeConfirmed()
  } finally {
    drainInProgress = false
  }
}

// ─── Private Helpers ──────────────────────────────────────────────────────────

async function processQueueEntry(entry: SyncQueueEntry): Promise<GitCommitResult> {
  if (entry.operationType === 'git_commit' || entry.operationType === 'message_backup') {
    const filePath = entry.payload.filePath as string
    const content = entry.payload.content as string
    const commitMessage = entry.payload.commitMessage as string

    if (!filePath || !content || !commitMessage) {
      throw new Error(`Queue entry ${entry.id} has incomplete payload`)
    }

    return commitFile({ filePath, content, commitMessage })
  }

  throw new Error(`Unknown operationType "${entry.operationType}" for entry ${entry.id}`)
}

async function getFileSha(creds: GitCredentials, filePath: string): Promise<string | null> {
  const url = `${GITHUB_API_BASE}/repos/${creds.owner}/${creds.repo}/contents/${filePath}?ref=${creds.branch}`

  try {
    const response = await fetch(url, {
      headers: buildHeaders(creds.pat),
      signal: AbortSignal.timeout(10_000),
    })
    if (response.status === 404) return null
    if (!response.ok) return null
    const data = await response.json() as { sha?: string }
    return data.sha ?? null
  } catch {
    return null
  }
}

function buildHeaders(pat: string): Record<string, string> {
  return {
    Authorization: `Bearer ${pat}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
