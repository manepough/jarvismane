package com.jarvis.shizuku;

/**
 * ShizukuPackage.java
 *
 * Plain Android registry class — no React Native dependency.
 * Provides a single entry point to initialise the Shizuku subsystem.
 * Called from MainApplication.onCreate via ShizukuModule.registerListeners().
 */
public final class ShizukuPackage {

    private ShizukuPackage() {}

    /**
     * Initialise the Shizuku subsystem.
     * Registers binder lifecycle listeners so the app knows when
     * the Shizuku daemon connects or dies.
     *
     * Must be called once from Application.onCreate before any
     * ShizukuBridge method is invoked.
     */
    public static void init() {
        ShizukuBridge.registerListeners();
    }

    /**
     * Tear down the Shizuku subsystem.
     * Must be called from Application.onTerminate.
     */
    public static void destroy() {
        ShizukuBridge.unregisterListeners();
    }
}
