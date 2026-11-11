# Olfrim #3 "13 Years Waiting" (Shawshank x GTA 6)

```
python3 render.py     # out/shawshank_A.mp4, out/shawshank_B.mp4, out/shawshank_A_loopx3.mp4
python3 qa.py         # docket section 6 checks + work/sheets/review.png
```

Needs ffmpeg, Python 3 with numpy, scipy and Pillow. Everything is set in `config.json`.

- `render.py` cuts the shots, lays out the white caption panel, and muxes both versions.
- `mix_audio.py` builds the Version A sound: fixed gains, then `alimiter`. No `loudnorm`, no `dynaudnorm`.
- `qa.py` runs the automatic checks and writes the review sheet.

## Swapping in a 1080p source

1. Download about 40 s around the escape and drop the audio at extraction:
   `ffmpeg -i download.mp4 -an -c:v copy work/src/<name>_video_only.mp4`
2. In `config.json`, set `source.file`, `source.url`, `source.channel`, `source.resolution` and `source.status`.
3. Set each shot's `src_start` to the same picture in the new file. If the new file is the Movieclips clip, the current values should already be right or within a frame.
4. Run `render.py`, then `qa.py`, and check the review sheet.

`work/` and `out/` are not committed: they hold film footage.
