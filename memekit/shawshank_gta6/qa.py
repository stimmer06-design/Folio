#!/usr/bin/env python3
"""Automatic QA for Olfrim #3 (docket section 6) + review sheet (section 7).

  python3 qa.py        # prints PASS/FAIL per check, writes work/qa_report.json
                       # and work/sheets/review.png
"""
import json
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
CFG = json.loads((ROOT / "config.json").read_text())
LOG = json.loads((ROOT / "work" / "render_log.json").read_text())
OUT = ROOT / "out"
A, B, LOOP = (OUT / "shawshank_A.mp4", OUT / "shawshank_B.mp4",
              OUT / "shawshank_A_loopx3.mp4")
FPS = CFG["output"]["fps"]
SR = CFG["output"]["audio_rate"]
results = []


def sh(cmd, binary=False):
    r = subprocess.run(cmd, capture_output=True, text=not binary)
    return r.stdout, r.stderr


def probe(path):
    out, _ = sh(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json",
                 str(path)])
    return json.loads(out)


def check(name, ok, detail):
    results.append({"check": name, "pass": bool(ok), "detail": detail})
    print(f"[{'PASS' if ok else 'FAIL'}] {name}: {detail}")


def frames(path, idx):
    """Decode specific frames as RGB arrays."""
    sel = "+".join(f"eq(n\\,{i})" for i in idx)
    out, _ = sh(["ffmpeg", "-v", "error", "-i", str(path), "-vf", f"select='{sel}'",
                 "-vsync", "0", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], binary=True)
    w, h = CFG["output"]["width"], CFG["output"]["height"]
    arr = np.frombuffer(out, dtype=np.uint8).reshape(-1, h, w, 3)
    return dict(zip(sorted(idx), arr))


def audio(path):
    out, _ = sh(["ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le", "-ac", "2",
                 "-ar", str(SR), "-"], binary=True)
    return np.frombuffer(out, dtype=np.float32).reshape(-1, 2)


def ebur(path):
    _, err = sh(["ffmpeg", "-nostats", "-i", str(path), "-af", "ebur128=peak=true",
                 "-f", "null", "-"])
    tail = err[err.rfind("Summary"):]
    i = float(re.search(r"I:\s+(-?[\d.]+) LUFS", tail).group(1))
    m = re.search(r"Peak:\s+(-?[\d.]+|-inf) dBFS", tail)
    tp = float("-inf") if m.group(1) == "-inf" else float(m.group(1))
    return i, tp


