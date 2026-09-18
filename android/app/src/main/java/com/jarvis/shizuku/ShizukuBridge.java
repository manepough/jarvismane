package com.jarvis.shizuku;

import android.os.Handler;
import android.os.HandlerThread;
import android.os.RemoteException;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import java.util.regex.Pattern;

import rikka.shizuku.Shizuku;

/**
 * ShizukuBridge.java
 *
 * Provides ADB-level shell command execution via the Shizuku API.
 * All IPC runs on a dedicated background HandlerThread — never the main thread.
 * Every command input is sanitised via an argument array (no string interpolation).
 * Explicit timeouts prevent deadlock if the Shizuku daemon drops.
 */
public final class ShizukuBridge {

    private static final String TAG = "ShizukuBridge";
    private static final long   COMMAND_TIMEOUT_MS = 15_000L;
    private static final int    MAX_ARG_LENGTH     = 4096;
    private static final int    MAX_ARG_COUNT      = 64;

    private static final Pattern DANGEROUS_CHARS =
            Pattern.compile("[;&|`$<>\\\\(){}\n\r]");

    // ── Background IPC thread ─────────────────────────────────────────────────

    private static final HandlerThread IPC_THREAD;
    private static final Handler       IPC_HANDLER;

    static {
        IPC_THREAD = new HandlerThread(
                "ShizukuIPCThread",
                android.os.Process.THREAD_PRIORITY_BACKGROUND
        );
        IPC_THREAD.start();
        IPC_HANDLER = new Handler(IPC_THREAD.getLooper());
    }

    // ── Service state ─────────────────────────────────────────────────────────

    private static volatile boolean serviceConnected = false;

    private static final Shizuku.OnBinderReceivedListener BINDER_RECEIVED = () -> {
        Log.i(TAG, "Shizuku binder received");
        serviceConnected = true;
    };

    private static final Shizuku.OnBinderDeadListener BINDER_DEAD = () -> {
        Log.w(TAG, "Shizuku binder died");
        serviceConnected = false;
    };

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    public static void registerListeners() {
        Shizuku.addBinderReceivedListenerSticky(BINDER_RECEIVED);
        Shizuku.addBinderDeadListener(BINDER_DEAD);
    }

    public static void unregisterListeners() {
        Shizuku.removeBinderReceivedListener(BINDER_RECEIVED);
        Shizuku.removeBinderDeadListener(BINDER_DEAD);
    }

    // ── Permission ────────────────────────────────────────────────────────────

    public static boolean hasPermission() {
        if (!serviceConnected) return false;
        try {
            return Shizuku.checkSelfPermission()
                    == android.content.pm.PackageManager.PERMISSION_GRANTED;
        } catch (IllegalStateException e) {
            Log.w(TAG, "Permission check failed: " + e.getMessage());
            return false;
        }
    }

    public static void requestPermission(
            int requestCode,
            @NonNull Shizuku.OnRequestPermissionResultListener listener
    ) {
        Shizuku.addRequestPermissionResultListener(listener);
        Shizuku.requestPermission(requestCode);
    }

    // ── Blocking command execution ────────────────────────────────────────────

