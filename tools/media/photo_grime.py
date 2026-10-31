# -*- coding: utf-8 -*-
"""Makes a clean (generated) picture look like a photo from a cheap phone / CCTV / intercom camera:
colour cast, lifted blacks, uneven exposure, vignette, soft focus, hand shake or motion blur, lens smudges,
dust and hairline scratches, sensor noise (stronger in the dark), over-sharpening and a low-quality JPEG
round trip. Deterministic for a seed. No date stamp or any text is ever burnt in (the game draws text).

From game-kaidan tools/gen_images.py grime() (looks: phone / phone_day / cctv / monitor / old) merged with
game-mikakunin tools/photos.py grunge() (grimy night corridor) and game-henji tools/photos.py grunge(),
night() and faded().

Requires: Pillow, numpy (both are in the ComfyUI venv).

As a library:
    from photo_grime import grime, LOOKS
    im = grime(im, seed=101, look="phone", strength=1.0)            # a preset
    im = grime(im, 7, "phone_day", cast=(1.0, 0.98, 0.9), motion=8)  # preset + overrides
As a CLI:
    python tools/photo_grime.py in.png out.jpg --look phone --seed 101
    python tools/photo_grime.py a.png b.png --out-dir assets/media --look cctv --size 800 --quality 80
    python tools/photo_grime.py in.png out.jpg --look old --strength 0.7 --motion 10 --angle 20 --cast 1.05,0.98,0.84
    python tools/photo_grime.py --looks                                # list the presets
    python tools/photo_grime.py in.png --sheet sheet.jpg               # every look side by side, to choose
"""
import argparse, io, os, random, sys

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageFont

# Every preset is a set of the parameters of grime(); keyword arguments override them.
#   cast       RGB multipliers (colour of the light: old fluorescent tubes are green-yellow, a desk lamp orange)
#   mono       True = grey (weighted luminance) before the cast; desat = 0..1 mix towards grey
#   gamma/gain/lift/scale   a = lift + scale * gain * a ** gamma  (gamma > 1 and gain < 1 = an underexposed night)
#   exp_lo/exp_rng          uneven exposure: big soft blotches multiply by exp_lo .. exp_lo + exp_rng
#   vig/vig_start           vignette depth and where it begins (0 = centre, 1 = edge)
#   blur, shake             focus softness (px) and a hand-shake double image (px offset, blended 30-35 %)
#   smudges/smudge_rgb      soft blotches on the lens; dust (specks), scratches (hairlines)
#   noise/chroma            luminance and colour sensor noise (both stronger in the dark)
#   scanlines               dark line every 3 px (CCTV); sharpen = unsharp percent; jpeg = round-trip quality
LOOKS = {
    # kaidan "phone": a phone at night, underexposed, a fluorescent cast
    "phone": dict(cast=(0.95, 1.02, 0.9), gamma=1.2, gain=0.9, lift=0.03, exp_lo=0.86, exp_rng=0.24, vig=0.34, vig_start=0.3,
                  blur=0.8, shake=2, smudges=8, smudge_rgb=(60, 50, 30), dust=120, scratches=0, noise=0.045, chroma=0.018, sharpen=55, jpeg=55),
    # kaidan "phone_day": daylight, nearly neutral
    "phone_day": dict(cast=(0.97, 0.97, 0.94), gain=1.0, lift=0.02, exp_lo=0.86, exp_rng=0.24, vig=0.34, vig_start=0.3,
                      blur=0.8, shake=2, smudges=8, smudge_rgb=(60, 50, 30), dust=120, noise=0.045, chroma=0.018, sharpen=55, jpeg=55),
    # kaidan "cctv": grey, scan lines, heavy noise
    "cctv": dict(mono=True, cast=(0.92, 1.0, 0.9), gamma=1.1, gain=0.95, lift=0.04, exp_lo=0.86, exp_rng=0.24, vig=0.34, vig_start=0.3,
                 blur=0.8, shake=2, smudges=8, smudge_rgb=(60, 50, 30), dust=120, noise=0.0675, chroma=0.0, scanlines=34, sharpen=55, jpeg=45),
    # kaidan "monitor": an intercom / monitor screen, dark corners
    "monitor": dict(cast=(0.86, 1.0, 0.92), gamma=1.15, gain=0.92, lift=0.05, exp_lo=0.86, exp_rng=0.24, vig=0.55, vig_start=0.3,
                    blur=0.8, shake=2, smudges=8, smudge_rgb=(60, 50, 30), dust=120, noise=0.0675, chroma=0.018, sharpen=55, jpeg=45),
    # kaidan "old": a faded print, yellowed, lifted blacks
    "old": dict(desat=0.45, cast=(1.05, 0.98, 0.84), gain=0.92, lift=0.07, exp_lo=0.86, exp_rng=0.24, vig=0.34, vig_start=0.3,
                blur=0.8, shake=2, smudges=8, smudge_rgb=(60, 50, 30), dust=120, noise=0.045, chroma=0.018, sharpen=55, jpeg=55),
    # mikakunin grunge(): a grimy building at night, old tubes, scratches, very low JPEG quality
    "grimy_night": dict(cast=(0.94, 1.03, 0.86), gamma=1.25, gain=0.86, lift=0.035, scale=0.93, exp_lo=0.82, exp_rng=0.3, vig=0.38, vig_start=0.35,
                        blur=0.9, shake=2, smudges=9, smudge_rgb=(60, 50, 30), dust=160, scratches=6, noise=0.055, chroma=0.02, sharpen=60, jpeg=38),
    # mikakunin grunge(day=True): the same camera in daylight
    "grimy_day": dict(cast=(1.0, 1.0, 0.97), lift=0.035, scale=0.93, exp_lo=0.92, exp_rng=0.14, vig=0.22, vig_start=0.35,
                      blur=0.9, shake=2, smudges=9, smudge_rgb=(60, 50, 30), dust=160, scratches=6, noise=0.055, chroma=0.02, sharpen=60, jpeg=38),
    # henji grunge(): a warm room at night, pale lens smudges
    "warm_night": dict(cast=(1.0, 0.98, 0.9), gamma=1.15, gain=0.92, lift=0.03, scale=0.94, exp_lo=0.86, exp_rng=0.24, vig=0.34, vig_start=0.35,
                       blur=0.8, shake=2, smudges=7, smudge_rgb=(235, 225, 205), dust=120, scratches=4, noise=0.045, chroma=0.018, sharpen=55, jpeg=42),
    "clean": None,  # unchanged
}
DEFAULTS = dict(cast=(1.0, 1.0, 1.0), mono=False, desat=0.0, gamma=1.0, gain=1.0, lift=0.0, scale=1.0, exp_lo=1.0, exp_rng=0.0,
                vig=0.0, vig_start=0.3, blur=0.0, shake=0, smudges=0, smudge_rgb=(60, 50, 30), dust=0, scratches=0,
                noise=0.0, chroma=0.0, scanlines=0, sharpen=0, jpeg=0)


