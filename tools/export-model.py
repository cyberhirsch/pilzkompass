"""Exports the DF20 fungi classifier to ONNX and writes the class list.

Model: BVRA/mobilenetv2_100.in1k_ft_df20_299 (CC BY-NC 4.0, Picek et al. 2022).
Usage: python tools/export-model.py <path to DF20-train_metadata_PROD-2.csv>
Writes model/df20.onnx and model/classes.json.
"""
import csv
import json
import sys
from pathlib import Path

import timm
import torch

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "model"
OUT.mkdir(exist_ok=True)

# class_id -> species, plus genus/family for display
meta = sys.argv[1]
classes = {}
with open(meta, encoding="utf-8") as f:
    for row in csv.DictReader(f):
        cid = int(row["class_id"])
        if cid not in classes:
            classes[cid] = {
                "species": row["species"],
                "genus": row.get("genus", ""),
                "family": row.get("family", ""),
                "poisonous": row.get("poisonous", "") in ("1", "1.0", "True"),
            }
n = max(classes) + 1
assert n == 1604, n
(OUT / "classes.json").write_text(
    json.dumps([classes[i] for i in range(n)], ensure_ascii=False), encoding="utf-8")

model = timm.create_model("hf-hub:BVRA/mobilenetv2_100.in1k_ft_df20_299", pretrained=True).eval()
dummy = torch.randn(1, 3, 299, 299)
torch.onnx.export(model, dummy, OUT / "df20.onnx", input_names=["image"], output_names=["logits"],
                  opset_version=17, dynamo=False)
print("classes", n, "->", OUT)
