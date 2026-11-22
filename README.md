# G-Code Forge for Android

An offline G-code workspace for Android. Generate repeated patterns, convert
hexagonal-flat programs, process two-axis indexing, and inspect the resulting
toolpath. No account, backend, API key or subscription is required by the app.

## Install

Download the signed APK from [GitHub Releases](https://github.com/milantetar/gcode-forge-android/releases).
Android may ask you to allow installation from the browser or file manager.
The installed release contains its JavaScript bundle and runs without Metro,
Expo Go or an internet connection.

The public application ID is `com.gcodeforge.studio`. It installs separately
from the earlier private app. To transfer workspaces, export a JSON backup from
the private app and restore it in this app before removing the old installation.

## Tools and features

| Tool | Parameters |
| --- | --- |
| Pattern Repeater | Repetitions, Y-axis spacing, mm/in display units |
| Hexagonal Flat Converter | Repetitions, Y-axis spacing, mm/in display units |
| Two Axis Converter | Repetitions, B-axis increment, rapid feedrate, engraving feedrate, mm/in display units |

- All three tools share the same file. Switching tools does not create another workspace.
- SQLite stores programs, parameters, theme preferences, presets and recovery history on the device.
- Import `.nc`, `.gcode` and `.txt` files; copy or export generated `.nc` programs.
- Syntax-color view, paged source editing, undo/redo, find/replace and jump to line.
- Source/output comparison and selectable output lines linked to the preview.
- Interactive toolpath preview with orbit/pan/zoom, playback and position information.
- Light and dark themes, landscape layout and fullscreen toolpath view.
- JSON backup/restore, explicit duplication and the last ten saved recovery versions.
- An empty source uses the selected tool's default sample when generating.

Source editing and long output are paged to bound rendering work. The preview
supports G0/G1, G2/G3 arcs, G17/G18/G19, G20/G21, G90/G91 and G90.1/G91.1.
Unsupported modes stop preview parsing with a line-specific warning.

## Privacy

G-code processing and storage happen locally. The app has no login, advertising,
analytics integration or cloud sync. Files leave the app only when you explicitly
copy, share or export them through Android. Backup files contain your source and
generated code; store and share them accordingly. Uninstalling the app removes
its local database. Android system backup is disabled.

Development tools and build services may access the network while installing
dependencies, serving development bundles or compiling a release. They are not
required to run an installed APK.

## Development

Requires Node.js 24 LTS and npm. The lockfile is committed; use `npm ci`.

```sh
git clone https://github.com/milantetar/gcode-forge-android.git
cd gcode-forge-android
npm ci
npm start
```

Open the QR code in an Expo Go version compatible with Expo SDK 58 on Android.
Development mode loads from your computer; only the standalone release runs
independently. Native Android file-share registration requires an installed
build and cannot be tested under this app's name in Expo Go.

```sh
npm run lint
npm run typecheck
npm test
npm run bundle:android
```

`bundle:android` validates the JavaScript/assets export. It does **not** produce
an APK. Tests include byte-for-byte conversion fixtures, default-source handling,
workspace migration/recovery and toolpath parsing.

## Build an APK

### GitHub Actions

The **Android APK** workflow builds an embedded, release-mode APK on Linux using
OpenJDK 17. No Expo account or EAS subscription is needed. Set these repository
Actions secrets before running it:

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | Base64-encoded release PKCS#12 keystore |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | Signing key alias |
| `ANDROID_KEY_PASSWORD` | Signing key password |

Run it from **Actions > Android APK > Run workflow**, or push a version tag.
Successful runs upload `G-Code-Forge.apk` and `SHA256SUMS` as an artifact. The
workflow verifies the APK's signature. Upload only verified artifacts to Releases.
Keep an offline backup of the release key and its passwords: updates require the
same signing identity. Never commit credentials or a keystore to this repository.

### Local Android SDK build

Install OpenJDK 17 and the Android SDK/toolchain required by Expo SDK 58.
Configure `JAVA_HOME` and `ANDROID_HOME`, then:

```sh
npm ci
npx expo prebuild --platform android --no-install
```

Set `FORGE_KEYSTORE_PATH` to the absolute path of your PKCS#12 keystore, plus
`FORGE_KEYSTORE_PASSWORD`, `FORGE_KEY_ALIAS` and `FORGE_KEY_PASSWORD` in your
local environment. Then build:

```sh
cd android
./gradlew :app:assembleRelease
# Windows: .\gradlew.bat :app:assembleRelease
```

The APK is in `android/app/build/outputs/apk/release/`. Without signing variables,
release builds are deliberately unsigned; the development debug key is never
used for a public release. `plugins/with-release-signing.js` applies configuration
during prebuild, so do not hand-edit generated native files.

An optional `release` APK profile is included in `eas.json` for developers who
prefer EAS. Configure their own Expo project and signing credentials first.

## F-Droid status

F-Droid inclusion is **not yet approved**. Upstream listing text is provided in
`fastlane/metadata/android/en-US/`. The app must be built from the published,
tagged source and its complete dependency tree reviewed before submission.
An APK attached to a GitHub release does not automatically appear on F-Droid.

The remaining work is to validate an F-Droid build recipe (including Expo
prebuild, npm dependencies and native dependencies), supply current phone
screenshots, and submit a merge request to `fdroiddata` or a packaging request.
F-Droid also applies maintenance and application-maturity requirements. Approval
and distribution timing are controlled by its maintainers.

See the [inclusion policy](https://f-droid.org/en/docs/Inclusion_Policy/) and
[submission guide](https://f-droid.org/en/docs/Submitting_to_F-Droid_Quick_Start_Guide/).
F-Droid may use a different signing certificate; a cross-channel switch can
require backing up workspaces and reinstalling the app.

## Project structure

```text
App.tsx                 Workspace and file flows
src/app/                Expo Router entry points
src/gcode.ts            Conversion tools and default programs
src/storage.ts          SQLite workspaces, presets and recovery
src/Editor.tsx          Source editor and comparison
src/Preview.tsx          Interactive toolpath display
src/toolpath.ts         Toolpath parsing and analysis
src/ui.tsx              Shared controls, icons and themes
tests/                  Conversion, storage and parser tests
plugins/                Generated Android release-signing configuration
.github/workflows/      APK build and verification
```

This repository contains only the Android app. It does not require the separate
Laravel/web project or any files from its repository.

## Contributing and limitations

Open an issue with the app version, Android version, expected behavior and a
small reproducible program with confidential machining details removed. Before
submitting a change, run lint, type checking and tests. Preserve conversion output
unless a deliberate algorithm change is described and covered by a fixture.

The preview is a visual aid, not a controller-accurate machine simulator. It does
not model stock removal, collisions, acceleration or full machine kinematics.
Conversion runs on the JavaScript thread, with job-size limits. Programmed feed
time excludes rapid motion and controller acceleration.

**Always review and simulate generated G-code against your machine setup before machining.**

## License

MIT, copyright 2026 Milan Tetar. See [LICENSE](LICENSE). Original Expo template
attribution is retained in [NOTICE](NOTICE); dependencies keep their own licenses.
