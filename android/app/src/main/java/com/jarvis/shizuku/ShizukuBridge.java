// android/app/src/main/java/com/jarvis/shizuku/ShizukuBridge.java
/**
 * ShizukuBridge.java
 *
 * Native Android bridge for Shizuku API integration.
 * Provides ADB-level shell command execution with:
 *  - Synchronous permission pre-checks before every binder transaction
 *  - Lifecycle listener registration/deregistration tied to Activity lifecycle
 *  - All IPC executed on a dedicated background HandlerThread (never main/UI thread)
 *  - Explicit timeouts with ShizukuTimeoutException on binder deadlock
 *  - Process descriptor and stream cleanup in finally blocks
 *  - Input sanitization via argument arrays (no string interpolation into shell)
 *  - Shizuku.newProcess() API (current; not deprecated Runtime.exec wrapper)
 *
 * React Native bridge exposure is handled by ShizukuModule.java.
 */

package com.jarvis.shizuku;

import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.RemoteException;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import java.util.regex.Pattern;

import rikka.shizuku.Shizuku;
import rikka.shizuku.ShizukuRemoteProcess;

public final class ShizukuBridge {

    private static final String TAG = "ShizukuBridge";

    /** Maximum wall-clock milliseconds allowed for a single shell command. */
    private static final long COMMAND_TIMEOUT_MS = 15_000L;

    /** Maximum individual argument length to prevent injection via oversized tokens. */
    private static final int MAX_ARG_LENGTH = 4096;

    /** Maximum number of arguments per command. */
    private static final int MAX_ARG_COUNT = 64;

    /** Pattern that rejects shell metacharacters in individual argument tokens. */
    private static final Pattern DANGEROUS_CHARS =
            Pattern.compile("[;&|`$<>\\\\(){}\n\r]");

    // ── Background thread for all binder IPC ─────────────────────────────────

    private static final HandlerThread IPC_THREAD;
    private static final Handler IPC_HANDLER;

    static {
        IPC_THREAD = new HandlerThread("ShizukuIPCThread", android.os.Process.THREAD_PRIORITY_BACKGROUND);
        IPC_THREAD.start();
        IPC_HANDLER = new Handler(IPC_THREAD.getLooper());
    }

    // ── Service state ─────────────────────────────────────────────────────────

    private static volatile boolean serviceConnected = false;

    private static final Shizuku.OnBinderReceivedListener BINDER_RECEIVED_LISTENER =
            () -> {
                Log.i(TAG, "Shizuku binder received");
                serviceConnected = true;
            };

    private static final Shizuku.OnBinderDeadListener BINDER_DEAD_LISTENER =
            () -> {
                Log.w(TAG, "Shizuku binder died");
                serviceConnected = false;
            };

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    /**
     * Register Shizuku lifecycle listeners. Call from Activity.onCreate or
     * ReactApplication.onCreate. Idempotent — safe to call multiple times.
     */
    public static void registerListeners() {
        Shizuku.addBinderReceivedListenerSticky(BINDER_RECEIVED_LISTENER);
        Shizuku.addBinderDeadListener(BINDER_DEAD_LISTENER);
    }

    /**
     * Unregister Shizuku lifecycle listeners. Call from Activity.onDestroy.
     */
    public static void unregisterListeners() {
        Shizuku.removeBinderReceivedListener(BINDER_RECEIVED_LISTENER);
        Shizuku.removeBinderDeadListener(BINDER_DEAD_LISTENER);
    }

    // ── Permission ────────────────────────────────────────────────────────────

    /**
     * Returns true if the Shizuku service is connected and USER_SERVICE
     * permission has been granted. Must be called before every executeCommand.
     */
    public static boolean hasPermission() {
        if (!serviceConnected) return false;
        try {
            return Shizuku.checkSelfPermission() == android.content.pm.PackageManager.PERMISSION_GRANTED;
        } catch (IllegalStateException e) {
            Log.w(TAG, "Shizuku not ready for permission check: " + e.getMessage());
            return false;
        }
    }

