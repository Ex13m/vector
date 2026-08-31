# -*- coding: utf-8 -*-
"""
Google Play publishing via the Play Android Developer API.

Что умеет (всё, что Google отдаёт в API):
  listing   — тексты витрины (название, краткое/полное описание) EN + RU
  images    — иконка 512, feature graphic 1024x500, скриншоты телефона
  upload    — залить AAB и раскатить на internal-трек
  promote   — поднять versionCode с internal в production (ОТПРАВКА НА РЕВЬЮ!)
  status    — что сейчас на треках

Чего API НЕ умеет (только руками в Console, ограничение Google):
  • Data Safety · Content rating · Target audience · Ads
  • App content declarations (foreground/background location) + ссылка на демо-видео
  • Принятие юридических деклараций

Требуется service-account JSON (см. HANDOFF.md / --help-setup) в
  C:/Users/User/play-api-key.json  (или переменная PLAY_API_KEY)
Ключ НИКОГДА не коммитить.

Примеры:
  python scripts/play-publish.py status
  python scripts/play-publish.py listing --commit
  python scripts/play-publish.py images --commit
  python scripts/play-publish.py upload --aab "C:/Users/User/Downloads/vector-vc4-release.aab" --commit
  python scripts/play-publish.py promote --version-code 4 --commit
"""
import argparse
import os
import sys
import io

PACKAGE = "cz.konsalting.vektor"
KEY_PATH = os.environ.get("PLAY_API_KEY", r"C:\Users\User\play-api-key.json")
SCOPES = ["https://www.googleapis.com/auth/androidpublisher"]

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DL = r"C:\Users\User\Downloads"

# ── Тексты витрины (источник: docs/PLAY-LISTING.md §1) ───────────────────────
LISTINGS = {
    "en-US": {
        "title": "Vector — cycling beacon",
        "shortDescription":
            "Voice compass for cyclists: \u201ctarget at 3 o\u2019clock, 8 km\u201d. Screen-off friendly.",
        "fullDescription": """Vector is not a turn-by-turn navigator. It's a beacon.

Pick a target on the map, put the phone in your pocket and ride. Vector speaks the direction clock-style — “target at 3 o'clock, 8 kilometres” — so YOU choose the route: side streets, parks, gravel. The app just keeps you pointed the right way.

• Works with the SCREEN OFF — voice guidance continues from your pocket
• Clock-face directions + distance + ETA, at your chosen interval
• Announces when you turn away from the target
• Aiming mode: rotate the phone, hear “target ahead”, and go
• Offline maps: cache the area along the route in advance
• Ride log with track, distance, time; GPX export to Strava & friends
• Continue a trip, ride back to the start, chain new targets
• Russian, English, German voice and interface
• No accounts, no ads, no tracking — your data stays on your device

Two ways to use it. Ride TO something — a lake, a viewpoint, a town on the horizon. Or drop the target on the spot you started from — the car, the camp, the hut — and just wander: Vector keeps telling you how far away you have drifted and which way leads back. Handy in the forest, on fishing trips, anywhere it is easy to lose your bearings.

Background location is used only during an active ride to keep the voice guidance running while the screen is off (a visible notification is shown).

Made for cyclists who want to explore, not follow arrows.""",
    },
    "ru-RU": {
        "title": "Vector — вело-маяк",
        "shortDescription":
            "Голосовой компас велосипедиста: «цель на 3 часа, 8 км». Экран не нужен.",
        "fullDescription": """Vector — это не пошаговый навигатор. Это маяк.

Выбери цель на карте, убери телефон в карман и крути педали. Vector говорит направление «по часам» — «цель на 3 часа, 8 километров» — а маршрут выбираешь ТЫ: дворы, парки, грунтовки. Приложение просто держит тебя на курсе.

• Работает с ВЫКЛЮЧЕННЫМ экраном — голос ведёт из кармана
• Направление по циферблату + дистанция + время в пути, интервал настраивается
• Подсказка, если отвернул от цели
• Режим наведения: крути телефон — «цель впереди» — и поехали
• Офлайн-карты: закэшируй область маршрута заранее
• Журнал поездок с треком, дистанцией, временем; экспорт GPX (Strava и др.)
• Продолжение поездки, возврат к старту, цепочки целей
• Русский, английский, немецкий — голос и интерфейс
• Без аккаунтов, рекламы и слежки — данные остаются на устройстве

Два сценария. Первый — ехать к цели: озеро, смотровая, город на горизонте. Второй — поставить цель на месте старта (машина, лагерь, домик) и просто гулять: Vector всё время говорит, насколько ты удалился и в какой стороне обратный путь. Удобно в лесу, на рыбалке и там, где легко потерять направление.

Фоновая геолокация используется только во время активной поездки, чтобы голос не прерывался при выключенном экране (показывается уведомление).

Для тех, кто хочет исследовать, а не ехать по стрелкам.""",
    },
}

