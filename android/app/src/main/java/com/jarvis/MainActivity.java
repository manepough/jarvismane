package com.jarvis;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;

import com.jarvis.shizuku.ShizukuBridge;

/**
 * MainActivity — hosts the Jarvis Next.js web app inside a WebView.
 *
 * In production the WebView loads the bundled Next.js static export from assets.
 * In development it points to the local Next.js dev server.
 *
 * JS <-> Native bridge:
 *   window.JarvisBridge.executeShizukuCommand(argsJson) → JSON result string
 *   window.JarvisBridge.hasShizukuPermission()          → "true"/"false"
 */
public class MainActivity extends AppCompatActivity {

    private static final String PROD_URL = "file:///android_asset/web/index.html";
    private static final String DEV_URL  = "http://10.0.2.2:3000";

    private WebView webView;
    private ValueCallback<Uri[]> fileChooserCallback;

    private final ActivityResultLauncher<String[]> filePickerLauncher =
        registerForActivityResult(
            new ActivityResultContracts.OpenMultipleDocuments(),
            uris -> {
                if (fileChooserCallback == null) return;
                if (uris == null || uris.isEmpty()) {
                    fileChooserCallback.onReceiveValue(null);
                } else {
                    fileChooserCallback.onReceiveValue(uris.toArray(new Uri[0]));
                }
                fileChooserCallback = null;
            }
        );

    @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webview);
        configureWebView();
        registerBackHandler();

        final String loadUrl = BuildConfig.DEBUG ? DEV_URL : PROD_URL;
        webView.loadUrl(loadUrl);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        final WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " JarvisAndroid/1.0");

        webView.addJavascriptInterface(new JarvisBridge(), "JarvisBridge");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(
                    @NonNull WebView view,
                    @NonNull WebResourceRequest request
            ) {
                final String url = request.getUrl().toString();
                // Open external URLs in system browser
                if (!url.startsWith("file://") && !url.startsWith("http://10.0.2.2")) {
                    final Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    startActivity(intent);
                    return true;
                }
                return false;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(@NonNull PermissionRequest request) {
                // Grant microphone access for voice input
                request.grant(request.getResources());
            }

            @Override
            public boolean onShowFileChooser(
                    WebView webView,
                    ValueCallback<Uri[]> filePathCallback,
                    FileChooserParams fileChooserParams
            ) {
                if (fileChooserCallback != null) {
                    fileChooserCallback.onReceiveValue(null);
                }
                fileChooserCallback = filePathCallback;
                filePickerLauncher.launch(new String[]{"*/*"});
                return true;
            }
        });
    }

    private void registerBackHandler() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView != null && webView.canGoBack()) {
                    webView.goBack();
                } else {
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                }
            }
        });
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }

    // ── JS Bridge ─────────────────────────────────────────────────────────────

    private static final class JarvisBridge {

        @JavascriptInterface
        @NonNull
        public String hasShizukuPermission() {
            return String.valueOf(ShizukuBridge.hasPermission());
        }

        /**
         * Execute a Shizuku shell command from JavaScript.
         *
         * @param argsJson JSON array string e.g. '["am","start","-n","com.pkg/.Activity"]'
         * @return JSON result string: {"exitCode":0,"stdout":"...","stderr":"...","durationMs":42}
         *         or error JSON: {"error":"SHIZUKU_PERMISSION","message":"..."}
         */
        @JavascriptInterface
        @NonNull
        public String executeShizukuCommand(@NonNull String argsJson) {
            try {
                // Parse JSON array manually to avoid adding a JSON dependency
                final String[] args = parseJsonStringArray(argsJson);
                if (args.length == 0) {
                    return errorJson("INVALID_ARGS", "args array is empty");
                }

                final ShizukuBridge.CommandResult result =
                        ShizukuBridge.executeCommandBlocking(args);

                return "{"
                        + "\"exitCode\":" + result.exitCode + ","
                        + "\"stdout\":" + jsonString(result.stdout) + ","
                        + "\"stderr\":" + jsonString(result.stderr) + ","
                        + "\"durationMs\":" + result.durationMs
                        + "}";

            } catch (ShizukuBridge.ShizukuPermissionException e) {
                return errorJson("SHIZUKU_PERMISSION", e.getMessage());
            } catch (ShizukuBridge.ShizukuTimeoutException e) {
                return errorJson("SHIZUKU_TIMEOUT", e.getMessage());
            } catch (ShizukuBridge.ShizukuBinderException e) {
                return errorJson("SHIZUKU_BINDER", e.getMessage());
            } catch (Exception e) {
                return errorJson("UNKNOWN", e.getMessage() != null ? e.getMessage() : "unknown error");
            }
        }

        @NonNull
        private static String[] parseJsonStringArray(@NonNull String json) {
            final String trimmed = json.trim();
            if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
                throw new IllegalArgumentException("Expected JSON array");
            }
            final String inner = trimmed.substring(1, trimmed.length() - 1).trim();
            if (inner.isEmpty()) return new String[0];

            final String[] parts = inner.split(",(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)");
            final String[] result = new String[parts.length];
            for (int i = 0; i < parts.length; i++) {
                String part = parts[i].trim();
                if (part.startsWith("\"") && part.endsWith("\"")) {
                    part = part.substring(1, part.length() - 1);
                }
                result[i] = part.replace("\\\"", "\"").replace("\\\\", "\\");
            }
            return result;
        }

        @NonNull
        private static String errorJson(@NonNull String code, @NonNull String message) {
            return "{\"error\":" + jsonString(code) + ",\"message\":" + jsonString(message) + "}";
        }

        @NonNull
        private static String jsonString(@NonNull String value) {
            return "\"" + value
                    .replace("\\", "\\\\")
                    .replace("\"", "\\\"")
                    .replace("\n", "\\n")
                    .replace("\r", "\\r")
                    .replace("\t", "\\t")
                    + "\"";
        }
    }
}
