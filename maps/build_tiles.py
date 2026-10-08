"""Cuts the 10 m Thünen tree species map into Web-Mercator PNG tiles (z5–z13).

Each tile stores the tree class per pixel, not a colour: palette index i (1..11) has red value
i*20, 0 is transparent. karte.html recolours the tiles in the browser for whatever mushroom or
tree is selected, so one tile set serves every view.

z13 is ~12 m per pixel in Germany, i.e. the native 10 m resolution; deeper zooms are upscaled
by the map. Lower zooms keep the most frequent tree class of each 2x2 block.

Usage: python maps/build_tiles.py      → maps/tiles/{z}/{x}/{y}.png
"""
import math
from pathlib import Path

import numpy as np
import rasterio
from affine import Affine
from PIL import Image
from rasterio.vrt import WarpedVRT
from rasterio.warp import Resampling, transform_bounds

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "source" / "Dominant_Species_Class.tif"
OUT = ROOT / "tiles"
MAX_Z, MIN_Z, BLOCK = 13, 5, 16          # BLOCK x BLOCK z13 tiles are warped at once (= one z9 tile)
CODES = [2, 3, 4, 5, 6, 8, 9, 10, 14, 16, 17]   # birch beech douglas oak alder spruce pine larch fir odh odl
ORIGIN = 20037508.342789244

LUT = np.zeros(256, np.uint8)
for i, c in enumerate(CODES, start=1):
    LUT[c] = i
PALETTE = [0, 0, 0] + [v for i in range(1, len(CODES) + 1) for v in (i * 20, i * 20, i * 20)]


def save(arr, z, x, y):
    if not arr.any():
        return False
    path = OUT / str(z) / str(x) / f"{y}.png"
    path.parent.mkdir(parents=True, exist_ok=True)
    img = Image.fromarray(arr, "P")
    img.putpalette(PALETTE)
    img.save(path, optimize=True, bits=4, transparency=0)
    return True


def majority(a):
    """2x2 downsample keeping the most frequent non-empty class."""
    cands = [a[0::2, 0::2], a[0::2, 1::2], a[1::2, 0::2], a[1::2, 1::2]]
    best, best_n = np.zeros_like(cands[0]), np.zeros(cands[0].shape, np.uint8)
    for v in cands:
        n = sum((w == v).astype(np.uint8) for w in cands) * (v > 0)
        take = n > best_n
        best[take], best_n[take] = v[take], n[take]
    return best


def tile_range(bounds, z):
    n = 2 ** z
    left, bottom, right, top = bounds
    def tx(lon): return int((lon + 180) / 360 * n)
    def ty(lat): return int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)
    return tx(left), ty(top), tx(right), ty(bottom)


def main():
    res = 2 * ORIGIN / (256 * 2 ** MAX_Z)
    count = 0
    with rasterio.open(SRC) as src:
        x0, y0, x1, y1 = tile_range(transform_bounds(src.crs, "EPSG:4326", *src.bounds), MAX_Z)
        x0, y0 = x0 // BLOCK * BLOCK, y0 // BLOCK * BLOCK          # align blocks to z9 tiles
        bx_n, by_n = (x1 - x0) // BLOCK + 1, (y1 - y0) // BLOCK + 1
        z9 = {}
        for by in range(by_n):
            for bx in range(bx_n):
                tx, ty = x0 + bx * BLOCK, y0 + by * BLOCK
                size = BLOCK * 256
                transform = Affine(res, 0, -ORIGIN + tx * 256 * res, 0, -res, ORIGIN - ty * 256 * res)
                with WarpedVRT(src, crs="EPSG:3857", transform=transform, width=size, height=size,
                               resampling=Resampling.nearest, nodata=255) as vrt:
                    block = LUT[vrt.read(1)]
                if not block.any():
                    continue
                level = block
                for z in range(MAX_Z, 8, -1):                     # z13 … z9 from this block
                    k = BLOCK >> (MAX_Z - z)
                    for j in range(k):
                        for i in range(k):
                            count += save(level[j * 256:(j + 1) * 256, i * 256:(i + 1) * 256], z,
                                          (tx >> (MAX_Z - z)) + i, (ty >> (MAX_Z - z)) + j)
                    if z > 9:
                        level = majority(level)
                z9[(tx >> 4, ty >> 4)] = level
            print(f"  block row {by + 1}/{by_n}, {count} tiles", flush=True)

    tiles = z9
    for z in range(8, MIN_Z - 1, -1):                           # z8 … z5 from the z9 tiles
        parents = {}
        for (x, y), arr in tiles.items():
            p = parents.setdefault((x // 2, y // 2), np.zeros((512, 512), np.uint8))
            p[(y % 2) * 256:(y % 2 + 1) * 256, (x % 2) * 256:(x % 2 + 1) * 256] = arr
        tiles = {k: majority(v) for k, v in parents.items()}
        for (x, y), arr in tiles.items():
            count += save(arr, z, x, y)
    size = sum(f.stat().st_size for f in OUT.rglob("*.png"))
    print(f"{count} tiles, {size / 1e6:.0f} MB")


if __name__ == "__main__":
    main()
