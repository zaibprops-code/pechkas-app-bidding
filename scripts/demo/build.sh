#!/bin/bash
# Builds the clickable demo published at https://claude.ai/artifact/C5cHrZkaysrbB16jkGiqNG:
# the app's web version, with a real Postgres (PGlite, every migration) running
# inside the page and answering the app's requests to Supabase. Made-up people
# only; sign-in is pretend (any number, code 123456). Nothing is sent anywhere.
#
#   scripts/demo/build.sh [out-dir]      then publish out-dir/site/index.html
#   node scripts/demo/serve.mjs out-dir/site 8901 & node scripts/demo/check.mjs out-dir
#
# Refresh it after a change to a screen or a migration, so the demo stays the app.
set -e
REPO=$(cd "$(dirname "$0")/../.." && pwd)
HERE=$REPO/scripts/demo
OUT=${1:-/tmp/pechkas-demo}
PG=$REPO/node_modules/@electric-sql/pglite/dist
mkdir -p "$OUT"
echo "1. The app's web version, pointed at the pretend server"
rm -rf "$OUT/app"
(cd "$REPO/apps/mobile" && EXPO_OFFLINE=1 EXPO_PUBLIC_SUPABASE_URL=https://demo.pechkas.invalid EXPO_PUBLIC_SUPABASE_ANON_KEY=demo-key \
  npx expo export --platform web --clear --output-dir "$OUT/app" > "$OUT/export.log" 2>&1)
grep -q demo.pechkas.invalid "$OUT"/app/_expo/static/js/web/entry-*.js || { echo "the export does not point at the demo server"; exit 1; }
echo "2. The starting database"
(cd "$REPO" && node "$HERE/snapshot.mjs" "$OUT/start.bin")
echo "3. The pretend server"
ESBUILD=$(command -v esbuild || echo "npx --yes esbuild@0.28.2")
(cd "$REPO" && NODE_PATH="$REPO/node_modules" $ESBUILD "$HERE/server.mjs" --bundle --format=esm --platform=browser --target=es2022 --minify \
  --outfile="$OUT/demo.js" --log-level=warning --alias:fs="$HERE/stub" --alias:path="$HERE/stub" \
  --external:'node:*' --external:crypto --external:module --external:url --external:zlib --external:stream --external:stream/promises)
echo "4. The page"
rm -rf "$OUT/site" && mkdir -p "$OUT/site/app/_expo/static/js/web"
cp -r "$OUT/app/assets" "$OUT/site/app/assets"
ENTRY=$(cd "$OUT/app" && ls _expo/static/js/web/entry-*.js)
sed -e 's#m.exports={uri:"/assets/#m.exports={uri:__PB+"app/assets/#g' -e 's#m.exports="/assets/#m.exports=__PB+"app/assets/#g' "$OUT/app/$ENTRY" > "$OUT/site/app/$ENTRY"
if grep -q '"/assets/' "$OUT/site/app/$ENTRY"; then echo "an asset path was not rewritten"; exit 1; fi
sed "s#__ENTRY__#app/$ENTRY#" "$HERE/page.html" > "$OUT/site/index.html"
cp "$OUT/demo.js" "$PG/pglite.wasm" "$PG/initdb.wasm" "$OUT/site/"
# Artifacts serve only web file types, so the database's own files travel as base64 text.
base64 -w0 "$OUT/start.bin" > "$OUT/site/start.txt"
base64 -w0 "$PG/pglite.data" > "$OUT/site/pglite-data.txt"
base64 -w0 "$PG/pgcrypto.tar.gz" > "$OUT/site/pgcrypto.txt"
echo "Built $OUT/site ($(find "$OUT/site" -type f | wc -l) files, $(du -sh "$OUT/site" | cut -f1))"