# Скриншоты телефона: до 8 штук, порядок = порядок в витрине.
SCREENSHOTS = [
    os.path.join(DL, "my-screens-en", n) for n in [
        "Screenshot_20260724-190929.png",  # target set
        "Screenshot_20260724-191033.png",  # aiming: straight!
        "Screenshot_20260724-191347.png",  # riding HUD + ETA
        "Screenshot_20260724-194406.png",  # 398 m to go
        "Screenshot_20260724-194522.png",  # arrived
        "Screenshot_20260724-190955.png",  # caching area
        "Screenshot_20260724-194533.png",  # saved trips
        "Screenshot_20260724-191521.png",  # settings
    ]
]
ICON = os.path.join(DL, "vector-play-icon-512.png")
FEATURE = os.path.join(DL, "vector-play-feature-1024x500.png")

SETUP_HELP = """
──────────────────────────────────────────────────────────────────────
РАЗОВАЯ НАСТРОЙКА ДОСТУПА (≈10 минут, делается один раз)
──────────────────────────────────────────────────────────────────────
1. Play Console → Настройки (шестерёнка) → «Доступ к API»
   → «Связать проект Google Cloud» (создать новый, если нет).
2. Там же → «Сервисные аккаунты» → «Создать сервисный аккаунт»
   → откроется Google Cloud Console → Create service account
   → имя любое (напр. play-publisher) → Done.
3. В Cloud Console: сервисный аккаунт → вкладка Keys → Add key
   → Create new key → JSON → скачается файл.
   Положить его как:  C:\\Users\\User\\play-api-key.json
4. Вернуться в Play Console → Доступ к API → напротив сервисного аккаунта
   «Предоставить доступ» → права:
        • Приложения: Vector
        • «Управление выпусками» (release to tracks)
        • «Управление страницей в магазине» (store presence)
   → Пригласить/Сохранить.
5. Готово. Ключ НЕ коммитить (он уже под .gitignore как *-key.json).
──────────────────────────────────────────────────────────────────────
"""


def service():
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
    if not os.path.exists(KEY_PATH):
        sys.exit(f"НЕТ КЛЮЧА: {KEY_PATH}\n{SETUP_HELP}")
    creds = service_account.Credentials.from_service_account_file(KEY_PATH, scopes=SCOPES)
    return build("androidpublisher", "v3", credentials=creds, cache_discovery=False)


