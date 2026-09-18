# React Native
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }
-dontwarn com.facebook.react.**
-dontwarn com.facebook.hermes.**

# Shizuku
-keep class rikka.shizuku.** { *; }
-keep class moe.shizuku.** { *; }
-dontwarn rikka.shizuku.**

# Jarvis application classes
-keep class com.jarvis.** { *; }
-keep class com.jarvis.shizuku.** { *; }

# Keep BuildConfig
-keep class com.jarvis.BuildConfig { *; }

# AndroidX
-keep class androidx.** { *; }
-dontwarn androidx.**

# Kotlin
-keep class kotlin.** { *; }
-dontwarn kotlin.**
-keepattributes *Annotation*
-keepattributes Signature
-keepattributes Exceptions
