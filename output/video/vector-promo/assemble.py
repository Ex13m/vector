# -*- coding: utf-8 -*-
"""Монтаж промо: клипы -> 16:9 и 9:16, микс амбиенса + музыки + закадра.

Использование:
  python assemble.py                 # только видео + амбиенс клипов
  python assemble.py --music audio/music.mp3 --vo audio/vo.mp3
"""
import argparse, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
CLIPS = [  # порядок монтажа
    "01-forest", "02-pocket", "03-ridge", "04-ford", "05-night", "06-endcard",
]
FINAL = os.path.join(HERE, "final")


def sh(cmd):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if r.returncode:
        print(r.stderr[-1200:]); sys.exit(f"ffmpeg упал: {cmd[:90]}…")
    return r


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--music"); ap.add_argument("--vo")
    ap.add_argument("--amb", type=float, default=0.35, help="громкость амбиенса клипов")
    ap.add_argument("--mus", type=float, default=0.55, help="громкость музыки")
    a = ap.parse_args()
    os.makedirs(FINAL, exist_ok=True)

    files = [os.path.join(HERE, "clips", f"{n}.mp4") for n in CLIPS]
    have = [f for f in files if os.path.exists(f)]
    print(f"клипов в монтаже: {len(have)}/{len(files)}")
    if not have:
        sys.exit("нет клипов")

    # 1) нормализация: 1280x720, 24fps, стерео 48k — чтобы concat не рассыпался
    norm = []
    for i, f in enumerate(have):
        out = os.path.join(HERE, "clips", f"_n{i}.mp4")
        sh(f'ffmpeg -y -loglevel error -i "{f}" '
           f'-vf "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,fps=24" '
           f'-af "aresample=48000,aformat=channel_layouts=stereo" '
           f'-c:v libx264 -crf 19 -preset medium -pix_fmt yuv420p -c:a aac -b:a 192k "{out}"')
        norm.append(out)

    lst = os.path.join(HERE, "clips", "concat.txt")
    open(lst, "w").write("".join(f"file '{os.path.basename(p)}'\n" for p in norm))
    base = os.path.join(HERE, "clips", "_base.mp4")
    sh(f'ffmpeg -y -loglevel error -f concat -safe 0 -i "{lst}" -c copy "{base}"')

    # 2) звук: амбиенс клипов + музыка + закадр
    out169 = os.path.join(FINAL, "vector-promo-16x9.mp4")
    if a.music or a.vo:
        ins, amix, n = [f'-i "{base}"'], [f"[0:a]volume={a.amb}[amb]"], 1
        parts = ["[amb]"]
        if a.music:
            ins.append(f'-i "{a.music}"')
            amix.append(f"[{n}:a]volume={a.mus},afade=t=out:st=22:d=3[mus]")
            parts.append("[mus]"); n += 1
        if a.vo:
            ins.append(f'-i "{a.vo}"')
            amix.append(f"[{n}:a]volume=1.6[vo]")
            parts.append("[vo]"); n += 1
        fc = ";".join(amix) + ";" + "".join(parts) + \
             f"amix=inputs={len(parts)}:duration=first:dropout_transition=0,loudnorm=I=-14:TP=-1.2[a]"
        sh(f'ffmpeg -y -loglevel error {" ".join(ins)} -filter_complex "{fc}" '
           f'-map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -shortest "{out169}"')
    else:
        sh(f'ffmpeg -y -loglevel error -i "{base}" -c copy "{out169}"')

    # 3) вертикаль 9:16 для Reels/Shorts — центральный кроп
    out916 = os.path.join(FINAL, "vector-promo-9x16.mp4")
    sh(f'ffmpeg -y -loglevel error -i "{out169}" '
       f'-vf "scale=-2:1920,crop=1080:1920" -c:v libx264 -crf 20 -preset medium '
       f'-pix_fmt yuv420p -c:a copy "{out916}"')

    for p in norm + [base]:
        os.remove(p)
    for p in (out169, out916):
        mb = os.path.getsize(p) / 1024 / 1024
        d = subprocess.run(f'ffprobe -v error -show_entries format=duration -of csv=p=0 "{p}"',
                           shell=True, capture_output=True, text=True).stdout.strip()
        print(f"✅ {os.path.basename(p)}  {mb:.1f} MB  {float(d):.1f}s")


if __name__ == "__main__":
    main()