def png_9x16(path):
    """Play требует стороны 320..3840 и отношение не «уже» 9:16 —
    очень длинные скрины (20:9) добиваем брендовым фоном по бокам."""
    from PIL import Image
    im = Image.open(path).convert("RGB")
    w, h = im.size
    if h / w <= 16 / 9 + 0.01:
        return path
    new_w = int(round(h * 9 / 16))
    canvas = Image.new("RGB", (new_w, h), (11, 13, 12))
    canvas.paste(im, ((new_w - w) // 2, 0))
    out = os.path.join(ROOT, "output", "play", os.path.basename(path))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    canvas.save(out, "PNG")
    return out


def cmd_status(svc, args):
    edit = svc.edits().insert(body={}, packageName=PACKAGE).execute()["id"]
    for track in ("internal", "alpha", "beta", "production"):
        try:
            t = svc.edits().tracks().get(packageName=PACKAGE, editId=edit, track=track).execute()
            rels = t.get("releases", [])
            if not rels:
                print(f"{track:12} — пусто")
            for r in rels:
                print(f"{track:12} versionCodes={r.get('versionCodes')} status={r.get('status')} name={r.get('name','')}")
        except Exception as e:
            print(f"{track:12} — n/a ({type(e).__name__})")
    svc.edits().delete(packageName=PACKAGE, editId=edit).execute()


def cmd_listing(svc, args):
    edit = svc.edits().insert(body={}, packageName=PACKAGE).execute()["id"]
    for lang, body in LISTINGS.items():
        svc.edits().listings().update(
            packageName=PACKAGE, editId=edit, language=lang, body=body).execute()
        print(f"listing {lang}: title={body['title']!r} short={len(body['shortDescription'])} симв.")
    finish(svc, edit, args)


def upload_image(svc, edit, image_type, path, lang="en-US"):
    from googleapiclient.http import MediaFileUpload
    media = MediaFileUpload(path, mimetype="image/png", resumable=False)
    svc.edits().images().upload(
        packageName=PACKAGE, editId=edit, language=lang,
        imageType=image_type, media_body=media).execute()
    print(f"  ↑ {image_type}: {os.path.basename(path)}")


def cmd_images(svc, args):
    edit = svc.edits().insert(body={}, packageName=PACKAGE).execute()["id"]
    for image_type, path in (("icon", ICON), ("featureGraphic", FEATURE)):
        if os.path.exists(path):
            upload_image(svc, edit, image_type, path)
        else:
            print(f"  ! нет файла: {path}")
    svc.edits().images().deleteall(
        packageName=PACKAGE, editId=edit, language="en-US", imageType="phoneScreenshots").execute()
    for p in SCREENSHOTS:
        if not os.path.exists(p):
            print(f"  ! нет скрина: {p}")
            continue
        try:
            upload_image(svc, edit, "phoneScreenshots", p)
        except Exception as e:
            print(f"  … {os.path.basename(p)} отклонён ({e.__class__.__name__}), добиваю до 9:16")
            upload_image(svc, edit, "phoneScreenshots", png_9x16(p))
    finish(svc, edit, args)


def cmd_upload(svc, args):
    from googleapiclient.http import MediaFileUpload
    edit = svc.edits().insert(body={}, packageName=PACKAGE).execute()["id"]
    media = MediaFileUpload(args.aab, mimetype="application/octet-stream", resumable=True)
    bundle = svc.edits().bundles().upload(
        packageName=PACKAGE, editId=edit, media_body=media).execute()
    vc = bundle["versionCode"]
    print(f"AAB загружен: versionCode={vc}")
    svc.edits().tracks().update(
        packageName=PACKAGE, editId=edit, track=args.track,
        body={"releases": [{
            "versionCodes": [str(vc)],
            "status": "completed",
            "releaseNotes": [{"language": "en-US", "text": args.notes}],
        }]}).execute()
    print(f"трек {args.track}: раскатан {vc}")
    finish(svc, edit, args)


def cmd_promote(svc, args):
    # Пока приложение не опубликовано ни разу, оно числится черновиком, и API
    # принимает для него только релизы со статусом draft: «Only releases with
    # status draft may be created on draft app». Такой релиз закрывает пункт
    # «Создайте и опубликуйте выпуск», после чего в Console разблокируется
    # «Отправить приложение на проверку» — первую публикацию подтверждает
    # владелец аккаунта. Для последующих обновлений статус completed работает
    # как обычно (раскатка сразу после одобрения).
    status = "draft" if args.draft else "completed"
    edit = svc.edits().insert(body={}, packageName=PACKAGE).execute()["id"]
    svc.edits().tracks().update(
        packageName=PACKAGE, editId=edit, track="production",
        body={"releases": [{
            "versionCodes": [str(args.version_code)],
            "status": status,
            "releaseNotes": [{"language": "en-US", "text": args.notes}],
        }]}).execute()
    print(f"PRODUCTION: versionCode={args.version_code} · status={status}")
    finish(svc, edit, args)


def finish(svc, edit, args):
    if args.commit:
        svc.edits().commit(packageName=PACKAGE, editId=edit).execute()
        print("✅ COMMIT — изменения ушли в Play")
    else:
        svc.edits().delete(packageName=PACKAGE, editId=edit).execute()
        print("(dry-run: изменения отменены; добавь --commit чтобы применить)")


def main():
    ap = argparse.ArgumentParser(description="Vector → Google Play")
    ap.add_argument("--help-setup", action="store_true", help="как получить ключ доступа")
    sub = ap.add_subparsers(dest="cmd")
    for name in ("status", "listing", "images"):
        p = sub.add_parser(name)
        p.add_argument("--commit", action="store_true")
    p = sub.add_parser("upload")
    p.add_argument("--aab", required=True)
    p.add_argument("--track", default="internal")
    p.add_argument("--notes", default="i18n fixes")
    p.add_argument("--commit", action="store_true")
    p = sub.add_parser("promote")
    p.add_argument("--version-code", required=True, type=int)
    p.add_argument("--notes", default="First public release")
    p.add_argument("--draft", action="store_true", help="релиз в статусе draft (обязательно для ещё не опубликованного приложения)")
    p.add_argument("--commit", action="store_true")
    args = ap.parse_args()
    if args.help_setup or not args.cmd:
        print(SETUP_HELP)
        return
    svc = service()
    {"status": cmd_status, "listing": cmd_listing, "images": cmd_images,
     "upload": cmd_upload, "promote": cmd_promote}[args.cmd](svc, args)


if __name__ == "__main__":
    main()
