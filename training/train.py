"""Fine-tunes DINOv2 ViT-S/14 (Apache 2.0) on the downloaded iNaturalist photos.

Usage: python training/train.py [--epochs 12]
Writes training/out/best.pt, training/out/metrics.json.
"""
import argparse
import csv
import json
import math
import time
from collections import Counter
from pathlib import Path

import timm
import torch
import torch.nn.functional as F
import torchvision.transforms as T
from PIL import Image
from torch.utils.data import DataLoader, Dataset, WeightedRandomSampler

ROOT = Path(__file__).resolve().parent
DATA, OUT = ROOT / "data", ROOT / "out"
SIZE = 224
MEAN, STD = (0.485, 0.456, 0.406), (0.229, 0.224, 0.225)

TRAIN_TF = T.Compose([
    T.RandomResizedCrop(SIZE, scale=(0.35, 1.0), ratio=(0.75, 1.333)),
    T.RandomHorizontalFlip(),
    # Colour is diagnostic for boletes (pores, bluing), so only mild jitter and no hue shift.
    T.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.1),
    T.ToTensor(),
    T.Normalize(MEAN, STD),
])
# Same as the browser: shorter side to SIZE, then centre crop.
EVAL_TF = T.Compose([T.Resize(SIZE), T.CenterCrop(SIZE), T.ToTensor(), T.Normalize(MEAN, STD)])


class Photos(Dataset):
    def __init__(self, rows, tf):
        self.rows, self.tf = rows, tf

    def __len__(self):
        return len(self.rows)

    def __getitem__(self, i):
        path, label = self.rows[i]
        try:
            img = Image.open(path).convert("RGB")
        except Exception:
            img = Image.new("RGB", (SIZE, SIZE))
        return self.tf(img), label


def load_rows(keys):
    index = {k: i for i, k in enumerate(keys)}
    split = {"train": [], "val": []}
    with open(ROOT / "photos.csv", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            p = DATA / r["file"]
            if p.exists() and p.stat().st_size > 2000:
                split[r["split"]].append((str(p), index[r["class"]]))
    return split["train"], split["val"]


@torch.no_grad()
def evaluate(model, loader, n_classes, device):
    model.eval()
    top1 = top5 = total = 0
    per_class = torch.zeros(n_classes, 2)
    for x, y in loader:
        x, y = x.to(device, non_blocking=True), y.to(device)
        with torch.autocast("cuda", dtype=torch.bfloat16):
            logits = model(x)
        t5 = logits.topk(5, dim=1).indices
        hit1 = t5[:, 0] == y
        top1 += hit1.sum().item()
        top5 += (t5 == y[:, None]).any(1).sum().item()
        total += len(y)
        for yi, h in zip(y.tolist(), hit1.tolist()):
            per_class[yi, 0] += h
            per_class[yi, 1] += 1
    return top1 / total, top5 / total, per_class


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=12)
    ap.add_argument("--batch", type=int, default=96)
    ap.add_argument("--lr", type=float, default=5e-5)
    args = ap.parse_args()

    classes = json.loads((ROOT / "classes.json").read_text(encoding="utf-8"))
    keys = [c["key"] for c in classes]
    train_rows, val_rows = load_rows(keys)
    counts = Counter(l for _, l in train_rows)
    print(f"{len(keys)} classes, {len(train_rows)} train, {len(val_rows)} val", flush=True)

    # Balance classes with inverse-sqrt frequency so rare species are seen more often.
    weights = [1 / math.sqrt(counts[l]) for _, l in train_rows]
    sampler = WeightedRandomSampler(weights, num_samples=len(train_rows), replacement=True)
    train_dl = DataLoader(Photos(train_rows, TRAIN_TF), batch_size=args.batch, sampler=sampler,
                          num_workers=8, pin_memory=True, persistent_workers=True, drop_last=True)
    val_dl = DataLoader(Photos(val_rows, EVAL_TF), batch_size=128, num_workers=8, pin_memory=True,
                        persistent_workers=True)

    device = "cuda"
    model = timm.create_model("vit_small_patch14_dinov2.lvd142m", pretrained=True,
                              num_classes=len(keys), img_size=SIZE).to(device)
    head = [p for n, p in model.named_parameters() if n.startswith("head")]
    body = [p for n, p in model.named_parameters() if not n.startswith("head")]
    opt = torch.optim.AdamW([{"params": body, "lr": args.lr}, {"params": head, "lr": args.lr * 20}],
                            weight_decay=0.05)
    steps = args.epochs * len(train_dl)
    warmup = len(train_dl)
    sched = torch.optim.lr_scheduler.LambdaLR(
        opt, lambda s: s / warmup if s < warmup else 0.5 * (1 + math.cos(math.pi * (s - warmup) / (steps - warmup))))

    OUT.mkdir(exist_ok=True)
    best, history = 0.0, []
    for epoch in range(args.epochs):
        model.train()
        t0, loss_sum = time.time(), 0.0
        for x, y in train_dl:
            x, y = x.to(device, non_blocking=True), y.to(device, non_blocking=True)
            with torch.autocast("cuda", dtype=torch.bfloat16):
                loss = F.cross_entropy(model(x), y, label_smoothing=0.1)
            opt.zero_grad(set_to_none=True)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
            sched.step()
            loss_sum += loss.item()
        top1, top5, per_class = evaluate(model, val_dl, len(keys), device)
        history.append({"epoch": epoch + 1, "loss": loss_sum / len(train_dl), "top1": top1, "top5": top5})
        print(f"epoch {epoch + 1:2d}  loss {loss_sum / len(train_dl):.3f}  val top1 {top1:.3f}  top5 {top5:.3f}"
              f"  ({time.time() - t0:.0f}s)", flush=True)
        if top1 > best:
            best = top1
            torch.save({"model": model.state_dict(), "keys": keys}, OUT / "best.pt")
            acc = {k: {"correct": int(per_class[i, 0]), "total": int(per_class[i, 1])} for i, k in enumerate(keys)}
            (OUT / "metrics.json").write_text(json.dumps({"best_top1": top1, "top5": top5, "history": history,
                                                          "per_class": acc}, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
