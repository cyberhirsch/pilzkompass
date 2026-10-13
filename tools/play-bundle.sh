#!/usr/bin/env bash
# Builds the Google Play bundle: app/android/app/build/outputs/bundle/release/app-release.aab
# Run from app/ after `python ../tools/build-app.py`.
# Signing: set KEYSTORE_FILE, KEYSTORE_PASSWORD and KEY_ALIAS (unsigned otherwise).
# The 10 m map tiles move into the install-time asset pack "tiles" (app/android/tiles), so the
# base module stays under Play's 200 MB limit; Play installs both together.
set -euo pipefail

npx cap sync android
src=android/app/src/main/assets/public/maps/tiles
dst=android/tiles/src/main/assets/public/maps/tiles
rm -rf android/tiles/src
mkdir -p "$(dirname "$dst")"
mv "$src" "$dst"

cd android
chmod +x gradlew
./gradlew bundleRelease -PtilePack --no-daemon
