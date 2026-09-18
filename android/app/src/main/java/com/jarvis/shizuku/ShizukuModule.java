package com.jarvis.shizuku;

/**
 * ShizukuModule.java
 *
 * Plain Android wrapper that exposes ShizukuBridge operations
 * for use from MainActivity's WebView JavascriptInterface.
 *
 * No React Native dependency. All JS communication goes through
 * MainActivity.JarvisBridge which calls these methods directly.
 */
public final class ShizukuModule {

    private ShizukuModule() {}

    /**
     * Check Shizuku permission synchronously.
     * Called from MainActivity.JarvisBridge.hasShizukuPermission()
     */
    public static boolean hasPermission() {
        return ShizukuBridge.hasPermission();
    }

    /**
     * Execute a shell command via Shizuku synchronously.
     * Called from MainActivity.JarvisBridge.executeShizukuCommand()
     *
     * @param args sanitized argument array; args[0] is the binary path
     * @return CommandResult on success
     * @throws ShizukuBridge.ShizukuPermissionException if permission not granted
     * @throws ShizukuBridge.ShizukuTimeoutException    if command exceeds 15s
     * @throws ShizukuBridge.ShizukuBinderException     on binder failure
     */
    public static ShizukuBridge.CommandResult execute(String[] args)
            throws ShizukuBridge.ShizukuPermissionException,
                   ShizukuBridge.ShizukuTimeoutException,
                   ShizukuBridge.ShizukuBinderException {
        return ShizukuBridge.executeCommandBlocking(args);
    }

    /** Register Shizuku binder lifecycle listeners. Call from Application.onCreate. */
    public static void registerListeners() {
        ShizukuBridge.registerListeners();
    }

    /** Unregister Shizuku binder lifecycle listeners. Call from Application.onTerminate. */
    public static void unregisterListeners() {
        ShizukuBridge.unregisterListeners();
    }
}
