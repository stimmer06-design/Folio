#!/usr/bin/env python3
"""Version A sound design -> work/audio_A.wav (48 kHz stereo).

CRAWL  : pipe ambience (drips + hollow drone) with loud strained breathing and
         crawl scrapes, at full level from frame 0 (reverb is pre-rolled).
CUT    : thunder crack exactly on the cut frame, then a heavy downpour bed.
Mix    : fixed gains only, then the owner's limiter (alimiter). No loudnorm,
         no dynaudnorm. The film's own audio is never touched: the source file
         has no audio stream at all.
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from scipy.signal import butter, fftconvolve, sosfilt

ROOT = Path(__file__).resolve().parent
CFG = json.loads((ROOT / "config.json").read_text())
LOG = json.loads((ROOT / "work" / "render_log.json").read_text())
SR = CFG["output"]["audio_rate"]
FPS = CFG["output"]["fps"]
A = CFG["audio_A"]
DUR = LOG["total_frames"] / FPS
CUT = LOG["cut_frame"] / FPS
PRE = 2.0                      # reverb pre-roll before frame 0
rng = np.random.default_rng(19)


def db(x):
    return 10 ** (x / 20)


def load(key, stereo=False):
    path = ROOT / A["layers"][key]["file"]
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le",
                          "-ac", "2" if stereo else "1", "-ar", str(SR), "-"],
                         capture_output=True, check=True).stdout
    x = np.frombuffer(raw, dtype=np.float32).astype(np.float64)
    return x.reshape(-1, 2) if stereo else x


def seg(x, start, length):
    """`length` seconds of x from `start`; a negative start wraps (loopable beds)."""
    n = int(round(length * SR))
    idx = (int(round(start * SR)) + np.arange(n)) % len(x)
    return x[idx].copy()


def filt(x, kind, hz, order=2):
    sos = butter(order, hz, kind, fs=SR, output="sos")
    return sosfilt(sos, x, axis=0)


def to_peak(x, dbfs):
    return x * (db(dbfs) / (np.abs(x).max() + 1e-12))


def to_rms(x, dbfs):
    return x * (db(dbfs) / (np.sqrt((x ** 2).mean()) + 1e-12))


def pipe_ir(seconds=1.6, seed=1):
    """Synthetic sewer-pipe impulse response: dense decaying noise, dark and
    resonant, with a slap of early reflections down the tube."""
    r = np.random.default_rng(seed)
    n = int(seconds * SR)
    t = np.arange(n) / SR
    tail = r.standard_normal(n) * np.exp(-t * 4.3)
    tail = filt(filt(tail, "low", 3200), "high", 120)
    for f0, g in ((148, 0.9), (297, 0.6), (452, 0.4)):      # tube modes
        sos = butter(2, [f0 * 0.94, f0 * 1.06], "band", fs=SR, output="sos")
        tail += g * 6 * sosfilt(sos, r.standard_normal(n) * np.exp(-t * 3.0))
    for d, g in ((0.021, 0.7), (0.047, 0.55), (0.083, 0.4), (0.131, 0.3)):
        tail[int(d * SR)] += g * 8
    return tail / np.sqrt((tail ** 2).sum())


def in_pipe(x, wet=0.55, seed=1):
    """Dry + pipe reverb, stereo out (decorrelated left/right tails)."""
    outs = []
    for ch in range(2):
        w = fftconvolve(x, pipe_ir(seed=seed + ch))[:len(x)]
        outs.append((1 - wet) * x + wet * w)
    return np.stack(outs, axis=1)


def limit(x, ceiling_dbfs):
    """alimiter (same settings as the master) with a given ceiling."""
    chain = f"alimiter=limit={db(ceiling_dbfs):.4f}:attack=5:release=50:level=false"
    ch = x.shape[1] if x.ndim == 2 else 1
    r = subprocess.run(["ffmpeg", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac",
                        str(ch), "-i", "-", "-af", chain, "-f", "f32le", "-"],
                       input=x.astype("<f4").tobytes(), capture_output=True, check=True)
    y = np.frombuffer(r.stdout, dtype=np.float32).astype(np.float64)
    return y.reshape(-1, ch) if ch > 1 else y


def crawl_section():
    """PRE seconds of run-up + the CRAWL shot, so the pipe is already ringing."""
    n_len = PRE + CUT
    L = A["layers"]

    breath = seg(load("breathing"), L["breathing"]["offset"] - PRE, n_len)
    breath = filt(breath, "high", 90)
    breath = in_pipe(breath, wet=0.45, seed=3)

    scrape = seg(load("scrape"), L["scrape"]["offset"], CUT)
    scrape = np.concatenate([np.zeros(int(PRE * SR)), scrape])[:len(breath)]
    scrape = filt(scrape, "low", 5200)            # coat rub -> duller, heavier drag
    scrape = in_pipe(scrape, wet=0.5, seed=5)

    drips = seg(load("drips_close"), L["drips_close"]["offset"] - PRE, n_len)
    drips = in_pipe(drips, wet=0.7, seed=7)

    amb = seg(load("pipe_drips", stereo=True), L["pipe_drips"]["offset"], n_len)

    # hollow drone (original synthesis): low tube tones + breathy resonant noise
    n = len(breath)
    t = np.arange(n) / SR
    drone = np.zeros(n)
    for f0, g in ((49.0, 1.0), (73.6, 0.7), (98.4, 0.45), (147.5, 0.25)):
        drone += g * np.sin(2 * np.pi * f0 * t + rng.uniform(0, 6.28)) * \
            (0.8 + 0.2 * np.sin(2 * np.pi * rng.uniform(0.15, 0.4) * t))
    sos = butter(2, [110, 260], "band", fs=SR, output="sos")
    drone += 2.5 * sosfilt(sos, rng.standard_normal(n))
    drone = np.stack([drone, np.roll(drone, 331)], axis=1)

    # short rising whoosh into the cut (original synthesis), last 0.3 s
    wn = int(0.3 * SR)
    wt = np.linspace(0, 1, wn)
    whoosh = filt(rng.standard_normal(wn), "high", 700) * wt ** 2.5
    riser = np.zeros(n)
    riser[-wn:] = whoosh
    riser = np.stack([riser, riser], axis=1)

    body = slice(int(PRE * SR), None)             # level-set on the audible part
    tg = A["targets"]

    def g_peak(x, d):
        return x * (db(d) / np.abs(x[body]).max())

    def g_rms(x, d):
        return x * (db(d) / np.sqrt((x[body] ** 2).mean()))

    # breathing: +10 dB fixed gain into a limiter whose ceiling is the target peak,
    # so the breaths are dense and loud but still peak at the docket's -6 dBFS
    bp = tg["breathing_peak_dbfs"]
    breath = limit(g_peak(breath, bp + A.get("breathing_drive_db", 10.0)), bp)
    mix = (breath
           + g_peak(scrape, -8.0)
           + g_peak(drips, -11.0)
           + g_peak(amb, -13.0)
           + g_rms(drone, -17.0)
           + g_peak(riser, -9.0))
    return mix[body]


def rain_section():
    n_len = DUR - CUT
    L = A["layers"]
    tg = A["targets"]

    th = load("thunder")
    pk = np.abs(th).max()
    onset = int(np.argmax(np.abs(th) > pk * db(-14)))       # the crack itself
    th = th[max(0, onset - int(0.002 * SR)):][:int(n_len * SR)]
    th = np.concatenate([th, np.zeros(int(n_len * SR) - len(th))]) \
        if len(th) < int(n_len * SR) else th
    th[:96] *= np.linspace(0, 1, 96)                        # 2 ms de-click
    th = to_peak(th, tg["thunder_peak_dbfs"])
    th = np.stack([th, np.roll(th, 23)], axis=1)

    rain = seg(load("rain", stereo=True), L["rain"]["offset"], n_len)
    rain = to_rms(rain, tg["rain_rms_dbfs"])
    return th, rain


def music_bed(n_total):
    """Music with its biggest hit placed exactly on the cut. One fixed gain."""
    M = A.get("music") or {}
    if not M.get("enabled"):
        return np.zeros((n_total, 2))
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(ROOT / M["file"]), "-f",
                          "f32le", "-ac", "2", "-ar", str(SR), "-"],
                         capture_output=True, check=True).stdout
    x = np.frombuffer(raw, dtype=np.float32).astype(np.float64).reshape(-1, 2)
    start = int(round((M["hit_time"] - CUT) * SR))
    return x[start:start + n_total] * db(M["gain_db"])


def main():
    crawl = crawl_section()
    th, rain = rain_section()
    n_total = int(round(DUR * SR))
    n_cut = int(round(CUT * SR))
    mix = np.zeros((n_total, 2))

    crawl = crawl[:n_cut]
    crawl[-144:] *= np.linspace(1, 0, 144)[:, None]         # 3 ms out at the cut
    mix[:n_cut] = crawl

    n_r = n_total - n_cut
    # fixed gains only: thunder + rain, then an optional fixed bus trim (dB)
    rain_part = (th[:n_r] + rain[:n_r]) * db(A.get("rain_bus_trim_db", 0.0))
    mix[n_cut:] = rain_part
    mix += music_bed(n_total)

    mix[:96] *= np.linspace(0, 1, 96)[:, None]              # 2 ms de-click at loop
    mix[-96:] *= np.linspace(1, 0, 96)[:, None]

    work = ROOT / "work"
    pre = work / "audio_A_premix.wav"
    out = work / "audio_A.wav"
    # float premix (no clipping before the limiter)
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "f32le", "-ar", str(SR),
                    "-ac", "2", "-i", "-", "-c:a", "pcm_f32le", str(pre)],
                   input=mix.astype("<f4").tobytes(), check=True)
    # owner's chain: fixed gains -> alimiter (-> fixed trim for true-peak headroom)
    chain = A["limiter"]
    if A.get("post_trim_db"):
        chain += f",volume={A['post_trim_db']}dB"
    r = subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(pre), "-af", chain,
                        "-c:a", "pcm_s24le", "-ar", str(SR), str(out)],
                       capture_output=True, text=True)
    if r.returncode:
        sys.exit(r.stderr)

    def stats(x, a, b):
        s = x[int(a * SR):int(b * SR)]
        return {"peak_dbfs": round(20 * np.log10(np.abs(s).max() + 1e-12), 2),
                "rms_dbfs": round(10 * np.log10((s ** 2).mean() + 1e-12), 2)}

    info = {"duration": DUR, "cut_s": CUT,
            "premix_crawl": stats(mix, 0, CUT), "premix_rain": stats(mix, CUT, DUR),
            "premix_first_100ms": stats(mix, 0, 0.1),
            "chain": chain}
    (work / "audio_log.json").write_text(json.dumps(info, indent=2))
    print(json.dumps(info, indent=2))


if __name__ == "__main__":
    main()
