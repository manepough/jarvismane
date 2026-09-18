package com.jarvis;

import android.app.Application;

import com.jarvis.shizuku.ShizukuBridge;

public class MainApplication extends Application {

    @Override
    public void onCreate() {
        super.onCreate();
        ShizukuBridge.registerListeners();
    }

    @Override
    public void onTerminate() {
        super.onTerminate();
        ShizukuBridge.unregisterListeners();
    }
}
