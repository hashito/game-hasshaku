# -*- coding: utf-8 -*-
"""Finish the generated pictures of Issue #1 (called by gen-images.mjs; deterministic for a seed; never burns in text).
  python tools/media/post-images.py --id ph-goods      (prints one JSON line)
  python tools/media/post-images.py --all
photo: era look (photo_grime), optional soft focus, long side `out`, webp under `kb` -> assets/photos/<id>.webp
tex:   seamless tile ("xy" both ways / "y" along v only), or a door panel (no tile), or a decal with alpha
       -> assets/textures-game/<file>, and its entry in assets/textures-game/catalog.json (the game's own catalog; js/kit/texture-library.js format)
Records every finished picture (seed, model, prompt, bytes) in tools/media/made.json.
"""
import argparse, io, json, os, sys

import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from photo_grime import grime  # noqa: E402  (game-kit tools/photo_grime.py)

ROOT = os.path.dirname(os.path.dirname(HERE))
RAW = os.path.join(ROOT, "tools", "_raw", "img")
PHOTOS = os.path.join(ROOT, "assets", "photos")
TEX = os.path.join(ROOT, "assets", "textures-game")
MADE = os.path.join(HERE, "made.json")

# looks: (photo_grime preset, strength, overrides) -- restrained: the feel of a cheap film camera, never a filter show
LOOKS = {
    "film": ("old", 0.55, dict(desat=0.12, cast=(1.02, 1.0, 0.94), lift=0.03, blur=0.5, noise=0.045, smudges=0, dust=25, scratches=0, jpeg=0)),
    "night": ("warm_night", 0.6, dict(jpeg=0, smudges=0)),
    "print1990": ("old", 1.0, dict(desat=0.45, cast=(1.06, 0.98, 0.82), lift=0.08, blur=1.0, noise=0.05, dust=90, scratches=3, jpeg=0)),
}


def look(im, name, seed):
    base, s, over = LOOKS[name]
    return grime(im, seed=seed, look=base, strength=s, **over)


def smooth(x, a0, a1):
    t = np.clip((x - a0) / (a1 - a0), 0, 1)
    return t * t * (3 - 2 * t)


def seamless(im, axes="xy"):
    """blend the picture with its half-shifted copy near the frame (where the copy has no seam); the copy's own seams keep weight 0"""
    a = np.asarray(im.convert("RGB")).astype(np.float32)
    h, w = a.shape[:2]
    sy, sx = (h // 2, w // 2 if "x" in axes else 0)
    sh = np.roll(a, (sy, sx), axis=(0, 1))
    wy = np.abs(np.arange(h) + 0.5 - h / 2)[:, None] / (h / 2) * np.ones((1, w))
    if "x" in axes:
        wx = np.abs(np.arange(w) + 0.5 - w / 2)[None, :] / (w / 2) * np.ones((h, 1))
        s = smooth(np.maximum(wx, wy), 0.5, 0.97) * smooth(np.minimum(wx, wy), 0.0, 0.25)
    else:
        s = smooth(wy, 0.55, 0.98)
    s = s[..., None]
    out = a * (1 - s) + sh * s
    # keep the local contrast the blend of two fields loses
    k = np.sqrt((1 - s) ** 2 + s ** 2)
    low = np.asarray(Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(16))).astype(np.float32)
    out = low + (out - low) / np.clip(k, 0.72, 1)
    # even out big shading (a lit centre would repeat as a pattern)
    big = np.asarray(Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(min(h, w) / 6))).astype(np.float32)
    out = out - big * 0.6 + big.mean(axis=(0, 1)) * 0.6
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


def tile_noise(n, seed, scale=0.02):
    """tileable smooth noise in 0..1 (FFT-filtered)"""
    r = np.random.default_rng(seed).standard_normal((n, n))
    f = np.fft.fftfreq(n)
    F = np.fft.fft2(r) * np.exp(-((f[:, None] ** 2 + f[None, :] ** 2) / (2 * scale ** 2)))
    g = np.fft.ifft2(F).real
    g = (g - g.min()) / (g.max() - g.min() + 1e-9)
    return g


