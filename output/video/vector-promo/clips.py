# -*- coding: utf-8 -*-
"""Vector promo — 5 клипов Seedance 2.0 (R2V от якорного кадра героя)."""
import os, sys, json
import rep

HERE = os.path.dirname(os.path.abspath(__file__))
ANCHOR = os.path.join(HERE, "refs", "hero-anchor.png")

COMMON = (
    "@Image1 (75%) is the identity lock: EXACTLY the same rider (dark technical kit with orange "
    "details, matte black helmet, sunglasses) on EXACTLY the same matte black full-suspension "
    "e-mountainbike with orange accents. Never duplicate the rider — exactly ONE rider and ONE bike "
    "in frame. The reference is a look reference only: never render frames, captions, arrows or text. "
    "24fps, cinematic dark color grade, near-black shadows, vivid orange highlights, film grain. "
    "Audio: natural ambience and tyre or water sound only — no background music, no voices."
)

SHOTS = [
    ("01-forest",
     "A cyclist weaves down a narrow forest singletrack between misty pine trunks, roots and rocks "
     "under the wheels, rear tyre flicking pine needles. Camera: low side tracking dolly running "
     "parallel to the rider, foreground trunks whipping through the frame, shafts of dawn sunlight "
     "slicing the fog. Cold blue mist, warm rim light on the rider."),
    ("02-pocket",
     "A cyclist is already riding at speed along a gravel path — he keeps one hand on the handlebar "
     "and with the other slides a smartphone into the back pocket of his jersey; the phone screen "
     "dims to black as it disappears into the fabric, then his hand returns to the bar and he keeps "
     "riding. He never stops, never puts a foot down, the wheels never stop turning. Camera: tracking "
     "alongside at pocket height, moving with him while the ground and roadside grass streak past in "
     "motion blur beneath the wheels. Golden hour side light, shallow depth of field, dust in the air."),
    ("03-ridge",
     "A cyclist pedals hard along a high alpine ridge crest and pulls away from the camera, gravel "
     "spitting from the rear tyre, a thin dust trail behind him, ridge rocks and cairns sweeping past "
     "him as he covers ground. Camera: cranes upward and LAGS BEHIND — the gap between camera and "
     "rider visibly opens as he rides away into the distance, foreground boulders sweeping through "
     "the bottom of the frame. Golden-blue evening light, long shadows, vast cloud-filled valley "
     "below, orange rim light on the rider. He must clearly travel forward across the terrain — "
     "never pedal in place, never hold a constant distance from the lens."),
    ("04-ford",
     "A cyclist powers through a shallow stony river ford, a wall of water spray exploding sideways, "
     "backlit droplets hanging in the air. Camera: low tracking shot at water level moving with him, "
     "then a slight speed ramp as the spray crosses the lens. Low sun behind the spray, dramatic "
     "storm sky clearing, dark moody grade."),
    ("05-night",
     "A cyclist rides a gravel field path at night, his headlight carving a cone of light through "
     "darkness, distant village lights on the horizon under a star field. Camera: rear three-quarter "
     "chase drifting slowly upward to reveal the stars above him. Near-black night, warm headlight "
     "beam, cool starlight, volumetric haze."),
]


def main():
    only = sys.argv[1] if len(sys.argv) > 1 else None
    print("upload anchor…", flush=True)
    anchor_url = rep.upload(ANCHOR)
    print("  anchor:", anchor_url[:70], flush=True)
    done = {}
    for name, action in SHOTS:
        if only and only not in name:
            continue
        out_path = os.path.join(HERE, "clips", f"{name}.mp4")
        if os.path.exists(out_path):
            print(f"= {name}: уже есть, пропуск", flush=True)
            continue
        print(f"→ {name} …", flush=True)
        url = rep.run("bytedance/seedance-2.0", {
            "prompt": f"{action} {COMMON}",
            "reference_images": [anchor_url],
            "duration": 5,
            "resolution": "720p",
            "aspect_ratio": "16:9",
            "generate_audio": True,
        }, wait=1200, poll_note=name)
        url = url[0] if isinstance(url, list) else url
        rep.save(url, out_path)
        done[name] = url
    json.dump(done, open(os.path.join(HERE, "clips", "urls.json"), "w"), indent=1)
    print("ГОТОВО:", ", ".join(done) or "(нечего)")


if __name__ == "__main__":
    main()