def ink_bbox(panel):
    """Bounding box of non-white pixels in the caption panel."""
    dark = panel.min(axis=2) < 200
    ys, xs = np.where(dark)
    if len(xs) == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def main():
    n = LOG["total_frames"]
    cut = LOG["cut_frame"]
    panel_h = CFG["layout"]["panel_h"]

    # 1. Format ------------------------------------------------------------
    for path in (A, B):
        p = probe(path)
        v = next(s for s in p["streams"] if s["codec_type"] == "video")
        a = next(s for s in p["streams"] if s["codec_type"] == "audio")
        vd, ad = float(v["duration"]), float(a["duration"])
        ok = (v["width"], v["height"]) == (1080, 1920) and v["r_frame_rate"] == "30/1" \
            and v["avg_frame_rate"] == "30/1" and 4.6 <= vd <= 5.2 \
            and abs(vd - ad) <= 0.005 and v["codec_name"] == "h264" \
            and v["profile"] == "High" and v["pix_fmt"] == "yuv420p" \
            and a["codec_name"] == "aac" and a["sample_rate"] == "48000" \
            and a["channels"] == 2
        check(f"1 format {path.name}", ok,
              f"{v['width']}x{v['height']} {v['r_frame_rate']} fps, video {vd:.3f}s "
              f"({v['nb_frames']} frames), audio {ad:.3f}s (diff {abs(vd-ad)*1000:.1f} ms), "
              f"{v['codec_name']} {v['profile']} {v['pix_fmt']}, {a['codec_name']} "
              f"{a['sample_rate']} Hz {a['channels']}ch {int(a['bit_rate'])//1000} kbps")

    # 2. No film audio -----------------------------------------------------
    src = ROOT / CFG["source"]["file"]
    sp = probe(src)
    kinds = [s["codec_type"] for s in sp["streams"]]
    check("2a film audio dropped at extract", "audio" not in kinds,
          f"source streams = {kinds} ({src.name})")
    xb = audio(B)
    pk = 20 * np.log10(np.abs(xb).max() + 1e-12)
    check("2b version B silent", pk < -80, f"peak {pk:.1f} dBFS (need < -80)")

    # 3. Film length -------------------------------------------------------
    tot = LOG["film_seconds_total"]
    per = "; ".join(f"{s['name']} {s['src_in']:.3f}-{s['src_out']:.3f}s = "
                    f"{s['film_seconds']:.3f}s" for s in LOG["shots"])
    check("3 film length <= 5.0 s", tot <= 5.0, f"total {tot:.3f}s ({per})")

    # 4. Caption -----------------------------------------------------------
    need = sorted({0, cut - 1, cut, n - 1})
    fr = frames(A, need)
    b0 = ink_bbox(fr[0][:panel_h])
    check("4a caption visible at frame 0", b0 is not None, f"ink bbox {b0}")
    pa, pb = fr[cut - 1][:panel_h].astype(int), fr[cut][:panel_h].astype(int)
    p0 = fr[0][:panel_h].astype(int)
    changed = np.abs(pa - pb).mean()
    same_before = np.abs(p0 - pa).mean()
    # picture cut = biggest frame-to-frame jump in the clip area near the cut
    near = list(range(cut - 3, cut + 4))
    fn = frames(A, near)
    diffs = {i: float(np.abs(fn[i][panel_h:].astype(int) -
                             fn[i - 1][panel_h:].astype(int)).mean())
             for i in near[1:]}
    pic_cut = max(diffs, key=diffs.get)
    check("4b caption swaps on the exact cut frame",
          changed > 2 and same_before < 0.5 and pic_cut == cut,
          f"caption changes at frame {cut} (panel diff {changed:.1f}; unchanged "
          f"0..{cut-1}: {same_before:.2f}); picture cut at frame {pic_cut}")
    boxes = {i: ink_bbox(fr[i][:panel_h]) for i in (0, cut)}
    ok = all(b and b[0] >= 60 and b[2] <= 1020 and b[1] >= 200 and b[3] <= 560
             for b in boxes.values())
    check("4c caption inside x 60-1020, y 200-560", ok, f"bboxes {boxes}")

    # 5. Version A audio ---------------------------------------------------
    i_a, tp_a = ebur(A)
    i_l, tp_l = ebur(LOOP)
    check("5a true peak <= -1.0 dBTP", tp_a <= -1.0 and tp_l <= -1.0,
          f"A {tp_a:.1f} dBTP, loopx3 {tp_l:.1f} dBTP")
    xa = audio(A).mean(axis=1)
    # hit onset (thunder + music hit): the sharpest level jump near the cut,
    # 10 ms after vs 30 ms before, searched in 1 ms steps over cut -0.2 s .. +0.3 s
    c = int(cut / FPS * SR)
    sq = np.concatenate([[0.0], np.cumsum(xa.astype(np.float64) ** 2)])
    k10, k30 = int(0.010 * SR), int(0.030 * SR)
    cand = np.arange(c - int(0.2 * SR), c + int(0.3 * SR), SR // 1000)
    ratio = [((sq[t + k10] - sq[t]) / k10) / ((sq[t] - sq[t - k30]) / k30 + 1e-12)
             for t in cand]
    onset = cand[int(np.argmax(ratio))] / SR
    jump_db = 10 * np.log10(max(ratio))
    off_f = (onset - cut / FPS) * FPS
    check("5b thunder onset within +-1 frame of the cut", abs(off_f) <= 1.0,
          f"onset {onset:.4f}s vs cut {cut/FPS:.4f}s = {off_f:+.2f} frames "
          f"(level jump {jump_db:.1f} dB)")
    check("5c integrated loudness (report; about -14 +-2 LUFS on loopx3)",
          -16.0 <= i_l <= -12.0, f"A {i_a:.1f} LUFS, loopx3 {i_l:.1f} LUFS")
    first = xa[:int(0.1 * SR)]
    lvl0 = 20 * np.log10(np.sqrt((first ** 2).mean()) + 1e-12)
    crawl_rms = 20 * np.log10(np.sqrt((xa[:c] ** 2).mean()) + 1e-12)
    check("5d loud from the first frame", lvl0 >= crawl_rms - 6,
          f"first 100 ms {lvl0:.1f} dBFS RMS vs whole CRAWL {crawl_rms:.1f} dBFS RMS")

    # 6. Clean -------------------------------------------------------------
    starts = [s["out_start_frame"] for s in LOG["shots"]] + [n]
    sample = sorted({f for a0, a1 in zip(starts, starts[1:])
                     for f in (a0, (a0 + a1) // 2, a1 - 1)})
    fs = frames(A, sample)
    worst_bar = 0
    for i, im in fs.items():
        clip = im[panel_h:].astype(int).sum(axis=2)
        for edge in (clip[:6], clip[-6:], clip[:, :6], clip[:, -6:]):
            # a letterbox/pillar bar is flat near-black across the whole edge
            if edge.max() < 12:
                worst_bar += 1
    check("6a no letterbox/pillar bars in clip area", worst_bar == 0,
          f"{len(fs)} frames sampled over every shot: {sample}; flat-black edges: "
          f"{worst_bar}")
    # watermark sits bottom-left of the 16:9 source; prove the crop excludes it
    sw = int(CFG["source"]["resolution"].split("x")[0])
    sh_ = int(CFG["source"]["resolution"].split("x")[1])
    scaled_w = sw * CFG["layout"]["clip_h"] / sh_
    left = [(scaled_w - 1080) / 2 + s.get("crop_dx", 0) for s in CFG["shots"]]
    wm_right = 0.20 * scaled_w          # Movieclips bug spans x < 20% of the frame
    check("6b source watermark outside the crop", min(left) > wm_right,
          f"crop starts at x={min(left):.0f}px of {scaled_w:.0f}px scaled width; "
          f"watermark ends before x={wm_right:.0f}px (also confirm on review sheet)")
    res_ok = sh_ >= 1080
    check("6c source resolution >= 1080p (docket section 3)", res_ok,
          f"source is {CFG['source']['resolution']} - {CFG['source']['status']}")

    # Review sheet ---------------------------------------------------------
    luma = {i: im[panel_h:].mean() for i, im in frames(A, list(range(cut, n))).items()}
    flash = max(luma, key=luma.get)
    picks = [(0, "frame 0"), (cut - 1, "last CRAWL"), (cut, "first RAIN (cut)"),
             (flash, "lightning"), (n - 1, "final frame")]
    fr = frames(A, [p[0] for p in picks])
    tw, th = 432, 768
    sheet = Image.new("RGB", (tw * 5 + 60, th + 70 + 480 + 40), (24, 24, 24))
    d = ImageDraw.Draw(sheet)
    font = ImageFont.truetype(str(ROOT / CFG["layout"]["caption_font"]), 24)
    for k, (i, label) in enumerate(picks):
        im = Image.fromarray(fr[i]).resize((tw, th), Image.LANCZOS)
        sheet.paste(im, (10 + k * (tw + 10), 50))
        d.text((10 + k * (tw + 10), 12), f"{label}  (f{i}, {i/FPS:.2f}s)", font=font,
               fill=(255, 255, 255))
    # hook check: frame 0 at 270x480, shown 1:1
    small = Image.fromarray(fr[0]).resize((270, 480), Image.LANCZOS)
    y0 = th + 70
    sheet.paste(small, (10, y0))
    d.text((300, y0 + 10), "hook check: frame 0 downscaled to 270x480 (shown 1:1)",
           font=font, fill=(255, 255, 255))
    d.text((300, y0 + 50), f"cut / caption swap frame: {cut}   total frames: {n}   "
           f"lightning frame: {flash}", font=font, fill=(200, 200, 200))
    d.text((300, y0 + 90), f"source: {CFG['source']['resolution']}  "
           f"({CFG['source']['status']})", font=font, fill=(255, 190, 90))
    (ROOT / "work" / "sheets").mkdir(parents=True, exist_ok=True)
    sheet.save(ROOT / "work" / "sheets" / "review.png")

    rep = {"results": results, "all_pass": all(r["pass"] for r in results),
           "cut_frame": cut, "lightning_frame": flash,
           "loudness": {"A_lufs": i_a, "loop_lufs": i_l, "A_dbtp": tp_a,
                        "loop_dbtp": tp_l}}
    (ROOT / "work" / "qa_report.json").write_text(json.dumps(rep, indent=2))
    print("\nALL PASS" if rep["all_pass"] else "\nSOME CHECKS FAILED")
    return 0 if rep["all_pass"] else 1


if __name__ == "__main__":
    sys.exit(main())
