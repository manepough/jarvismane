// android/app/src/main/java/com/jarvis/shizuku/ShizukuModule.java
/**
 * ShizukuModule.java
 *
 * React Native NativeModule that exposes ShizukuBridge to the JavaScript layer.
 * Methods available in JS:
 *   - NativeModules.ShizukuModule.hasPermission() → boolean (sync)
 *   - NativeModules.ShizukuModule.execute(args: string[]) → Promise<CommandResult>
 *   - NativeModules.ShizukuModule.registerListeners()
 *   - NativeModules.ShizukuModule.unregisterListeners()
 *
 * All async execution dispatches to ShizukuBridge which runs on its own
 * background HandlerThread. This module never blocks the React thread.
 */

package com.jarvis.shizuku;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.WritableMap;

public final class ShizukuModule extends ReactContextBaseJavaModule {

    private static final String MODULE_NAME = "ShizukuModule";

    public ShizukuModule(@NonNull ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @NonNull
    @Override
    public String getName() {
        return MODULE_NAME;
    }

    /**
     * Register Shizuku binder lifecycle listeners.
     * Call once from the app's root component useEffect.
     */
    @ReactMethod
    public void registerListeners() {
        ShizukuBridge.registerListeners();
    }

    /**
     * Unregister Shizuku binder lifecycle listeners.
     * Call on app unmount.
     */
    @ReactMethod
    public void unregisterListeners() {
        ShizukuBridge.unregisterListeners();
    }

    /**
     * Synchronous permission check.
     * Returns true if Shizuku is connected and permission is granted.
     * Safe to call from JS without a promise.
     */
    @ReactMethod(isBlockingSynchronousMethod = true)
    public boolean hasPermission() {
        return ShizukuBridge.hasPermission();
    }

    /**
     * Execute a shell command via Shizuku.
     *
     * @param argsArray  JS string array — args[0] is the binary path.
     *                   Each element is individually sanitized in ShizukuBridge.
     * @param promise    Resolves with { exitCode, stdout, stderr, durationMs }
     *                   Rejects with typed error message string.
     *
     * Example from JS:
     *   await NativeModules.ShizukuModule.execute(['am', 'start', '-n', 'com.pkg/.Activity'])
     */
    @ReactMethod
    public void execute(@NonNull ReadableArray argsArray, @NonNull Promise promise) {
        // Convert ReadableArray to String[] before dispatching
        final int size = argsArray.size();
        if (size == 0) {
            promise.reject("SHIZUKU_INVALID_ARGS", "args array must not be empty");
            return;
        }

        final String[] args = new String[size];
        for (int i = 0; i < size; i++) {
            final String arg = argsArray.getString(i);
            if (arg == null) {
                promise.reject("SHIZUKU_INVALID_ARGS", "args[" + i + "] is null");
                return;
            }
            args[i] = arg;
        }

        // Permission pre-check before dispatch (ShizukuBridge also checks,
        // but checking here gives JS an immediate typed rejection)
        if (!ShizukuBridge.hasPermission()) {
            promise.reject(
                "SHIZUKU_PERMISSION",
                "Shizuku permission not granted. Open Shizuku app and grant USER_SERVICE permission."
            );
            return;
        }

        try {
            ShizukuBridge.executeCommand(args, new ShizukuBridge.CommandCallback() {
                @Override
                public void onSuccess(@NonNull ShizukuBridge.CommandResult result) {
                    WritableMap map = Arguments.createMap();
                    map.putInt("exitCode", result.exitCode);
                    map.putString("stdout", result.stdout);
                    map.putString("stderr", result.stderr);
                    map.putDouble("durationMs", (double) result.durationMs);
                    promise.resolve(map);
                }

                @Override
                public void onError(@NonNull Exception error) {
                    final String code;
                    if (error instanceof ShizukuBridge.ShizukuPermissionException) {
                        code = "SHIZUKU_PERMISSION";
                    } else if (error instanceof ShizukuBridge.ShizukuTimeoutException) {
                        code = "SHIZUKU_TIMEOUT";
                    } else {
                        code = "SHIZUKU_BINDER";
                    }
                    promise.reject(code, error.getMessage());
                }
            });
        } catch (ShizukuBridge.ShizukuPermissionException e) {
            promise.reject("SHIZUKU_PERMISSION", e.getMessage());
        } catch (IllegalArgumentException e) {
            promise.reject("SHIZUKU_INVALID_ARGS", e.getMessage());
        }
    }
}
