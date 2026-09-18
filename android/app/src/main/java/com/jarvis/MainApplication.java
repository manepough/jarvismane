package com.jarvis;

import android.app.Application;

import com.jarvis.shizuku.ShizukuPackage;

public class MainApplication extends Application {

    @Override
    public void onCreate() {
        super.onCreate();
        ShizukuPackage.init();
    }

    @Override
    public void onTerminate() {
        ShizukuPackage.destroy();
        super.onTerminate();
    }
}