def webp(im, kb, q0=80, lossless=False):
    if lossless:
        buf = io.BytesIO(); im.save(buf, "WEBP", lossless=True, method=6); return buf.getvalue(), 100, im.size
    cur = im
    for _ in range(10):
        for q in range(q0, 37, -4):
            buf = io.BytesIO(); cur.save(buf, "WEBP", quality=q, method=6)
            if buf.tell() <= kb * 1024:
                return buf.getvalue(), q, cur.size
        cur = cur.resize((int(cur.width * 0.94), int(cur.height * 0.94)), Image.LANCZOS)
    return buf.getvalue(), 38, cur.size


def resize_long(im, n):
    sc = n / max(im.size)
    return im.resize((round(im.width * sc), round(im.height * sc)), Image.LANCZOS) if sc < 1 else im


def decal(im, out_w):
    """alpha = how far a pixel is from the flat ground around it (the pressed print is darker / shaded); the colour is darkened mud"""
    g = np.asarray(im.convert("L")).astype(np.float32)
    h, w = g.shape
    border = np.concatenate([g[:h // 10].ravel(), g[-h // 10:].ravel(), g[:, :w // 8].ravel(), g[:, -w // 8:].ravel()])
    med, spread = np.median(border), np.percentile(np.abs(border - np.median(border)), 90) + 4
    d = np.abs(g - med)
    a = smooth(d, spread * 0.9, spread * 2.6)
    a = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(3))).astype(np.float32) / 255
    # keep the main blob only: fade the border out
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    edge = smooth(np.minimum.reduce([xx, w - 1 - xx, yy, h - 1 - yy]) / (min(h, w) * 0.12), 0, 1)
    a = a * edge
    rgb = np.asarray(im.convert("RGB")).astype(np.float32) * 0.62
    out = Image.fromarray(np.dstack([np.clip(rgb, 0, 255), np.clip(a * 235, 0, 255)]).astype(np.uint8), "RGBA")
    return out.resize((out_w, round(out_w * h / w)), Image.LANCZOS)


def load_made():
    return json.load(open(MADE, encoding="utf8")) if os.path.exists(MADE) else {}


def catalog_update(spec, size, nbytes, seeds):
    os.makedirs(TEX, exist_ok=True)
    p = os.path.join(TEX, "catalog.json")
    cat = json.load(open(p, encoding="utf8")) if os.path.exists(p) else {
        "version": 1,
        "about": "Textures made for 八尺様 ― 境の夜 (Issue #1). Same format as the kit's shared catalog (js/kit/texture-library.js); kept apart because tools/kit-sync rewrites assets/textures/catalog.json. Candidates for the game-kit shared library.",
        "license": "CC0-1.0 for Game-fleet (generated locally with ComfyUI flux1-dev-fp8; FLUX.1 [dev] non-commercial licence terms apply to the model outputs as used by Game-fleet)",
        "units": "repeat = metres covered by one tile [u, v]; meters = suggested decal size in metres [w, h]",
        "categories": {}, "kits": {}, "textures": []}
    cat["textures"] = [t for t in cat["textures"] if t["id"] != spec["id"]]
    cat_name = spec["file"].split("/")[0]
    e = {"id": spec["id"], "category": "decal-footprint" if spec.get("decal") else cat_name, "type": "decal" if spec.get("decal") else "surface",
         "file": spec["file"], "size": list(size), "bytes": nbytes,
         "tileable": True if spec.get("tile") == "xy" or spec.get("tile") == "y" else False,
         "roughness": spec.get("roughness", 0.9), "metalness": 0, "alpha": bool(spec.get("decal")),
         "tags": ["hasshaku", "japanese", "rural"]}
    if spec.get("decal"):
        e["meters"] = spec["meters"]
    else:
        e["repeat"] = spec["repeat"]
    if spec.get("derive"):
        d = spec["derive"]
        e["source"] = {"method": "derived", "from": [d["a"], d["b"]], "amount": d["amount"], "note": "noise-mask blend of the two renders"}
    else:
        e["source"] = {"method": "comfyui", "model": "flux1-dev-fp8", "seed": seeds.get(spec["id"]), "prompt": spec["prompt"],
                       "post": "tools/media/post-images.py " + ("decal alpha" if spec.get("decal") else "seamless " + spec["tile"] if spec.get("tile") else "door panel")}
    cat["textures"].append(e)
    cat["textures"].sort(key=lambda t: t["id"])
    cats = {}
    for t in cat["textures"]:
        cats[t["category"]] = cats.get(t["category"], 0) + 1
    cat["categories"] = cats
    json.dump(cat, open(p, "w", encoding="utf8"), ensure_ascii=False, indent=1)


def process(spec, specs, seeds):
    sid = spec["id"]
    seed = seeds.get(sid, 1)
    if spec["kind"] == "photo":
        im = Image.open(os.path.join(RAW, sid + ".png")).convert("RGB")
        if spec.get("blur"):
            im = im.filter(ImageFilter.GaussianBlur(spec["blur"]))
        im = look(im, spec["look"], seed)
        im = resize_long(im, spec["out"])
        data, q, size = webp(im, spec["kb"], 80)
        os.makedirs(PHOTOS, exist_ok=True)
        dest = os.path.join(PHOTOS, sid + ".webp")
        rel = "assets/photos/" + sid + ".webp"
    else:
        if spec.get("derive"):
            d = spec["derive"]
            a = Image.open(os.path.join(TEX, next(s for s in specs if s["id"] == d["a"])["file"])).convert("RGB")
            b = Image.open(os.path.join(TEX, next(s for s in specs if s["id"] == d["b"])["file"])).convert("RGB").resize(a.size, Image.LANCZOS)
            n = tile_noise(a.width, 4242, 0.03)
            m = smooth(n, 1 - d["amount"] - 0.12, 1 - d["amount"] + 0.12)[..., None]
            arr = np.asarray(a).astype(np.float32) * (1 - m) + np.asarray(b).astype(np.float32) * m
            im = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
        else:
            im = Image.open(os.path.join(RAW, sid + ".png")).convert("RGB")
            if spec.get("decal"):
                im = decal(im, spec["out"])
            elif spec.get("tile"):
                im = seamless(im, spec["tile"])
                if spec["tile"] == "y":
                    im = im.resize((spec["out"], round(spec["out"] * im.height / im.width)), Image.LANCZOS)
                else:
                    im = im.resize((spec["out"], spec["out"]), Image.LANCZOS)
            else:  # a door panel: keep the aspect
                im = im.resize((spec["out"], round(spec["out"] * im.height / im.width)), Image.LANCZOS)
        data, q, size = webp(im, spec["kb"], 82, lossless=False)
        dest = os.path.join(TEX, spec["file"])
        rel = "assets/textures-game/" + spec["file"]
        os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, "wb") as f:
        f.write(data)
    if spec["kind"] == "tex":
        catalog_update(spec, size, len(data), seeds)
    made = load_made()
    made[sid] = {"file": rel, "bytes": len(data), "size": f"{size[0]}x{size[1]}", "quality": q,
                 "model": "derived" if spec.get("derive") else "flux1-dev-fp8 (ComfyUI, local)", "seed": None if spec.get("derive") else seed,
                 "prompt": spec.get("prompt", "derived: " + json.dumps(spec.get("derive")))}
    json.dump(dict(sorted(made.items())), open(MADE, "w", encoding="utf8"), ensure_ascii=False, indent=1)
    return dict(id=sid, bytes=len(data), quality=q, size=f"{size[0]}x{size[1]}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--id"); ap.add_argument("--all", action="store_true")
    a = ap.parse_args()
    specs = json.load(open(os.path.join(ROOT, "tools", "_raw", "work", "image-spec.json"), encoding="utf8"))
    sp = os.path.join(HERE, "seeds.json")
    seeds = json.load(open(sp)) if os.path.exists(sp) else {}
    out = [process(s, specs, seeds) for s in specs if a.all or s["id"] == a.id]
    print(json.dumps(out))


if __name__ == "__main__":
    main()
