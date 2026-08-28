# -*- coding: utf-8 -*-
"""Звук промо: музыка (lyria-2) + закадр по таймкодам (minimax speech-02-hd)."""
import os, subprocess, sys
import rep

HERE = os.path.dirname(os.path.abspath(__file__))
AUD = os.path.join(HERE, "audio")
os.makedirs(AUD, exist_ok=True)

MUSIC_PROMPT = (
    "Dark cinematic pulse for an outdoor sports trailer: deep sub-bass heartbeat, tense driving "
    "percussion that builds, cold analog synth pads, sparse metallic guitar harmonics, wide reverb, "
    "modern and confident, steady build into a powerful final third. Instrumental only, no vocals."
)

# (файл, текст, голос, старт в секундах)
VO = [
    ("l1", "Every navigator tells you where to turn.", "narrator", 0.7),
    ("l2", "Vector tells you where your target is. And lets you find your own way.", "narrator", 5.2),
    ("l3", "Target at three o'clock. Eight kilometres.", "app", 10.6),
    ("l4", "Screen off. Phone in your pocket. Eyes on the trail.", "narrator", 15.4),
    ("l5", "Vector. The voice compass for cyclists.", "narrator", 21.0),
]
VOICES = {"narrator": "English_Trustworth_Man", "app": "English_Wiselady"}


def sh(cmd):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if r.returncode:
        print(r.stderr[-800:]); sys.exit("ffmpeg упал")
    return r


def music():
    out = os.path.join(AUD, "music.wav")
    if os.path.exists(out):
        print("= музыка уже есть"); return out
    print("→ музыка (lyria-2)…", flush=True)
    u = rep.run("google/lyria-2", {"prompt": MUSIC_PROMPT,
                                   "negative_prompt": "vocals, singing, speech, lyrics"},
                poll_note="music")
    u = u[0] if isinstance(u, list) else u
    return rep.save(u, out)


def voice():
    outs = []
    for name, text, who, start in VO:
        p = os.path.join(AUD, f"{name}.mp3")
        if not os.path.exists(p):
            print(f"→ закадр {name} ({who})…", flush=True)
            try:
                u = rep.run("minimax/speech-02-hd", {
                    "text": text, "voice_id": VOICES[who],
                    "speed": 0.96 if who == "narrator" else 1.0,
                    "emotion": "neutral", "english_normalization": True,
                }, poll_note=name)
            except Exception as e:
                print(f"  голос {VOICES[who]} не принят ({str(e)[:60]}), беру дефолтный")
                u = rep.run("minimax/speech-02-hd", {"text": text, "english_normalization": True},
                            poll_note=name)
            u = u[0] if isinstance(u, list) else u
            rep.save(u, p)
        outs.append((p, start))
    # склейка дорожки закадра по таймкодам
    ins = " ".join(f'-i "{p}"' for p, _ in outs)
    fc = ";".join(f"[{i}:a]adelay={int(s*1000)}|{int(s*1000)},volume=1.0[v{i}]"
                  for i, (_, s) in enumerate(outs))
    fc += ";" + "".join(f"[v{i}]" for i in range(len(outs)))
    fc += f"amix=inputs={len(outs)}:duration=longest:normalize=0[out]"
    vo = os.path.join(AUD, "vo.wav")
    sh(f'ffmpeg -y -loglevel error {ins} -filter_complex "{fc}" -map "[out]" -ar 48000 "{vo}"')
    print(f"  дорожка закадра: {os.path.basename(vo)}")
    return vo


if __name__ == "__main__":
    m = music()
    v = voice()
    print("\nГОТОВО:\n ", m, "\n ", v)
