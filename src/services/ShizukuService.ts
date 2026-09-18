/**
 * src/services/ShizukuService.ts
 * TypeScript wrapper over the native ShizukuModule.
 * Used in the web/Next.js layer as a no-op stub;
 * actual execution happens when bundled into the React Native Android app.
 *
 * In the RN context, NativeModules.ShizukuModule is the Java bridge.
 * In the Next.js web context, all methods return typed stubs explaining the limitation.
 */

import type { ShizukuCommandResult } from '@/types'
import {
  ShizukuPermissionError,
  ShizukuBinderError,
  ShizukuTimeoutError,
} from '@/types'

// ─── Environment detection ────────────────────────────────────────────────────

function isReactNative(): boolean {
  return typeof navigator !== 'undefined' && navigator.product === 'ReactNative'
}

function getNativeModule(): null | {
  hasPermission: () => boolean
  execute: (args: string[]) => Promise<{
    exitCode: number
    stdout: string
    stderr: string
    durationMs: number
  }>
  registerListeners: () => void
  unregisterListeners: () => void
} {
  if (!isReactNative()) return null
  try {
    // Dynamic require only runs in RN bundle; tree-shaken in Next.js
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NativeModules } = require('react-native') as {
      NativeModules: Record<string, unknown>
    }
    const mod = NativeModules['ShizukuModule']
    if (mod === undefined || mod === null) return null
    return mod as ReturnType<typeof getNativeModule>
  } catch {
    return null
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Register Shizuku binder lifecycle listeners.
 * No-op in web context.
 */
export function registerShizukuListeners(): void {
  getNativeModule()?.registerListeners()
}

/**
 * Unregister Shizuku binder lifecycle listeners.
 * No-op in web context.
 */
export function unregisterShizukuListeners(): void {
  getNativeModule()?.unregisterListeners()
}

/**
 * Synchronous permission check.
 * Always returns false in web context.
 */
export function hasShizukuPermission(): boolean {
  const mod = getNativeModule()
  if (mod === null) return false
  return mod.hasPermission()
}

/**
 * Execute a shell command via Shizuku.
 * Throws typed errors — never returns undefined.
 *
 * Permission is checked before dispatch; throws ShizukuPermissionError immediately
 * if not granted rather than waiting for the binder round-trip.
 *
 * @param args  Sanitized argument array. args[0] = binary path.
 *              No string interpolation. Each element validated in Java layer.
 *
 * @example
 *   await executeShizukuCommand(['wm', 'size', '1080x1920'])
 *   await executeShizukuCommand(['am', 'start', '-n', 'com.android.settings/.Settings'])
 *   await executeShizukuCommand(['settings', 'put', 'global', 'airplane_mode_on', '1'])
 */
export async function executeShizukuCommand(args: string[]): Promise<ShizukuCommandResult> {
  if (args.length === 0) {
    throw new ShizukuBinderError('args array must not be empty')
  }

  const mod = getNativeModule()
  if (mod === null) {
    throw new ShizukuBinderError(
      'ShizukuModule is not available. This feature requires the Android app build with Shizuku.'
    )
  }

  if (!mod.hasPermission()) {
    throw new ShizukuPermissionError()
  }

  let result: { exitCode: number; stdout: string; stderr: string; durationMs: number }
  try {
    result = await mod.execute(args)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('SHIZUKU_PERMISSION')) throw new ShizukuPermissionError()
    if (msg.includes('SHIZUKU_TIMEOUT')) {
      throw new ShizukuTimeoutError(args[0] ?? '', 15_000)
    }
    throw new ShizukuBinderError(msg)
  }

  return {
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    durationMs: result.durationMs,
  }
}

// ─── Common command helpers ───────────────────────────────────────────────────

/** Set screen brightness (0–255) via Android settings. */
export async function setScreenBrightness(value: number): Promise<ShizukuCommandResult> {
  const clamped = Math.max(0, Math.min(255, Math.round(value)))
  return executeShizukuCommand([
    'settings',
    'put',
    'system',
    'screen_brightness',
    String(clamped),
  ])
}

/** Toggle airplane mode. Requires Android 11+ and ADB permission. */
export async function setAirplaneMode(enabled: boolean): Promise<ShizukuCommandResult> {
  return executeShizukuCommand([
    'settings',
    'put',
    'global',
    'airplane_mode_on',
    enabled ? '1' : '0',
  ])
}

/** Launch an Android activity by explicit component name. */
export async function startActivity(componentName: string): Promise<ShizukuCommandResult> {
  // componentName must be in format "com.package/.ActivityClass"
  // Validate format before sending to shell
  const COMPONENT_PATTERN = /^[a-zA-Z0-9_.]+\/\.[a-zA-Z0-9_.]+$/
  if (!COMPONENT_PATTERN.test(componentName)) {
    throw new ShizukuBinderError(
      `Invalid component name format: "${componentName}". Expected "com.package/.ActivityClass"`
    )
  }
  return executeShizukuCommand(['am', 'start', '-n', componentName])
}

/** Force-stop a package. */
export async function forceStopPackage(packageName: string): Promise<ShizukuCommandResult> {
  const PACKAGE_PATTERN = /^[a-zA-Z0-9_.]+$/
  if (!PACKAGE_PATTERN.test(packageName)) {
    throw new ShizukuBinderError(`Invalid package name: "${packageName}"`)
  }
  return executeShizukuCommand(['am', 'force-stop', packageName])
}

/** Set display resolution. widthPx and heightPx must be positive integers. */
export async function setDisplaySize(widthPx: number, heightPx: number): Promise<ShizukuCommandResult> {
  if (!Number.isInteger(widthPx) || !Number.isInteger(heightPx) || widthPx <= 0 || heightPx <= 0) {
    throw new ShizukuBinderError(`Invalid display size: ${widthPx}x${heightPx}`)
  }
  return executeShizukuCommand(['wm', 'size', `${widthPx}x${heightPx}`])
}

/** Reset display resolution to device default. */
export async function resetDisplaySize(): Promise<ShizukuCommandResult> {
  return executeShizukuCommand(['wm', 'size', 'reset'])
}
