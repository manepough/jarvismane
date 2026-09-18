# Jarvis — Integration Reference

## File Merge Order

Drop these files into your G0DM0D3 project root in this order.
All paths are relative to the project root.

```
src/types/index.ts                  — replace existing types file
src/store/index.ts                  — replace existing store
src/lib/jarvisPrompt.ts             — new file
src/lib/openrouter.ts               — replace existing openrouter.ts
src/services/AttachmentService.ts   — new file
src/services/VoiceService.ts        — new file
src/services/OfflineCommandParser.ts — new file
src/services/GitSyncService.ts      — new file
src/services/ShizukuService.ts      — new file
src/hooks/useVoice.ts               — new file
src/hooks/useNetworkStatus.ts       — new file
src/components/ChatInput.tsx        — replace existing
src/components/ChatMessage.tsx      — replace existing
src/components/ChatArea.tsx         — replace existing
src/components/Sidebar.tsx          — replace existing
src/components/SettingsModal.tsx    — new file
src/components/WelcomeScreen.tsx    — new file
src/app/page.tsx                    — replace existing
src/app/layout.tsx                  — replace existing
src/app/globals.css                 — replace existing
next.config.ts                      — replace existing
tailwind.config.ts                  — replace existing
tsconfig.json                       — replace existing
package.json                        — merge dependencies
.github/workflows/build-app.yml     — new file
android/app/src/main/java/com/jarvis/shizuku/ShizukuBridge.java   — new file
android/app/src/main/java/com/jarvis/shizuku/ShizukuModule.java   — new file
android/app/src/main/java/com/jarvis/shizuku/ShizukuPackage.java  — new file
```

## Install Dependencies

```bash
npm install
```

New packages added vs base G0DM0D3:
- `zustand` — state management
- `react-markdown` — message markdown rendering
- `react-syntax-highlighter` + `@types/react-syntax-highlighter`
- `uuid` + `@types/uuid`
- `rehype-raw`, `remark-gfm`
- `lucide-react`

## Environment Variables

No `.env` file required. All credentials are entered through the Settings
modal at runtime and stored in localStorage. Nothing is hardcoded.

## GitHub Actions Secrets

Set these in your repository under Settings > Secrets > Actions:

| Secret name               | Description                                          |
|---------------------------|------------------------------------------------------|
| `RELEASE_KEYSTORE_BASE64` | `base64 -w 0 release.keystore` output               |
| `KEYSTORE_PASSWORD`       | Keystore password                                    |
| `KEY_ALIAS`               | Key alias inside keystore                            |
| `KEY_PASSWORD`            | Key password                                         |

To generate a keystore for first-time use:
```bash
keytool -genkeypair \
  -v \
  -storetype PKCS12 \
  -keystore release.keystore \
  -alias jarvis-key \
  -keyalg RSA \
  -keysize 4096 \
  -validity 10000
base64 -w 0 release.keystore
```
Copy the base64 output into the `RELEASE_KEYSTORE_BASE64` secret.

## Android — Shizuku Setup

1. Install the Shizuku app on your device.
2. Enable Shizuku via ADB pair or wireless pair.
3. Add to `android/app/build.gradle` dependencies:
   ```groovy
   implementation 'dev.rikka.shizuku:api:13.1.5'
   implementation 'dev.rikka.shizuku:provider:13.1.5'
   ```
4. Add to `android/app/src/main/AndroidManifest.xml`:
   ```xml
   <queries>
     <package android:name="moe.shizuku.privileged.api" />
   </queries>
   ```
5. Register `ShizukuPackage` in `MainApplication.java`:
   ```java
   import com.jarvis.shizuku.ShizukuPackage;

   @Override
   protected List<ReactPackage> getPackages() {
     return Arrays.asList(
       new MainReactPackage(),
       new ShizukuPackage()   // add this line
     );
   }
   ```
6. Call from your root React component:
   ```typescript
   import { NativeModules } from 'react-native'
   useEffect(() => {
     NativeModules.ShizukuModule.registerListeners()
     return () => NativeModules.ShizukuModule.unregisterListeners()
   }, [])
   ```
7. Open Shizuku app, tap "Use Shizuku in third-party apps", grant permission to Jarvis.

## Gradle build.gradle — version injection

The CI pipeline injects `JARVIS_VERSION_NAME`, `JARVIS_VERSION_CODE`, and
`JARVIS_GIT_SHA` into `gradle.properties` before the build. Reference them in
`android/app/build.gradle`:

```groovy
android {
  defaultConfig {
    versionCode  = JARVIS_VERSION_CODE.toInteger()
    versionName  = JARVIS_VERSION_NAME
    buildConfigField "String", "GIT_SHA", "\"${JARVIS_GIT_SHA}\""
  }
}
```

## Voice Input

Voice transcription uses the Whisper API at `api.openai.com/v1/audio/transcriptions`.
If you only have an OpenRouter key, Whisper calls will fail with a 401.
To use voice:
- Either add a separate OpenAI key field in Settings (extend `AppSettings` in `types/index.ts`)
- Or use OpenRouter's Whisper-compatible proxy if available on your plan

The `VoiceService.ts` `transcribeAudio` function accepts any API key string;
update the call site in `useVoice.ts` to pull from a dedicated `openAiApiKey`
field once you add it to the settings store.

## Offline Mode

When `navigator.onLine === false`, the `streamMessage` function falls back to
`parseOfflineCommand`. The offline parser handles:
- Time and date queries
- Basic math expressions
- Unit conversions (temperature, distance)
- Status and help commands

All other requests return a typed offline message asking the user to reconnect.

## Git Sync

Git sync uses the GitHub REST API (not a local git binary). This means:
- Works in browser and Android WebView without native git
- Requires a GitHub PAT with `repo` write scope
- Commits are made via `PUT /repos/{owner}/{repo}/contents/{path}`
- Conflicts are resolved by fetching the current file SHA before each update (idempotent)
- Offline operations are queued in the Zustand store (persisted to localStorage)
  and drained automatically when the browser comes back online
