#!/usr/bin/env bash
# Build a personally installable Android APK from the popup produced by pnpm build.
set -euo pipefail

android_dir="$(cd "$(dirname "$0")" && pwd)"
project_dir="$(dirname "$android_dir")"
popup="$project_dir/dist"
sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Android/Sdk}}"
build_tools="$sdk/build-tools/35.0.0"
android_jar="$sdk/platforms/android-36/android.jar"
debug_key="${ANDROID_USER_HOME:-$HOME/.android}/debug.keystore"
output="$project_dir/dist-zip/will-it-flood-android.apk"

if [[ ! -f "$popup/index.html" ]]; then
  echo 'Run pnpm build to create the popup assets first.' >&2
  exit 1
fi
if [[ ! -f "$android_jar" || ! -x "$build_tools/aapt2" ]]; then
  echo 'Install Android SDK Platform 36 and Build Tools 35.0.0, and set ANDROID_HOME to the SDK.' >&2
  exit 1
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/assets" "$work/res/drawable-nodpi" "$work/classes" "$work/gen"
cp "$popup/index.html" "$popup/credits.txt" "$work/assets/"
cp -R "$popup/assets" "$work/assets/"
cp "$popup/icon-128.png" "$work/res/drawable-nodpi/icon.png"
# Desktop Chrome fixes its popup width. Use the phone's viewport for the APK.
for css in "$work"/assets/assets/*.css; do
  printf '\nbody { width: 100%%; max-width: 36rem; }\n' >> "$css"
done

"$build_tools/aapt2" compile --dir "$work/res" -o "$work/resources.zip"
"$build_tools/aapt2" link -I "$android_jar" --manifest "$android_dir/AndroidManifest.xml" \
  --java "$work/gen" -A "$work/assets" -o "$work/unsigned.apk" "$work/resources.zip"
javac --release 8 -classpath "$android_jar" -d "$work/classes" \
  "$android_dir/src/au/willitflood/mobile/MainActivity.java" "$work/gen/au/willitflood/mobile/R.java"
jar cf "$work/classes.jar" -C "$work/classes" .
"$build_tools/d8" --min-api 26 --lib "$android_jar" --output "$work" "$work/classes.jar"
zip -qj "$work/unsigned.apk" "$work/classes.dex"
"$build_tools/zipalign" -f 4 "$work/unsigned.apk" "$work/aligned.apk"

# Android's standard local debug key lets subsequent personal builds install as updates.
if [[ ! -f "$debug_key" ]]; then
  (
    umask 077
    mkdir -p "$(dirname "$debug_key")"
    keytool -genkeypair -keystore "$debug_key" -alias androiddebugkey -keyalg RSA \
      -keysize 2048 -validity 10000 -dname 'CN=Android Debug,O=Android,C=US' \
      -storepass android -keypass android
  )
fi
"$build_tools/apksigner" sign --ks "$debug_key" --ks-key-alias androiddebugkey \
  --ks-pass pass:android --key-pass pass:android --v4-signing-enabled false \
  --out "$work/signed.apk" "$work/aligned.apk"
"$build_tools/apksigner" verify "$work/signed.apk"
"$build_tools/zipalign" -c 4 "$work/signed.apk"
mkdir -p "$(dirname "$output")"
mv "$work/signed.apk" "$output"
echo "Built $output"
