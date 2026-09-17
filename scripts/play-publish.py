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
    'en-US': {
        "title": 'Bike Compass GPS: Vector',
        "shortDescription": 'Voice compass navigation for cycling. Screen off, offline maps, GPS on.',
        "fullDescription": """Vector is a bike compass with a voice, not a turn-by-turn navigator. Drop a waypoint on the map, lock the phone, put it in your pocket and ride. Every few minutes a voice tells you where the target is, clock-style: "target at 3 o'clock, 8 kilometers", followed by an estimate of the time left.

Two o'clock means bear right. Twelve means straight on. Six means you are riding away from it. That is the whole interface: compass navigation, spoken out loud, at an interval you choose. All it needs is your phone's GPS. Stop drawing, start talking.

<b>Compass navigation for cycling, not turn-by-turn</b>
Vector takes your position and heading from GPS and gives you the bearing: the straight-line direction to your waypoint, as the crow flies. Alleys, park paths, gravel tracks: take any of them and the voice keeps pointing at the target from wherever you end up. A dead-end courtyard costs you nothing, because there is no route to break and nothing to recalculate. Head away from the target for too long and the app says so.

<b>Why the screen stays off</b>
Riding with the screen off is the point of this app, not a side effect. Voice navigation from a pocket means the display stays dark and no map is being redrawn; a phone that is not lighting a screen for hours is simply doing less work. Your eyes stay on the traffic and on the surface in front of you, where a cyclist needs them.

<b>A beacon on the point where you started</b>
Set the waypoint on the spot you set off from and Vector becomes a way home. Park the bike or the car at the edge of an unfamiliar city and wander off. Leave a tent at a festival. Walk into the woods from a trailhead. However tangled the way out was, back to start is one direction and one distance, repeated as often as you ask. Cycling or hiking makes no difference to a bearing, so the same compass navigation walks you back to the camp, the trailhead, or the car in a big parking lot.

<b>Offline maps</b>
Before you leave, while you still have a connection, cache the map along your route: download the tiles once and ride the whole area with mobile data switched off. Useful abroad, in a forest, in a valley with no signal. The compass guidance never needed a connection anyway, since GPS works without mobile data; the offline map is there for when you do want to look at it.

<b>Ride log and GPX export</b>
- Every ride saved with its track, distance and time
- Any ride exports as a GPX file, the standard format fitness apps and services read
- Change the target while you are moving, or continue a ride you finished earlier
- Aiming mode: hold the phone up, turn on the spot, stop when the target is ahead
- A bearing works the same whether you ride or walk: cycling, gravel, hiking
- English, Russian and German, both interface and voice

<b>Five rides free, then one payment</b>
The first five rides are free, and they are the whole app rather than a demo. After that Vector is a single purchase, at the price shown above in your own currency, and it stays yours. No subscription, no ads, no account, no registration. Change phones and it comes back under the same Google account.

<b>Location and privacy</b>
Vector needs location while a ride is running, including in the background, because without that permission Android stops delivering location updates the moment the screen goes dark, and a voice that keeps talking from your pocket is the one thing this app exists for. Nothing is uploaded anywhere. We run no server of our own, so your targets and your tracks stay on the phone.

<b>What it is not</b>
Vector will not read out street names or tell you to turn left in 200 meters, and it is not a calculator for measuring the straight-line distance between two points: it keeps telling you where that line points while you move. If you want a route computed for you, this is the wrong app.

Set a target, pocket the phone, and choose your own way there.""",
    },
    'ru-RU': {
        "title": 'Компас для велосипеда: Vector',
        "shortDescription": 'Голосовой компас для велосипеда: GPS-навигация, офлайн-карты, экран выключен.',
        "fullDescription": """Vector — это компас с голосом, а не пошаговый навигатор. Поставьте точку на карте, заблокируйте телефон, уберите его в карман и поезжайте. Раз в несколько минут голос называет, где цель, по циферблату: «цель на 3 часа, 8 километров» — направление, расстояние и оценка оставшегося времени.

Два часа — принять правее. Двенадцать — прямо. Шесть — вы едете от цели. В этом весь интерфейс: голосовая навигация по компасу, с интервалом, который вы выбираете сами. Нужен только GPS телефона.

<b>Компас вместо маршрута</b>
Vector берёт из GPS вашу позицию и курс и называет азимут — направление на цель по прямой. Дворы, парковые дорожки, грунтовка: сворачивайте куда угодно, голос всё равно будет показывать на цель из той точки, где вы оказались. Тупик во дворе ничего не стоит: ломать нечего и пересчитывать нечего, маршрута просто нет. Такой велонавигатор ничего вам не прокладывает — он держит направление. А если вы долго едете в сторону от цели, приложение об этом скажет.

<b>Почему экран выключен</b>
Ехать с погасшим экраном — это и есть смысл приложения, а не побочный режим. Голос из кармана значит, что дисплей не горит и карта не перерисовывается: телефон, который часами не светит экраном, просто делает меньше работы. А глаза остаются на дороге и на покрытии перед колесом — там, где они нужны велосипедисту.

<b>Маяк на точке старта: вернуться к старту</b>
Поставьте цель там, откуда вы стартовали, и Vector станет маяком домой. Оставили велосипед или машину на краю незнакомого города и ушли гулять. Палатка на фестивале. Тропа, с которой вы свернули в лес. Как бы ни петляла дорога обратно, до старта — одно направление и одно расстояние, повторяемые так часто, как попросите. Азимуту всё равно, едете вы или идёте пешком, так что тот же компас выведет обратно к лагерю, к тропе или к машине на большой парковке.

<b>Офлайн-карты</b>
Пока связь ещё есть, закэшируйте карту вдоль маршрута: тайлы скачиваются один раз, дальше можно ехать по всей области с выключенным мобильным интернетом. Полезно за границей, в лесу, в низине без сигнала. Голосовой навигации связь не нужна была и так — GPS работает без интернета; офлайн карты нужны на тот случай, когда вы всё-таки захотите посмотреть на экран.

<b>Журнал поездок и выгрузка GPX</b>
- Каждая поездка сохраняется с треком, дистанцией и временем
- Любую поездку можно выгрузить файлом GPX — это стандартный формат, его читают спортивные приложения и сервисы
- Цель можно менять на ходу, а завершённую поездку — продолжить
- Режим наведения: поднимите телефон, повернитесь на месте и остановитесь, когда услышите, что цель впереди
- Азимуту всё равно, едете вы или идёте: город, гравий, лес
- Три языка интерфейса и голоса: русский, английский, немецкий

<b>Пять поездок бесплатно, дальше разовая покупка</b>
Первые пять поездок бесплатны, и это всё приложение целиком, а не демо. Дальше Vector покупается один раз и навсегда — цену магазин показывает выше, в вашей валюте. Без подписки, без рекламы, без аккаунта и регистрации. Смените телефон — покупка вернётся под тем же аккаунтом Google.

<b>Геолокация и приватность</b>
Vector нужна геолокация во время поездки, в том числе в фоне: без этого разрешения Android перестаёт отдавать координаты, как только гаснет экран, а голос, который продолжает вести из кармана, — ровно то, ради чего приложение и сделано. Никуда ничего не отправляется. Своего сервера у нас нет вообще, поэтому цели и треки остаются на телефоне.

<b>Чего Vector не делает</b>
Он не читает названия улиц и не говорит «через 200 метров направо». И это не калькулятор, который считает расстояние по прямой между двумя точками: Vector не считает прямую, а ведёт по ней, пока вы едете. Если вам нужен проложенный маршрут — это другое приложение.

Поставьте цель, уберите телефон в карман и выбирайте дорогу сами.""",
    },
    'de-DE': {
        "title": 'Luftlinie Kompass: Vector',
        "shortDescription": 'Fahrrad-Navigation per Sprache: Luftlinie zum Ziel, Display aus, offline.',
        "fullDescription": """Vector ist ein Fahrrad-Kompass mit Stimme, kein Turn-by-Turn-Navi. Ziel auf der Karte setzen, Handy sperren, in die Tasche stecken, losfahren. Alle paar Minuten sagt eine Stimme nach Uhrzeit, wo das Ziel liegt: „Ziel auf 3 Uhr, 8 Kilometer“, dazu die geschätzte Restzeit.

Eines gleich vorweg: Vector ist kein Luftlinien-Rechner. Vector misst nicht den Abstand zwischen zwei Punkten auf der Karte, Vector führt dich per Luftlinie, gesprochen, während du fährst. Eine Richtung, eine Entfernung, so oft du willst, bis du da bist.

2 Uhr heißt rechts halten. 12 Uhr heißt geradeaus. 6 Uhr heißt, du fährst vom Ziel weg. Mehr Oberfläche gibt es nicht: Kompass-Navigation als Sprachnavigation, im Intervall deiner Wahl. Es braucht nur das GPS deines Handys.

<b>Navigation per Luftlinie, nicht Turn-by-Turn</b>
Vector nimmt Position und Fahrtrichtung vom GPS und gibt dir die Peilung: die Richtung zum Ziel in Luftlinie. Hinterhöfe, Parkwege, Feldwege: Die Stimme zeigt von jedem Punkt aus wieder aufs Ziel. Eine Sackgasse kostet nichts, weil es keine Route gibt, die kaputtgehen kann. Wer zu lange vom Ziel weg fährt, bekommt es gesagt.

<b>Warum das Display aus bleibt</b>
Fahrradfahren mit ausgeschaltetem Display ist der Sinn dieser App, kein Nebeneffekt. Sprachnavigation aus der Tasche heißt: Der Bildschirm bleibt dunkel, es wird keine Karte gezeichnet. Ein Handy, das stundenlang kein Display beleuchtet, hat schlicht weniger zu tun. Deine Augen bleiben auf dem Verkehr und dem Belag vor dir.

<b>Zurück zum Start</b>
Setz das Ziel auf den Punkt, an dem du losgefahren bist, und Vector wird zur Peilung nach Hause. Das Fahrrad am Rand einer fremden Stadt abstellen, das Zelt auf dem Festival stehen lassen, vom Wanderparkplatz in den Wald gehen. Egal wie verwinkelt der Hinweg war: Zurück zum Start ist eine Richtung und eine Entfernung, so oft angesagt, wie du möchtest. Ob du fährst oder gehst, ist der Peilung egal: Derselbe Kompass bringt dich zum Zeltplatz oder zum Auto auf dem großen Parkplatz zurück.

<b>Offline-Karten</b>
Vor der Tour, solange du Empfang hast, den Bereich entlang der Strecke laden: Kacheln einmal herunterladen und die ganze Gegend ohne mobile Daten fahren. Praktisch im Ausland, im Wald, im Tal ohne Netz. Die Sprachführung braucht ohnehin keine Verbindung, GPS läuft ohne mobile Daten. Die Offline-Karten sind für die Momente, in denen du hinschauen willst.

<b>Fahrtenbuch und GPX-Export</b>
- Jede Fahrt wird mit Track, Distanz und Zeit gespeichert
- GPX-Export für jede Fahrt: das Standardformat, das Fitness-Apps und Portale lesen
- Ziel unterwegs wechseln oder eine beendete Fahrt fortsetzen
- Peilmodus: Handy hochhalten, auf der Stelle drehen, stehen bleiben, wenn das Ziel voraus liegt
- Der Peilung ist egal, ob du fährst oder gehst: Radfahren, Gravel, Wandern
- Deutsch, Englisch und Russisch, Oberfläche und Stimme

<b>Fünf Fahrten gratis, danach einmal zahlen</b>
Die ersten fünf Fahrten sind kostenlos und keine Demo, sondern die ganze App. Danach wird Vector einmalig gekauft und gehört dir — den Preis zeigt der Store oben in deiner Währung. Kein Abo, keine Werbung, kein Konto, keine Registrierung. Neues Handy, gleiches Google-Konto, die Freischaltung kommt zurück.

<b>Standort und Datenschutz</b>
Vector braucht den Standortzugriff, solange eine Fahrt läuft, auch im Hintergrund. Ohne ihn liefert Android keine Standortdaten mehr, sobald das Display dunkel wird, und genau diese Stimme aus der Tasche ist der Grund, warum es Vector gibt. Hochgeladen wird nichts. Wir betreiben keinen eigenen Server, deine Ziele und Tracks bleiben auf dem Handy.

<b>Was Vector nicht ist</b>
Vector liest keine Straßennamen vor und sagt nicht „in 200 Metern links abbiegen“. Es ist auch kein Werkzeug, um eine Luftlinie zu messen oder zu berechnen: Es sagt dir laufend, wohin diese Linie zeigt, während du dich bewegst. Wer eine fertig berechnete Route will, ist hier falsch.

Ziel setzen, Handy einstecken, den Weg selbst wählen.""",
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
