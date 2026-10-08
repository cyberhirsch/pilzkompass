"""Aggregates the Thünen tree species map (10 m) into a compact grid for the web map.

Source: Blickensdörfer et al. (2022) Dominant Tree Species for Germany (2017/2018), CC BY 4.0,
https://doi.org/10.3220/DATA20221214084846 — download Dominant_Species_Class.tif into maps/source/.

Output (maps/):
  trees.bin   uint8, shape [classes, height, width]: % of each cell covered by that dominant species
  trees.json  grid metadata (EPSG:3857 bounds, size, class order)
Usage: python maps/build_tree_grid.py
"""
import json
from pathlib import Path

import numpy as np
import rasterio
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject, transform_bounds

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "source" / "Dominant_Species_Class.tif"
BLOCK = 100            # 100 x 10 m = 1 km aggregation cells in the source CRS
OUT_RES = 1500.0       # output cell size in Web-Mercator metres (~1 km on the ground in Germany)
CLASSES = {2: "birch", 3: "beech", 4: "douglas", 5: "oak", 6: "alder", 8: "spruce", 9: "pine",
           10: "larch", 14: "fir", 16: "odh", 17: "odl"}


def aggregate(src):
    """Counts pixels per class in BLOCK x BLOCK cells, reading BLOCK rows at a time."""
    codes = list(CLASSES)
    lut = np.full(256, 255, np.uint8)
    for i, c in enumerate(codes):
        lut[c] = i
    cols, rows = -(-src.width // BLOCK), -(-src.height // BLOCK)
    counts = np.zeros((len(codes), rows, cols), np.uint16)
    for r in range(rows):
        window = rasterio.windows.Window(0, r * BLOCK, src.width, min(BLOCK, src.height - r * BLOCK))
        data = lut[src.read(1, window=window)]
        pad = np.full((BLOCK, cols * BLOCK), 255, np.uint8)
        pad[:data.shape[0], :data.shape[1]] = data
        cells = pad.reshape(BLOCK, cols, BLOCK).transpose(1, 0, 2).reshape(cols, -1)
        for i in range(len(codes)):
            counts[i, r] = (cells == i).sum(1)
        if r % 100 == 0:
            print(f"  row {r}/{rows}", flush=True)
    transform = src.transform * src.transform.scale(BLOCK, BLOCK)
    return counts.astype(np.float32) / (BLOCK * BLOCK), transform


def main():
    with rasterio.open(SRC) as src:
        shares, transform = aggregate(src)
        crs, bounds = src.crs, src.bounds

    left, bottom, right, top = transform_bounds(crs, "EPSG:3857", *bounds)
    width, height = int((right - left) // OUT_RES) + 1, int((top - bottom) // OUT_RES) + 1
    dst_transform = from_origin(left, top, OUT_RES, OUT_RES)
    out = np.zeros((len(CLASSES), height, width), np.float32)
    for i in range(len(CLASSES)):
        reproject(shares[i], out[i], src_transform=transform, src_crs=crs, dst_transform=dst_transform,
                  dst_crs="EPSG:3857", resampling=Resampling.average, src_nodata=None, dst_nodata=0)

    pct = np.clip(np.round(out * 100), 0, 100).astype(np.uint8)
    (ROOT / "trees.bin").write_bytes(pct.tobytes())
    meta = {
        "width": width, "height": height, "crs": "EPSG:3857",
        "bounds": [left, bottom, left + width * OUT_RES, top],
        "classes": list(CLASSES.values()),
        "source": "Blickensdörfer et al. (2022): Dominant Tree Species for Germany (2017/2018), "
                  "Thünen-Institut, CC BY 4.0, doi:10.3220/DATA20221214084846",
    }
    (ROOT / "trees.json").write_text(json.dumps(meta, indent=1), encoding="utf-8")
    forest = pct.sum(0)
    print(f"grid {width}x{height}, {pct.nbytes / 1e6:.1f} MB, forest cells {(forest > 0).sum()}, "
          f"mean forest share {forest[forest > 0].mean():.0f}%")


if __name__ == "__main__":
    main()