def jpeg_round(img, q):
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=int(q))
    buf.seek(0)
    return Image.open(buf).convert("RGB")


def motion_blur(img, length, angle=0.0):
    """a straight streak of `length` px at `angle` degrees (0 = horizontal): the camera moved while exposing"""
    n = max(2, int(length))
    import math
    dx, dy = math.cos(math.radians(angle)), math.sin(math.radians(angle))
    acc = np.zeros((img.height, img.width, 3), dtype=np.float32)
    for i in range(n):
        t = i - (n - 1) / 2
        acc += np.asarray(ImageChops.offset(img, int(round(dx * t)), int(round(dy * t)))).astype(np.float32)
    return Image.fromarray(np.clip(acc / n, 0, 255).astype(np.uint8))


def grime(img, seed=1, look="phone", strength=1.0, motion=0, angle=0.0, **over):
    """returns a new RGB image; look = a LOOKS preset (or None for DEFAULTS), `over` = any preset parameter.
    strength scales the damage (blur, shake, vignette, smudges, dust, scratches, noise); motion = px of motion blur."""
    if look not in LOOKS:
        raise ValueError(f"unknown look '{look}' (have: {', '.join(LOOKS)})")
    if LOOKS[look] is None and not over and not motion:
        return img.convert("RGB").copy()
    p = dict(DEFAULTS)
    p.update(LOOKS[look] or {})
    p.update({k: v for k, v in over.items() if v is not None})
    s = float(strength)
    rnd = np.random.default_rng(seed)
    rr = random.Random(seed)
    img = img.convert("RGB")
    w, h = img.size
    a = np.asarray(img).astype(np.float32) / 255.0
    # colour: grey / desaturate, cast, tone curve
    if p["mono"]:
        lum = a @ np.array([0.3, 0.59, 0.11], dtype=np.float32)
        a = np.repeat(lum[..., None], 3, axis=2)
    elif p["desat"]:
        a = a * (1 - p["desat"]) + a.mean(axis=2, keepdims=True) * p["desat"]
    a = a * np.array(p["cast"], dtype=np.float32)
    a = p["lift"] + p["scale"] * p["gain"] * np.power(np.clip(a, 0, 1), p["gamma"])
    # uneven exposure: big soft blotches
    if p["exp_rng"]:
        low = rnd.random((max(2, h // 120), max(2, w // 120))).astype(np.float32)
        low = np.asarray(Image.fromarray((low * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC).filter(ImageFilter.GaussianBlur(w / 30))).astype(np.float32) / 255
        a *= (p["exp_lo"] + p["exp_rng"] * low[..., None])
    # vignette
    if p["vig"]:
        yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
        r = np.sqrt(((xx - w / 2) / (w / 2)) ** 2 + ((yy - h / 2) / (h / 2)) ** 2)
        a *= (1 - p["vig"] * s * np.clip(r - p["vig_start"], 0, 1) ** 1.5)[..., None]
    out = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))
    # softness, hand shake, motion
    if p["blur"]:
        out = out.filter(ImageFilter.GaussianBlur(p["blur"] * s))
    if p["shake"]:
        out = Image.blend(out, ImageChops.offset(out, max(1, int(p["shake"] * s)), max(1, int(p["shake"] * s / 2))), 0.3)
    if motion:
        out = motion_blur(out, motion, angle)
    # smudges, dust, scratches
    over_l = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    g = ImageDraw.Draw(over_l)
    for _ in range(int(p["smudges"] * s)):
        x, y, rad = rr.uniform(0, w), rr.uniform(0, h), rr.uniform(w * 0.02, w * 0.09)
        g.ellipse([x - rad, y - rad * 0.7, x + rad, y + rad * 0.7], fill=tuple(p["smudge_rgb"]) + (rr.randint(8, 24),))
    over_l = over_l.filter(ImageFilter.GaussianBlur(w / 90))
    g = ImageDraw.Draw(over_l)
    for _ in range(int(p["dust"] * s)):
        x, y = rr.uniform(0, w), rr.uniform(0, h)
        rad = rr.uniform(0.5, 2.0)
        c = rr.choice([(250, 250, 240), (20, 18, 15)])
        g.ellipse([x - rad, y - rad, x + rad, y + rad], fill=c + (rr.randint(30, 100),))
    for _ in range(int(p["scratches"] * s)):
        x, y = rr.uniform(0, w), rr.uniform(0, h)
        g.line([x, y, x + rr.uniform(-w * 0.2, w * 0.2), y + rr.uniform(-h * 0.08, h * 0.08)], fill=(235, 235, 225, rr.randint(15, 40)), width=1)
    if p["scanlines"]:
        for y in range(0, h, 3):
            g.line([0, y, w, y], fill=(0, 0, 0, int(p["scanlines"])))
    out = Image.alpha_composite(out.convert("RGBA"), over_l).convert("RGB")
    # sensor noise
    if p["noise"] or p["chroma"]:
        a = np.asarray(out).astype(np.float32) / 255.0
        lum = a.mean(axis=2, keepdims=True)
        n = rnd.normal(0, p["noise"] * s, (h, w, 1)) * (1.2 - lum)
        a = a + n
        if p["chroma"]:
            cn = rnd.normal(0, p["chroma"] * s, (max(1, h // 2), max(1, w // 2), 3))
            cn = np.asarray(Image.fromarray(((cn + 0.5) * 255).clip(0, 255).astype(np.uint8)).resize((w, h), Image.BILINEAR)).astype(np.float32) / 255 - 0.5
            a = a + cn * (1.1 - lum)
        out = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))
    if p["sharpen"]:
        out = out.filter(ImageFilter.UnsharpMask(radius=1.5, percent=int(p["sharpen"]), threshold=2))
    if p["jpeg"]:
        out = jpeg_round(out, p["jpeg"])
    return out


# ---- extra grades, applied before grime() (from henji / mikakunin photos.py) -------------------------------
def day_grade(img):
    """brighter, flatter, less saturated, a little warm: a phone in daylight (mikakunin)"""
    img = ImageEnhance.Brightness(img).enhance(1.55)
    img = ImageEnhance.Contrast(img).enhance(0.86)
    img = ImageEnhance.Color(img).enhance(0.75)
    r, g, b = img.split()
    return Image.merge("RGB", (r.point(lambda v: min(255, int(v * 1.04 + 6))), g, b.point(lambda v: int(v * 0.95))))


def lamp_night(img, side="left"):
    """a desk lamp at night: darker, warmer, the light falling off away from `side` (henji)"""
    img = ImageEnhance.Color(ImageEnhance.Brightness(img).enhance(0.85)).enhance(0.8)
    w, h = img.size
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    fx = xx / w if side == "left" else 1 - xx / w
    lamp = np.clip(1.15 - 0.75 * fx - 0.25 * (yy / h), 0.35, 1.1)
    a = np.asarray(img).astype(np.float32) * lamp[..., None] * np.array([1.05, 0.97, 0.84], dtype=np.float32)
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def faded(img):
    """an old print: lifted blacks, yellowed, low contrast, soft (henji)"""
    img = ImageEnhance.Color(ImageEnhance.Contrast(img).enhance(0.72)).enhance(0.6)
    a = np.asarray(img).astype(np.float32) / 255
    a = (0.12 + a * 0.82) * np.array([1.06, 1.0, 0.82], dtype=np.float32)
    return Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))


GRADES = {"day": day_grade, "lamp": lamp_night, "faded": faded}


def cover(img, w, h):
    """scale and centre-crop to exactly w x h"""
    s = max(w / img.width, h / img.height)
    img = img.resize((int(img.width * s + 1), int(img.height * s + 1)), Image.LANCZOS)
    x, y = (img.width - w) // 2, (img.height - h) // 2
    return img.crop((x, y, x + w, y + h))


def sheet(imgs, labels, dest, tw=360):
    """a contact sheet to compare looks"""
    th = int(tw * imgs[0].height / imgs[0].width)
    cols = min(4, len(imgs))
    rows = (len(imgs) + cols - 1) // cols
    sh = Image.new("RGB", (cols * (tw + 10) + 10, rows * (th + 30) + 10), (16, 16, 18))
    g = ImageDraw.Draw(sh)
    for i, (im, lab) in enumerate(zip(imgs, labels)):
        x, y = 10 + (i % cols) * (tw + 10), 10 + (i // cols) * (th + 30)
        sh.paste(im.resize((tw, th), Image.LANCZOS), (x, y))
        g.text((x, y + th + 6), lab, fill=(220, 220, 220), font=ImageFont.load_default())
    sh.save(dest, quality=88)
    return dest


def _floats(s):
    return tuple(float(v) for v in s.split(",")) if s else None


def main(argv=None):
    ap = argparse.ArgumentParser(description="phone-photo degradation (see the docstring)")
    ap.add_argument("inputs", nargs="*")
    ap.add_argument("--look", default="phone", help="preset: " + ", ".join(LOOKS))
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--strength", type=float, default=1.0)
    ap.add_argument("--motion", type=float, default=0, help="motion blur length in px (0 = none)")
    ap.add_argument("--angle", type=float, default=0.0, help="motion blur direction in degrees")
    ap.add_argument("--cast", help="r,g,b multipliers, e.g. 0.94,1.03,0.86")
    ap.add_argument("--grade", choices=sorted(GRADES), help="a grade applied before the grime")
    ap.add_argument("--size", type=int, default=0, help="shrink so the long side is at most this (after grime)")
    ap.add_argument("--quality", type=int, default=80, help="quality of the saved JPEG")
    ap.add_argument("--out-dir", help="write <out-dir>/<name>.jpg for every input")
    ap.add_argument("--sheet", help="write a contact sheet of every look of the first input instead")
    ap.add_argument("--looks", action="store_true", help="list the presets")
    a = ap.parse_args(argv)
    if a.looks:
        for k, v in LOOKS.items():
            print(f"{k:12s} {v}")
        return 0
    if not a.inputs:
        ap.print_help()
        return 1
    if a.sheet:
        src = Image.open(a.inputs[0]).convert("RGB")
        src.thumbnail((720, 720), Image.LANCZOS)
        names = list(LOOKS)
        sheet([grime(src, a.seed, k, a.strength) for k in names], names, a.sheet)
        print("sheet", a.sheet)
        return 0
    pairs = []
    if a.out_dir:
        os.makedirs(a.out_dir, exist_ok=True)
        pairs = [(p, os.path.join(a.out_dir, os.path.splitext(os.path.basename(p))[0] + ".jpg")) for p in a.inputs]
    elif len(a.inputs) == 2:
        pairs = [(a.inputs[0], a.inputs[1])]
    else:
        print("give: in out  (or several inputs with --out-dir)")
        return 1
    for i, (src, dest) in enumerate(pairs):
        im = Image.open(src).convert("RGB")
        if a.grade:
            im = GRADES[a.grade](im)
        im = grime(im, a.seed + i, a.look, a.strength, a.motion, a.angle, cast=_floats(a.cast))
        if a.size:
            im.thumbnail((a.size, a.size), Image.LANCZOS)
        im.save(dest, "JPEG", quality=a.quality, optimize=True, progressive=True)
        print(f"{src} -> {dest} {im.size} {os.path.getsize(dest) // 1024}KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
