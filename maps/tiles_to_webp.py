"""Converts the class-index PNG tiles in maps/tiles to lossless WebP (about 30 % smaller).

Usage: python maps/tiles_to_webp.py
Class i is stored as red = i * 20 with full alpha; class 0 (no forest) is transparent.
Each PNG is replaced by a .webp next to it. Safe to rerun: already converted tiles are skipped.
"""
import os
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from PIL import Image

TILES = Path(__file__).resolve().parent / "tiles"


def to_rgba(img):
    """P image with class indices → RGBA with red = class * 20, alpha 0 for class 0."""
    idx = img.convert("P") if img.mode != "P" else img
    rgba = idx.convert("RGBA")  # the palette already maps class i to (i*20, i*20, i*20), index 0 transparent
    return rgba


def convert(png):
    png = Path(png)
    webp = png.with_suffix(".webp")
    img = Image.open(png)
    to_rgba(img).save(webp, "WEBP", lossless=True, quality=100, method=4, exact=False)
    # Verify: decoded classes must match the PNG exactly before the PNG goes.
    a, b = to_rgba(img), Image.open(webp).convert("RGBA")
    ra, aa = a.getchannel("R").tobytes(), a.getchannel("A").tobytes()
    rb, ab = b.getchannel("R").tobytes(), b.getchannel("A").tobytes()
    ok = aa == ab and all(x == y for x, y, al in zip(ra, rb, aa) if al)
    if not ok:
        webp.unlink()
        return str(png)
    png.unlink()
    return None


def main():
    pngs = [str(p) for p in TILES.rglob("*.png")]
    print(len(pngs), "PNG tiles to convert", flush=True)
    bad = []
    with ProcessPoolExecutor(max(1, (os.cpu_count() or 2) - 2)) as pool:
        for i, r in enumerate(pool.map(convert, pngs, chunksize=64), 1):
            if r:
                bad.append(r)
            if i % 5000 == 0:
                print(i, flush=True)
    size = sum(f.stat().st_size for f in TILES.rglob("*.webp"))
    print(f"done, {len(bad)} failed, webp total {size / 1e6:.0f} MB")
    for b in bad[:20]:
        print("  kept PNG:", b)


if __name__ == "__main__":
    main()
