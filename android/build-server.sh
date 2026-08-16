#!/usr/bin/env sh
set -eu

docker build -t hhy2-android-builder -f android/Dockerfile android
docker run --rm \
  -v "$(pwd):/workspace" \
  -w /workspace/android \
  hhy2-android-builder \
  gradle --no-daemon :app:assembleDebug