    /**
     * Request Shizuku USER_SERVICE permission. The result arrives in the
     * provided OnRequestPermissionResultListener. This is non-blocking.
     */
    public static void requestPermission(
            int requestCode,
            @NonNull Shizuku.OnRequestPermissionResultListener listener
    ) {
        Shizuku.addRequestPermissionResultListener(listener);
        Shizuku.requestPermission(requestCode);
    }

    // ── Command Execution ─────────────────────────────────────────────────────

    /**
     * Execute a shell command via Shizuku.newProcess on the background IPC thread.
     *
     * @param args    Argument array. args[0] is the executable path.
     *                Each argument is individually sanitized.
     *                Example: new String[]{"am", "start", "-n", "com.pkg/.Activity"}
     * @param callback Result callback — invoked on the IPC thread, NOT the main thread.
     *                 Callers must marshal to UI thread themselves if needed.
     * @throws ShizukuPermissionException  if permission is not granted (checked before dispatch)
     */
    public static void executeCommand(
            @NonNull final String[] args,
            @NonNull final CommandCallback callback
    ) throws ShizukuPermissionException {

        // Permission check BEFORE posting to IPC thread to give immediate typed failure
        if (!hasPermission()) {
            throw new ShizukuPermissionException();
        }

        validateArgs(args);

        IPC_HANDLER.post(() -> executeOnIPCThread(args, callback));
    }

