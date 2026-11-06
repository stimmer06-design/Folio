#!/usr/bin/env bash
# Builds the Windows desktop package: "Andromeda Assembly.exe" with the game embedded,
# zipped together with a readme and licences.
#   ./build.sh [path/to/game.html] [version]
# Requires Go 1.24+ and go-winres (go install github.com/tc-hib/go-winres@latest).
set -euo pipefail
cd "$(dirname "$0")"
HTML="${1:-../release/AndromedaAssembly.html}"
VER="${2:-1.0.0}"
OUT=dist
NAME="Andromeda Assembly"
mkdir -p game "$OUT"
cp "$HTML" game/index.html
WINRES="$(command -v go-winres || echo "$(go env GOPATH)/bin/go-winres")"
"$WINRES" make --in winres/winres.json --arch amd64 --product-version "$VER" --file-version "$VER"
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -H windowsgui" -o "$OUT/$NAME.exe" .
rm -rf "$OUT/$NAME" && mkdir -p "$OUT/$NAME"
mv "$OUT/$NAME.exe" "$OUT/$NAME/"
cp README.txt LICENSES.txt "$OUT/$NAME/"
sed -i "s/{{VERSION}}/$VER/" "$OUT/$NAME/README.txt"
# Windows line endings for the text files
sed -i 's/$/\r/' "$OUT/$NAME/README.txt" "$OUT/$NAME/LICENSES.txt"
ZIP="AndromedaAssembly-$VER-win64.zip"
(cd "$OUT" && rm -f "$ZIP" && zip -qr -9 "$ZIP" "$NAME")
echo "$OUT/$ZIP"
