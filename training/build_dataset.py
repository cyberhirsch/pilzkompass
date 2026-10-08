"""Downloads the training photos from iNaturalist.

Classes:
  - every species in tools/species.json with >= MIN_OBS research-grade observations,
  - rare species pooled into two groups (rare poisonous / rare other),
  - common non-bolete look-alikes,
  - "other fungi" (random European non-Boletales fungi).

Writes training/data/<class>/<photo_id>.jpg, training/classes.json and
training/photos.csv (attribution + train/val split). Safe to re-run: existing files are skipped.
"""
import csv
import hashlib
import json
import random
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parent
DATA = ROOT / "data"
MIN_OBS = 50
MAX_PER_CLASS = 500
OTHER_FUNGI = 2500
UA = {"User-Agent": "pilzkompass-training/1.0 (non-commercial mushroom identification aid)"}
FUNGI, BOLETALES = 47170, 48427

session = requests.Session()
session.headers.update(UA)


def api(path, **params):
    for attempt in range(6):
        try:
            r = session.get(f"https://api.inaturalist.org/v1/{path}", params=params, timeout=60)
            if r.ok:
                time.sleep(1.1)  # iNaturalist asks for <= 1 request per second
                return r.json()
        except requests.RequestException:
            pass
        time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"iNaturalist refused {path} {params}")


def observations(limit, **query):
    """Yields research-grade observations with photos, newest first, paging by id."""
    got, id_below = 0, None
    while got < limit:
        params = dict(quality_grade="research", photos="true", per_page=200, order_by="id", order="desc", **query)
        if id_below:
            params["id_below"] = id_below
        res = api("observations", **params)["results"]
        if not res:
            return
        for o in res:
            yield o
            got += 1
            if got >= limit:
                return
        id_below = res[-1]["id"]


def class_list():
    species = {s["sci"]: s for s in json.loads((PROJECT / "tools/species.json").read_text(encoding="utf-8"))}
    counts = json.loads((PROJECT / "tools/inat-counts.json").read_text(encoding="utf-8"))
    classes, seen_taxa = [], {}
    rare = {"rare-poisonous": [], "rare-other": []}
    for c in counts:
        if not c["taxon_id"]:
            continue
        if c["taxon_id"] in seen_taxa:  # iNat lumps some of our species (e.g. Leccinum quercinum)
            seen_taxa[c["taxon_id"]]["site"].append(c["sci"])
            continue
        if c["kind"] == "lookalike":
            entry = {"key": c["sci"], "kind": "lookalike", "taxa": [c["taxon_id"]], "site": []}
        elif c["all"] >= MIN_OBS:
            entry = {"key": c["sci"], "kind": "species", "taxa": [c["taxon_id"]], "site": [c["sci"]]}
        else:
            group = "rare-poisonous" if species[c["sci"]]["status"] == "poisonous" else "rare-other"
            rare[group].append(c)
            continue
        seen_taxa[c["taxon_id"]] = entry
        classes.append(entry)
    for key, members in rare.items():
        classes.append({"key": key, "kind": "group", "taxa": [m["taxon_id"] for m in members],
                        "site": [m["sci"] for m in members]})
    classes.append({"key": "other-fungi", "kind": "other", "taxa": [], "site": []})
    return classes


def split_of(obs_id):
    return "val" if int(hashlib.md5(str(obs_id).encode()).hexdigest(), 16) % 100 < 15 else "train"


def collect(entry):
    """Returns a list of photo records for one class."""
    records = []
    if entry["kind"] == "other":
        # Spread over random date windows for variety; Europe only, no Boletales.
        random.seed(1)
        per_window = 100
        for _ in range(OTHER_FUNGI // per_window):
            y, m = random.randint(2016, 2025), random.randint(5, 11)
            obs = observations(per_window, taxon_id=FUNGI, without_taxon_id=BOLETALES, place_id=97391,
                               d1=f"{y}-{m:02d}-01", d2=f"{y}-{m:02d}-28")
            for o in obs:
                p = o["photos"][0]
                records.append((o, p))
        return records
    budget = MAX_PER_CLASS
    per_taxon = max(1, budget // len(entry["taxa"]))
    for taxon in entry["taxa"]:
        obs = list(observations(per_taxon, taxon_id=taxon))
        photos_per_obs = 1 if len(obs) >= 250 else 2  # rarer classes: use a second photo
        for o in obs:
            for p in o["photos"][:photos_per_obs]:
                records.append((o, p))
    return records[:MAX_PER_CLASS * 2]


def download(job):
    url, path = job
    if path.exists():
        return True
    for attempt in range(3):
        try:
            r = session.get(url, timeout=60)
            if r.ok and r.headers.get("content-type", "").startswith("image/"):
                path.write_bytes(r.content)
                return True
        except requests.RequestException:
            pass
        time.sleep(3 * (attempt + 1))
    return False


def main():
    classes = class_list()
    (ROOT / "classes.json").write_text(json.dumps(classes, ensure_ascii=False, indent=1), encoding="utf-8")
    print(len(classes), "classes")
    rows, jobs = [], []
    for entry in classes:
        folder = DATA / entry["key"]
        folder.mkdir(parents=True, exist_ok=True)
        recs = collect(entry)
        for o, p in recs:
            url = p["url"].replace("/square.", "/medium.")
            path = folder / f"{p['id']}.jpg"
            jobs.append((url, path))
            rows.append({"class": entry["key"], "file": f"{entry['key']}/{p['id']}.jpg", "split": split_of(o["id"]),
                         "observation": o["id"], "photo": p["id"], "license": p.get("license_code") or "",
                         "attribution": p.get("attribution", "")})
        print(f"{len(recs):5d}  {entry['key']}", flush=True)

    with open(ROOT / "photos.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)

    print("downloading", len(jobs), "photos", flush=True)
    done = 0
    with ThreadPoolExecutor(8) as pool:
        for ok in pool.map(download, jobs):
            done += ok
            if done % 1000 == 0:
                print("  ", done, flush=True)
    print("downloaded", done, "of", len(jobs))


if __name__ == "__main__":
    main()