    /** Blocking variant for use in non-UI coroutines or tests. Blocks the caller's thread. */
    public static CommandResult executeCommandBlocking(@NonNull String[] args)
            throws ShizukuPermissionException, ShizukuTimeoutException, ShizukuBinderException {

        if (!hasPermission()) throw new ShizukuPermissionException();
        validateArgs(args);

        final CountDownLatch latch = new CountDownLatch(1);
        final AtomicReference<CommandResult> resultRef = new AtomicReference<>();
        final AtomicReference<Exception> errorRef = new AtomicReference<>();

        IPC_HANDLER.post(() -> executeOnIPCThread(args, new CommandCallback() {
            @Override
            public void onSuccess(CommandResult result) {
                resultRef.set(result);
                latch.countDown();
            }

            @Override
            public void onError(Exception error) {
                errorRef.set(error);
                latch.countDown();
            }
        }));

        try {
            boolean completed = latch.await(COMMAND_TIMEOUT_MS + 1000L, TimeUnit.MILLISECONDS);
            if (!completed) {
                throw new ShizukuTimeoutException(Arrays.toString(args), COMMAND_TIMEOUT_MS);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ShizukuBinderException("Interrupted while waiting for command result");
        }

        Exception error = errorRef.get();
        if (error instanceof ShizukuTimeoutException) throw (ShizukuTimeoutException) error;
        if (error instanceof ShizukuBinderException) throw (ShizukuBinderException) error;
        if (error != null) throw new ShizukuBinderException(error.getMessage());

        return resultRef.get();
    }

    // ── Private IPC Execution ─────────────────────────────────────────────────

    private static void executeOnIPCThread(
            @NonNull String[] args,
            @NonNull CommandCallback callback
    ) {
        final long startMs = System.currentTimeMillis();
        ShizukuRemoteProcess process = null;
        InputStream stdout = null;
        InputStream stderr = null;

        try {
            // Create the process via Shizuku.newProcess (non-deprecated API)
            process = Shizuku.newProcess(args, null, null);

            stdout = process.getInputStream();
            stderr = process.getErrorStream();

            // Read stdout on current (IPC) thread; stderr after
            final String stdoutContent = readStream(stdout);
            final String stderrContent = readStream(stderr);

            // Wait for process exit with timeout
            final ShizukuRemoteProcess finalProcess = process;
            final AtomicBoolean timedOut = new AtomicBoolean(false);
            final Thread waitThread = new Thread(() -> {
                try {
                    finalProcess.waitFor();
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            });
            waitThread.start();
            waitThread.join(COMMAND_TIMEOUT_MS);

            if (waitThread.isAlive()) {
                timedOut.set(true);
                waitThread.interrupt();
                try {
                    finalProcess.destroy();
                } catch (Exception ignored) { }
            }

            if (timedOut.get()) {
                callback.onError(new ShizukuTimeoutException(args[0], COMMAND_TIMEOUT_MS));
                return;
            }

            final int exitCode;
            try {
                exitCode = process.exitValue();
            } catch (IllegalThreadStateException e) {
                callback.onError(new ShizukuBinderException("Process did not terminate: " + e.getMessage()));
                return;
            }

            final long durationMs = System.currentTimeMillis() - startMs;
            callback.onSuccess(new CommandResult(exitCode, stdoutContent, stderrContent, durationMs));

        } catch (RemoteException e) {
            serviceConnected = false;
            callback.onError(new ShizukuBinderException("Binder transaction failed: " + e.getMessage()));
        } catch (IOException e) {
            callback.onError(new ShizukuBinderException("Stream I/O error: " + e.getMessage()));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            callback.onError(new ShizukuBinderException("IPC thread interrupted"));
        } finally {
            // Explicit resource cleanup regardless of success/failure
            closeQuietly(stdout);
            closeQuietly(stderr);
            if (process != null) {
                try {
                    process.destroy();
                } catch (Exception ignored) { }
            }
        }
    }

    // ── Input Validation ──────────────────────────────────────────────────────

    private static void validateArgs(@NonNull String[] args) {
        if (args.length == 0) {
            throw new IllegalArgumentException("Command args array must not be empty");
        }
        if (args.length > MAX_ARG_COUNT) {
            throw new IllegalArgumentException(
                    "Too many arguments: " + args.length + " > " + MAX_ARG_COUNT);
        }
        for (int i = 0; i < args.length; i++) {
            if (args[i] == null) {
                throw new IllegalArgumentException("Null argument at index " + i);
            }
            if (args[i].length() > MAX_ARG_LENGTH) {
                throw new IllegalArgumentException(
                        "Argument at index " + i + " exceeds max length " + MAX_ARG_LENGTH);
            }
            if (DANGEROUS_CHARS.matcher(args[i]).find()) {
                throw new IllegalArgumentException(
                        "Argument at index " + i + " contains disallowed shell metacharacters");
            }
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    @NonNull
    private static String readStream(@NonNull InputStream stream) throws IOException {
        final StringBuilder sb = new StringBuilder();
        final BufferedReader reader = new BufferedReader(
                new InputStreamReader(stream, StandardCharsets.UTF_8));
        String line;
        while ((line = reader.readLine()) != null) {
            sb.append(line).append('\n');
        }
        return sb.toString().trim();
    }

    private static void closeQuietly(@Nullable java.io.Closeable c) {
        if (c != null) {
            try {
                c.close();
            } catch (IOException ignored) { }
        }
    }

    // ── Result / Callback Types ───────────────────────────────────────────────

    public static final class CommandResult {
        public final int exitCode;
        @NonNull public final String stdout;
        @NonNull public final String stderr;
        public final long durationMs;

        CommandResult(int exitCode, @NonNull String stdout, @NonNull String stderr, long durationMs) {
            this.exitCode = exitCode;
            this.stdout = stdout;
            this.stderr = stderr;
            this.durationMs = durationMs;
        }
    }

    public interface CommandCallback {
        void onSuccess(@NonNull CommandResult result);
        void onError(@NonNull Exception error);
    }

    // ── Typed Exceptions ──────────────────────────────────────────────────────

    public static final class ShizukuPermissionException extends Exception {
        public ShizukuPermissionException() {
            super("Shizuku USER_SERVICE permission not granted. Open the Shizuku app and grant permission.");
        }
    }

    public static final class ShizukuBinderException extends Exception {
        public ShizukuBinderException(String detail) {
            super("Shizuku binder error: " + detail);
        }
    }

    public static final class ShizukuTimeoutException extends Exception {
        public final String commandPreview;
        public final long timeoutMs;

        public ShizukuTimeoutException(String commandPreview, long timeoutMs) {
            super("Shizuku command timed out after " + timeoutMs + "ms: \"" + commandPreview + "\"");
            this.commandPreview = commandPreview;
            this.timeoutMs = timeoutMs;
        }
    }
}
