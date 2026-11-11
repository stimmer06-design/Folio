#!/usr/bin/env python3
"""Render Olfrim #3 "13 Years Waiting" (Shawshank x GTA 6).

  python3 render.py            # video + Version A + Version B + loopx3
  python3 render.py --video    # picture only (work/video_only.mp4)

Everything is driven by config.json. The film source must already be a
video-only file (its audio stream dropped with -an at extraction).
Audio rule: fixed gains + alimiter only. Never loudnorm / dynaudnorm.
"""
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
CFG = json.loads((ROOT / "config.json").read_text())
OUT = CFG["output"]
LAY = CFG["layout"]
W, H, FPS = OUT["width"], OUT["height"], OUT["fps"]


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit("FAILED: " + " ".join(map(str, cmd)) + "\n" + r.stderr[-3000:])
    return r


def frame_pts(path):
    """Presentation timestamps of every video frame in the source."""
    r = run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
             "frame=pts_time", "-of", "csv=p=0", str(path)])
    return sorted(float(x.split(",")[0]) for x in r.stdout.split() if x.strip(","))


def caption_png(text, dest):
    """Black bold sans on transparent, auto-shrunk to fit. Returns layout facts."""
    size = LAY["caption_size"]
    while True:
        font = ImageFont.truetype(str(ROOT / LAY["caption_font"]), size)
        l, t, r, b = font.getbbox(text)
        if r - l <= LAY["caption_max_w"] or size <= LAY["caption_min_size"]:
            break
        size -= 1
    img = Image.new("RGBA", (W, LAY["panel_h"]), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    x = (W - (r - l)) // 2 - l
    y = LAY["caption_center_y"] - (t + b) // 2
    d.text((x, y), text, font=font, fill=LAY["caption_color"])
    img.save(dest)
    box = img.getbbox()
    return {"text": text, "size": size, "bbox": box}


def build_video(dest):
    src = ROOT / CFG["source"]["file"]
    pts = frame_pts(src)
    work = ROOT / "work"
    (work / "captions").mkdir(parents=True, exist_ok=True)

    inputs, chains, labels, log = [], [], [], []
    caps = {}
    for s in CFG["shots"]:
        if s["caption"] not in caps:
            p = work / "captions" / f"cap_{len(caps)}.png"
            caps[s["caption"]] = (p, caption_png(s["caption"], p))

    cap_inputs = {}
    inputs += ["-i", str(src)]
    for text, (p, _) in caps.items():
        cap_inputs[text] = len(cap_inputs) + 1
        inputs += ["-i", str(p)]

    cut = 0
    for i, s in enumerate(CFG["shots"]):
        n_out = s["out_frames"]
        speed = s.get("speed", 1.0)
        # first source frame at/after src_start
        i0 = next(k for k, t in enumerate(pts) if t >= s["src_start"] - 0.02)
        need = n_out / FPS * speed
        i1 = next(k for k, t in enumerate(pts) if t >= pts[i0] + need + 0.02)
        t0, t1 = pts[i0] - 0.02, pts[i1] + 0.02  # half-frame margins
        dx = s.get("crop_dx", 0)
        sharp = CFG["source"].get("unsharp")
        vf = (f"[0:v]trim=start={t0:.4f}:end={t1:.4f},setpts=(PTS-STARTPTS)/{speed},"
              f"fps={FPS},trim=end_frame={n_out},setpts=PTS-STARTPTS,"
              f"scale=-2:{LAY['clip_h']}:flags=lanczos,"
              f"crop={LAY['clip_w']}:{LAY['clip_h']}:(iw-{LAY['clip_w']})/2+({dx}):0,"
              + (f"unsharp={sharp}," if sharp else "") +
              f"pad={W}:{H}:0:{LAY['panel_h']}:color={LAY['panel_color']},setsar=1[p{i}];"
              f"[p{i}][{cap_inputs[s['caption']]}:v]overlay=0:0:format=auto[s{i}]")
        chains.append(vf)
        labels.append(f"[s{i}]")
        log.append({"name": s["name"], "caption": s["caption"],
                    "src_in": round(pts[i0], 3),
                    "src_out": round(pts[i0] + need, 3),
                    "film_seconds": round(need, 4),
                    "out_start_frame": cut, "out_frames": n_out,
                    "crop_dx": dx, "speed": speed})
        cut += n_out

    fc = ";".join(chains) + ";" + "".join(labels) + \
        f"concat=n={len(labels)}:v=1:a=0,format=yuv420p[v]"
    run(["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex", fc,
         "-map", "[v]", "-an", "-r", str(FPS), "-c:v", "libx264", "-profile:v", "high",
         "-pix_fmt", "yuv420p", "-crf", str(OUT["crf"]), "-preset", OUT["preset"],
         "-movflags", "+faststart", str(dest)])

    total = cut
    # frame where the caption text changes (first shot with a different caption)
    swap = next(l["out_start_frame"] for l in log if l["caption"] != log[0]["caption"])
    info = {"shots": log, "total_frames": total, "duration": total / FPS,
            "caption_swap_frame": swap, "cut_frame": swap,
            "film_seconds_total": round(sum(l["film_seconds"] for l in log), 4),
            "captions": [c[1] for c in caps.values()]}
    (work / "render_log.json").write_text(json.dumps(info, indent=2))
    return info


def mux(video, audio, dest):
    run(["ffmpeg", "-y", "-v", "error", "-i", str(video), "-i", str(audio),
         "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac",
         "-b:a", OUT["audio_bitrate"], "-ar", str(OUT["audio_rate"]), "-ac", "2",
         "-shortest", "-movflags", "+faststart", str(dest)])


def main():
    work, out = ROOT / "work", ROOT / "out"
    out.mkdir(exist_ok=True)
    video = work / "video_only.mp4"
    info = build_video(video)
    print(json.dumps(info, indent=2))
    if "--video" in sys.argv:
        return
    dur = info["duration"]

    # Version A: designed sound (mix_audio.py writes work/audio_A.wav)
    run([sys.executable, str(ROOT / "mix_audio.py")])
    mux(video, work / "audio_A.wav", out / "shawshank_A.mp4")

    # Version B: silent stereo track
    run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-t", f"{dur:.6f}", "-i",
         f"anullsrc=r={OUT['audio_rate']}:cl=stereo", "-c:a", "pcm_s16le",
         str(work / "audio_B.wav")])
    mux(video, work / "audio_B.wav", out / "shawshank_B.mp4")

    # loopx3 review file: re-encode from the lossless parts so seams are exact
    run(["ffmpeg", "-y", "-v", "error", "-stream_loop", "2", "-i", str(video),
         "-stream_loop", "2", "-i", str(work / "audio_A.wav"),
         "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-profile:v", "high",
         "-pix_fmt", "yuv420p", "-crf", str(OUT["crf"]), "-preset", OUT["preset"],
         "-r", str(FPS), "-c:a", "aac", "-b:a", OUT["audio_bitrate"],
         "-ar", str(OUT["audio_rate"]), "-ac", "2", "-t", f"{dur * 3:.6f}",
         "-movflags", "+faststart", str(out / "shawshank_A_loopx3.mp4")])
    print("rendered:", *(p.name for p in sorted(out.glob("*.mp4"))))


if __name__ == "__main__":
    main()
