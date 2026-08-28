# -*- coding: utf-8 -*-
"""4K/60fps апскейл финального ролика через topazlabs/video-upscale."""
import os, subprocess, rep
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "final", "vector-promo-16x9.mp4")
OUT = os.path.join(HERE, "final", "vector-promo-4k60.mp4")

URL_PUBLIC = "https://boisterous-heliotrope-499640.netlify.app/promo/master-16x9.mp4"
print("→ источник: публичный URL", flush=True)
url = URL_PUBLIC
print("→ Topaz upscale 4k/60…", flush=True)
res = rep.run("topazlabs/video-upscale",
              {"video": url, "target_resolution": "4k", "target_fps": 60},
              wait=3600, poll_note="topaz")
res = res[0] if isinstance(res, list) else res
rep.save(res, OUT)

# звук мог потеряться при апскейле — проверяем и при нужде возвращаем
has_audio = subprocess.run(
    f'ffprobe -v error -select_streams a -show_entries stream=codec_name -of csv=p=0 "{OUT}"',
    shell=True, capture_output=True, text=True).stdout.strip()
if not has_audio:
    print("  звук потерян при апскейле — возвращаю из мастера")
    tmp = OUT.replace(".mp4", "-a.mp4")
    subprocess.run(f'ffmpeg -y -loglevel error -i "{OUT}" -i "{SRC}" -map 0:v -map 1:a '
                   f'-c:v copy -c:a aac -b:a 192k -shortest "{tmp}"', shell=True)
    os.replace(tmp, OUT)
info = subprocess.run(f'ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate '
                      f'-of csv=p=0 "{OUT}"', shell=True, capture_output=True, text=True).stdout.strip()
print(f"✅ 4K-мастер: {info}, {os.path.getsize(OUT)/1024/1024:.1f} MB")
