"""Exports training/out/best.pt to model/boletus.onnx (int8) and model/boletus-classes.json.

Checks that the quantised model agrees with PyTorch on validation photos.
Usage: python training/export.py
"""
import csv
import json
from pathlib import Path

import numpy as np
import onnxruntime as ort
import timm
import torch
from onnxruntime.quantization import QuantType, quantize_dynamic
from PIL import Image

from train import EVAL_TF, SIZE

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parent
MODEL = PROJECT / "model"

ckpt = torch.load(ROOT / "out/best.pt", map_location="cpu")
keys = ckpt["keys"]
model = timm.create_model("vit_small_patch14_dinov2.lvd142m", pretrained=False, num_classes=len(keys), img_size=SIZE)
model.load_state_dict(ckpt["model"])
model.eval()

fp32 = MODEL / "boletus-fp32.onnx"
torch.onnx.export(model, torch.randn(1, 3, SIZE, SIZE), fp32, input_names=["image"], output_names=["logits"],
                  opset_version=17, dynamo=False)
out = MODEL / "boletus.onnx"
quantize_dynamic(fp32, out, weight_type=QuantType.QUInt8)
fp32.unlink()

# Class list for the page: our species names, status and group members.
classes = {c["key"]: c for c in json.loads((ROOT / "classes.json").read_text(encoding="utf-8"))}
(MODEL / "boletus-classes.json").write_text(
    json.dumps([{"key": k, "kind": classes[k]["kind"], "site": classes[k]["site"]} for k in keys], ensure_ascii=False),
    encoding="utf-8")

# Photo credits for the page (CC licences require attribution).
with open(ROOT / "photos.csv", encoding="utf-8") as src, \
        open(MODEL / "photo-credits.csv", "w", newline="", encoding="utf-8") as dst:
    w = csv.writer(dst)
    w.writerow(["class", "observation", "license", "attribution"])
    for r in csv.DictReader(src):
        w.writerow([r["class"], f"https://www.inaturalist.org/observations/{r['observation']}", r["license"],
                    r["attribution"]])

# Agreement check on 300 validation photos.
rows = [r for r in csv.DictReader(open(ROOT / "photos.csv", encoding="utf-8")) if r["split"] == "val"][::10][:300]
sess = ort.InferenceSession(str(out))
agree = hit_pt = hit_q = n = 0
for r in rows:
    p = ROOT / "data" / r["file"]
    if not p.exists():
        continue
    x = EVAL_TF(Image.open(p).convert("RGB")).unsqueeze(0)
    with torch.no_grad():
        a = model(x).argmax(1).item()
    b = int(np.argmax(sess.run(None, {"image": x.numpy()})[0]))
    y = keys.index(r["class"])
    agree += a == b
    hit_pt += a == y
    hit_q += b == y
    n += 1
print(f"{out.name}: {out.stat().st_size / 1e6:.1f} MB")
print(f"top-1 PyTorch {hit_pt}/{n}, int8 {hit_q}/{n}, agreement {agree}/{n}")
