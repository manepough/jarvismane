// android/app/src/main/java/com/jarvis/shizuku/ShizukuPackage.java
/**
 * ShizukuPackage.java
 * Registers ShizukuModule with the React Native module registry.
 * Add to MainApplication.java's getPackages() list.
 */

package com.jarvis.shizuku;

import androidx.annotation.NonNull;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;

import java.util.Collections;
import java.util.List;

public final class ShizukuPackage implements ReactPackage {

    @NonNull
    @Override
    public List<NativeModule> createNativeModules(@NonNull ReactApplicationContext reactContext) {
        return Collections.singletonList(new ShizukuModule(reactContext));
    }

    @NonNull
    @Override
    public List<ViewManager<?, ?>> createViewManagers(@NonNull ReactApplicationContext reactContext) {
        return Collections.emptyList();
    }
}