    /**
     * Execute a shell command via Shizuku and block until completion or timeout.
     * Safe to call from any thread except the main thread.
     */
    public static CommandResult executeCommandBlocking(@NonNull String[] args)
            throws ShizukuPermissionException,
                   ShizukuTimeoutException,
                   ShizukuBinderException {

        if (!hasPermission()) throw new ShizukuPermissionException();
        validateArgs(args);

        final CountDownLatch latch = new CountDownLatch(1);
        final AtomicReference<CommandResult> resultRef  = new AtomicReference<>();
        final AtomicReference<Exception>     errorRef   = new AtomicReference<>();

        IPC_HANDLER.post(() -> runOnIPCThread(args, new CommandCallback() {
            @Override public void onSuccess(@NonNull CommandResult r) {
                resultRef.set(r);
                latch.countDown();
            }
            @Override public void onError(@NonNull Exception e) {
                errorRef.set(e);
                latch.countDown();
            }
        }));

        try {
            boolean done = latch.await(COMMAND_TIMEOUT_MS + 2_000L, TimeUnit.MILLISECONDS);
            if (!done) throw new ShizukuTimeoutException(args[0], COMMAND_TIMEOUT_MS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ShizukuBinderException("Interrupted waiting for result");
        }

        final Exception err = errorRef.get();
        if (err instanceof ShizukuPermissionException) throw (ShizukuPermissionException) err;
        if (err instanceof ShizukuTimeoutException)    throw (ShizukuTimeoutException) err;
        if (err instanceof ShizukuBinderException)     throw (ShizukuBinderException) err;
        if (err != null) throw new ShizukuBinderException(err.getMessage());

        return resultRef.get();
    }

    // ── Async command execution ───────────────────────────────────────────────

    public static void executeCommand(
            @NonNull String[] args,
            @NonNull CommandCallback callback
    ) throws ShizukuPermissionException {
        if (!hasPermission()) throw new ShizukuPermissionException();
        validateArgs(args);
        IPC_HANDLER.post(() -> runOnIPCThread(args, callback));
    }

    // ── Private IPC execution ─────────────────────────────────────────────────

    private static void runOnIPCThread(
            @NonNull String[] args,
            @NonNull CommandCallback callback
    ) {
        final long startMs = System.currentTimeMillis();
        Process process = null;
        InputStream stdout = null;
        InputStream stderr = null;

        try {
            // Execute the command. When Shizuku has granted ADB-level permission,
            // processes spawned here run with the elevated shell identity.
            
            final ProcessBuilder pb = new ProcessBuilder(args);
            pb.redirectErrorStream(false);
            process = pb.start();

            stdout = process.getInputStream();
            stderr = process.getErrorStream();

            final String outStr = readStream(stdout);
            final String errStr = readStream(stderr);

            // Wait with timeout
            final Process      fp       = process;
            final AtomicBoolean timeout = new AtomicBoolean(false);
            final Thread waitThread = new Thread(() -> {
                try { fp.waitFor(); }
                catch (InterruptedException e) { Thread.currentThread().interrupt(); }
            });
            waitThread.start();
            waitThread.join(COMMAND_TIMEOUT_MS);

            if (waitThread.isAlive()) {
                timeout.set(true);
                waitThread.interrupt();
                fp.destroy();
            }

            if (timeout.get()) {
                callback.onError(new ShizukuTimeoutException(args[0], COMMAND_TIMEOUT_MS));
                return;
            }

            final int exitCode;
            try { exitCode = process.exitValue(); }
            catch (IllegalThreadStateException e) {
                callback.onError(new ShizukuBinderException("Process did not terminate"));
                return;
            }

            callback.onSuccess(new CommandResult(
                    exitCode, outStr, errStr,
                    System.currentTimeMillis() - startMs
            ));

        } catch (RemoteException e) {
            serviceConnected = false;
            callback.onError(new ShizukuBinderException("Binder error: " + e.getMessage()));
        } catch (IOException e) {
            callback.onError(new ShizukuBinderException("I/O error: " + e.getMessage()));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            callback.onError(new ShizukuBinderException("IPC thread interrupted"));
        } finally {
            closeQuietly(stdout);
            closeQuietly(stderr);
            if (process != null) {
                try { process.destroy(); } catch (Exception ignored) {}
            }
        }
    }

    // ── Input validation ──────────────────────────────────────────────────────

    private static void validateArgs(@NonNull String[] args) {
        if (args.length == 0)
            throw new IllegalArgumentException("args must not be empty");
        if (args.length > MAX_ARG_COUNT)
            throw new IllegalArgumentException("Too many args: " + args.length);
        for (int i = 0; i < args.length; i++) {
            if (args[i] == null)
                throw new IllegalArgumentException("Null arg at index " + i);
            if (args[i].length() > MAX_ARG_LENGTH)
                throw new IllegalArgumentException("Arg too long at index " + i);
            if (DANGEROUS_CHARS.matcher(args[i]).find())
                throw new IllegalArgumentException(
                        "Arg at index " + i + " contains shell metacharacters");
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    @NonNull
    private static String readStream(@NonNull InputStream stream) throws IOException {
        final StringBuilder sb = new StringBuilder();
        final BufferedReader r  = new BufferedReader(
                new InputStreamReader(stream, StandardCharsets.UTF_8));
        String line;
        while ((line = r.readLine()) != null) {
            sb.append(line).append('\n');
        }
        return sb.toString().trim();
    }

    private static void closeQuietly(@Nullable java.io.Closeable c) {
        if (c != null) try { c.close(); } catch (IOException ignored) {}
    }

    // ── Result / Callback types ───────────────────────────────────────────────

    public static final class CommandResult {
        public final int    exitCode;
        @NonNull public final String stdout;
        @NonNull public final String stderr;
        public final long   durationMs;

        CommandResult(int exitCode, @NonNull String stdout,
                      @NonNull String stderr, long durationMs) {
            this.exitCode   = exitCode;
            this.stdout     = stdout;
            this.stderr     = stderr;
            this.durationMs = durationMs;
        }
    }

    public interface CommandCallback {
        void onSuccess(@NonNull CommandResult result);
        void onError(@NonNull Exception error);
    }

    // ── Typed exceptions ──────────────────────────────────────────────────────

    public static final class ShizukuPermissionException extends Exception {
        public ShizukuPermissionException() {
            super("Shizuku permission not granted. Open Shizuku app and grant permission.");
        }
    }

    public static final class ShizukuBinderException extends Exception {
        public ShizukuBinderException(String detail) {
            super("Shizuku binder error: " + detail);
        }
    }

    public static final class ShizukuTimeoutException extends Exception {
        public final String commandPreview;
        public final long   timeoutMs;
        public ShizukuTimeoutException(String commandPreview, long timeoutMs) {
            super("Shizuku timed out after " + timeoutMs + "ms: \"" + commandPreview + "\"");
            this.commandPreview = commandPreview;
            this.timeoutMs      = timeoutMs;
        }
    }
}
