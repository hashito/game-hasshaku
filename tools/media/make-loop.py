# -*- coding: utf-8 -*-
"""Turn a generated audio file into a seamless loop (or a trimmed one-shot with fades), without loudness handling.
  python tools/make-loop.py in.flac out.wav --sec 40 --xfade 3 [--noloop] [--gain-db 0]
Loop: r = concat(y[c : L-c], crossfade(y[L-c : L] fading out, y[0 : c] fading in)); the last sample of r flows into r[0]
because r's tail is y[0:c] and r starts at y[c]. Equal-power fade (the material is noise-like / uncorrelated).
Prints a JSON line with the seam metrics: step at the wrap compared with the typical sample step, and the RMS (dB) of
the 0.5 s either side of the wrap.
"""
import argparse, json, subprocess, sys, wave
import numpy as np

SR = 44100


def read(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2)


def write(path, y):
    w = wave.open(path, "wb"); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((np.clip(y, -1, 1) * 32767).astype("<i2").tobytes()); w.close()


def rms_db(x):
    return float(20 * np.log10(np.sqrt((x ** 2).mean()) + 1e-9))


def env_db(y, hop=SR // 2):
    m = y.mean(axis=1)
    k = len(m) // hop
    return 20 * np.log10(np.sqrt((m[: k * hop].reshape(k, hop) ** 2).mean(axis=1)) + 1e-7)


def pick_window(y, L):
    """the steadiest window of length L: lowest spread of the 0.5 s level, and not far below the clip's median level"""
    e = env_db(y); w = int(L / (SR // 2)); med = np.median(e)
    best, bi = 1e9, 0
    for i in range(0, len(e) - w + 1):
        seg = e[i:i + w]
        score = seg.std() + max(0.0, med - 8 - seg.mean()) * 0.5 + max(0.0, seg.max() - seg.mean() - 8)
        if score < best: best, bi = score, i
    st = bi * (SR // 2)
    return y[st:st + L], dict(pick_start=bi * 0.5, pick_score=float(best), pick_std_db=float(e[bi:bi + w].std()))


def level(y, sigma=1.5, limit=9.0):
    """gentle leveller: smooth the level (3 s gaussian) towards the clip's median, at most +-limit dB"""
    hop = SR // 10
    m = y.mean(axis=1); k = len(m) // hop
    r = 20 * np.log10(np.sqrt((m[: k * hop].reshape(k, hop) ** 2).mean(axis=1)) + 1e-6)
    t = np.arange(-int(sigma * 30), int(sigma * 30) + 1) / 10.0
    g = np.exp(-t ** 2 / (2 * sigma ** 2)); g /= g.sum()
    rs = np.convolve(np.pad(r, (len(g), len(g)), mode="edge"), g, mode="same")[len(g):-len(g)]
    gain_db = np.clip(np.median(rs) - rs, -limit, limit)
    gain = np.interp(np.arange(len(y)) / hop, np.arange(k) + 0.5, 10 ** (gain_db / 20)).astype(np.float32)
    return y * gain[:, None]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("inp"); ap.add_argument("out")
    ap.add_argument("--sec", type=float, required=True); ap.add_argument("--xfade", type=float, default=3.0)
    ap.add_argument("--noloop", action="store_true"); ap.add_argument("--pick", action="store_true"); ap.add_argument("--gain-db", type=float, default=0.0)
    a = ap.parse_args()
    y = read(a.inp)
    n = int(a.sec * SR); c = int(a.xfade * SR)
    info = {}
    if a.pick and not a.noloop and len(y) > n + c + SR:
        y, info = pick_window(y, n + c)
    y = level(y)
    if a.noloop:
        r = y[: n + int(0.5 * SR)] if len(y) >= n else y
        r = r[:n].copy()
        f = int(2.0 * SR); r[:int(0.05 * SR)] *= np.linspace(0, 1, int(0.05 * SR))[:, None]
        r[-f:] *= np.linspace(1, 0, f)[:, None] ** 1.5
        seam = None
    else:
        L = n + c
        y = y[:L]
        if len(y) < L:
            print("generated audio shorter than requested", len(y) / SR, file=sys.stderr)
            c = int(0.2 * len(y)); L = len(y)
        t = np.linspace(0, np.pi / 2, c)[:, None]
        tail = y[L - c:L] * np.cos(t) + y[:c] * np.sin(t)
        r = np.concatenate([y[c:L - c], tail])
        step = np.abs(np.diff(r, axis=0)).mean(axis=1)
        wrap = float(np.abs(r[0] - r[-1]).mean())
        seam = dict(wrap_step=wrap, typical_step=float(np.median(step)), p99_step=float(np.percentile(step, 99)),
                    rms_before_db=rms_db(r[-int(0.5 * SR):]), rms_after_db=rms_db(r[:int(0.5 * SR)]))
    r = r * (10 ** (a.gain_db / 20))
    write(a.out, r)
    print(json.dumps(dict(sec=len(r) / SR, seam=seam, pick=info)))


if __name__ == "__main__":
    main()
