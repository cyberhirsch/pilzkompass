#!/usr/bin/env bash
# Assembles the GitHub Pages site in _site/: the landing page with the phone at /,
# the working app (pages, AI model, map tiles) at /app/.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf _site
mkdir -p _site/app/model _site/app/maps
cp web/index.html _site/index.html
cp index.html bestimmen.html karte.html quellen.html data.js wetter.js trees.js nav.js icon.svg _site/app/
cp -r licenses _site/app/
cp model/boletus.onnx model/boletus-classes.json _site/app/model/
cp maps/trees.bin maps/trees.json _site/app/maps/
cp -r maps/tiles _site/app/maps/
touch _site/.nojekyll
du -sh _site
