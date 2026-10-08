"""Assembles app/www: the site with every photo, the AI model, ONNX Runtime and fonts bundled for offline use.

Usage (from app/): python ../tools/build-app.py
App-sized photos live in app/photos (committed), so CI never has to download them; only photos
that are new in data.js are fetched from Wikimedia (originals cached in app/cache).
"""
import hashlib
import json
import re
import shutil
import time
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from pathlib import Path

import requests
from PIL import Image, ImageOps

PROJECT = Path(__file__).resolve().parent.parent
APP = PROJECT / "app"
WWW, CACHE, PHOTOS = APP / "www", APP / "cache", APP / "photos"
ORT_CDN = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/"
LEAFLET_CDN = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/"
FONTS_CSS = ("https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,700;9..144,900"
             "&family=Inter:wght@400;500;700;800&display=swap")
PHOTO_EDGE, THUMB_EDGE = 800, 200

session = requests.Session()
session.headers["User-Agent"] = "pilzkompass-app-builder/1.0 (non-commercial offline mushroom guide)"


def fetch(url):
    for attempt in range(8):
        try:
            r = session.get(url, timeout=60)
            if r.ok:
                time.sleep(0.5)  # stay well under Wikimedia's rate limit
                return r.content
            if r.status_code == 429:
                time.sleep(int(r.headers.get("Retry-After", 0)) or 15 * (attempt + 1))
                continue
        except requests.RequestException:
            pass
        time.sleep(5 * (attempt + 1))
    return None


def photo(p):
    """Downloads one gallery photo (960 px bucket) and writes the app-sized copy and thumbnail."""
    url = p["src"].split("?")[0].replace("/1280px-", "/960px-")
    key = hashlib.md5(url.encode()).hexdigest()[:16]
    big_path, small_path = PHOTOS / f"{key}.jpg", PHOTOS / "t" / f"{key}.jpg"
    if big_path.exists() and small_path.exists():
        return key
    cached = CACHE / f"{key}.jpg"
    if not cached.exists():
        data = fetch(url)
        if data is None:
            print("  skipped (download failed):", url, flush=True)
            return None
        cached.write_bytes(data)
    img = ImageOps.exif_transpose(Image.open(cached)).convert("RGB")
    big = img.copy()
    big.thumbnail((PHOTO_EDGE, PHOTO_EDGE))
    big.save(big_path, quality=78, optimize=True, progressive=True)
    small = ImageOps.fit(img, (THUMB_EDGE, THUMB_EDGE))
    small.save(small_path, quality=75, optimize=True)
    return key


def fonts():
    """Self-hosts the Google Fonts used by the pages (woff2, Latin subsets)."""
    css = session.get(FONTS_CSS, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                                         "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"}).text
    blocks = re.findall(r"/\*\s*([\w-]+)\s*\*/\s*(@font-face\s*{[^}]*})", css)
    out = []
    for subset, block in blocks:
        if subset not in ("latin", "latin-ext"):
            continue
        url = re.search(r"url\((https://[^)]+\.woff2)\)", block).group(1)
        name = hashlib.md5(url.encode()).hexdigest()[:12] + ".woff2"
        (WWW / "fonts" / name).write_bytes(fetch(url) or b"")
        out.append(block.replace(url, name))
    (WWW / "fonts" / "fonts.css").write_text("\n".join(out), encoding="utf-8")


def page(name):
    html = (PROJECT / name).read_text(encoding="utf-8")
    html = re.sub(r'<link rel="preconnect"[^>]*>\s*', "", html)
    html = re.sub(r'<link href="https://fonts\.googleapis\.com[^"]*" rel="stylesheet">',
                  '<link href="fonts/fonts.css" rel="stylesheet">', html)
    html = html.replace(ORT_CDN + "ort.wasm.min.js", "vendor/ort/ort.wasm.min.js").replace(ORT_CDN, "./vendor/ort/")
    html = html.replace(LEAFLET_CDN, "vendor/leaflet/")
    assert "googleapis" not in html and "jsdelivr" not in html and "cdnjs" not in html, name
    (WWW / name).write_text(html, encoding="utf-8")


def main():
    if WWW.exists():
        shutil.rmtree(WWW)
    for d in (PHOTOS / "t", WWW, WWW / "fonts", WWW / "model", WWW / "vendor" / "ort", WWW / "vendor" / "leaflet", WWW / "maps", CACHE):
        d.mkdir(parents=True, exist_ok=True)

    src = (PROJECT / "data.js").read_text(encoding="utf-8")
    species = json.loads(src[src.index("["):src.rindex("]") + 1])
    photos = [p for s in species for p in s.get("photos", [])]
    print(f"{len(photos)} photos", flush=True)
    with ThreadPoolExecutor(2) as pool:
        keys = dict(zip(map(id, photos), pool.map(photo, photos)))
    for s in species:
        s["photos"] = [p for p in s.get("photos", []) if keys[id(p)]]
        for p in s["photos"]:
            key = keys[id(p)]
            p["src"], p["thumb"] = f"img/{key}.jpg", f"img/t/{key}.jpg"
    print(f"{sum(map(bool, keys.values()))} of {len(photos)} photos bundled", flush=True)
    shutil.copytree(PHOTOS, WWW / "img")
    (WWW / "data.js").write_text("// Generated by tools/build-app.py\nwindow.BOLETES = "
                                 + json.dumps(species, ensure_ascii=False) + ";\n", encoding="utf-8")

    for name in ("index.html", "bestimmen.html", "karte.html"):
        page(name)
    for name in ("icon.svg", "wetter.js", "trees.js"):
        shutil.copy(PROJECT / name, WWW / name)
    for name in ("boletus.onnx", "boletus-classes.json", "photo-credits.csv"):
        shutil.copy(PROJECT / "model" / name, WWW / "model" / name)
    ort = APP / "node_modules" / "onnxruntime-web" / "dist"
    for name in ("ort.wasm.min.js", "ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"):
        shutil.copy(ort / name, WWW / "vendor" / "ort" / name)
    fonts()
    for name in ("trees.bin", "trees.json"):
        shutil.copy(PROJECT / "maps" / name, WWW / "maps" / name)
    shutil.copytree(PROJECT / "maps" / "tiles", WWW / "maps" / "tiles")   # 10 m tree tiles, ~280 MB
    for name in ("leaflet.min.js", "leaflet.min.css"):
        (WWW / "vendor" / "leaflet" / name).write_bytes(fetch(LEAFLET_CDN + name))

    size = sum(f.stat().st_size for f in WWW.rglob("*") if f.is_file())
    print(f"www: {size / 1e6:.0f} MB")


if __name__ == "__main__":
    main()
