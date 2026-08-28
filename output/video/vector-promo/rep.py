# -*- coding: utf-8 -*-
"""Replicate REST helper (без SDK): POST /v1/models/{owner}/{model}/predictions + Prefer: wait."""
import json, os, ssl, sys, time, urllib.request, urllib.error

TOKEN = os.environ.get("REPLICATE_API_TOKEN") or ""
CTX = ssl.create_default_context()
HERE = os.path.dirname(os.path.abspath(__file__))


def _req(url, data=None, method="GET", extra_headers=None, timeout=900):
    h = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json",
     "User-Agent": "vector-promo/1.0 (claude-code)"}
    if extra_headers:
        h.update(extra_headers)
    body = json.dumps(data).encode("utf-8") if data is not None else None
    r = urllib.request.Request(url, data=body, headers=h, method=method)
    try:
        with urllib.request.urlopen(r, context=CTX, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:600]
        raise RuntimeError(f"HTTP {e.code}: {detail}") from None


def run(model, inp, wait=900, poll_note=""):
    """model: 'owner/name'. Возвращает output (str | list)."""
    url = f"https://api.replicate.com/v1/models/{model}/predictions"
    p = _req(url, {"input": inp}, "POST", {"Prefer": "wait=60"})
    t0 = time.time()
    while p.get("status") in ("starting", "processing"):
        if time.time() - t0 > wait:
            raise RuntimeError(f"timeout {wait}s, id={p.get('id')}")
        time.sleep(6)
        p = _req(p["urls"]["get"])
        if poll_note:
            print(f"  … {poll_note} {p['status']} {int(time.time()-t0)}s", flush=True)
    if p.get("status") != "succeeded":
        raise RuntimeError(f"{p.get('status')}: {str(p.get('error'))[:400]}")
    print(f"  ok {model} за {p.get('metrics',{}).get('predict_time',0):.1f}s", flush=True)
    return p["output"]


def save(url, path):
    """Скачать результат в файл."""
    path = path if os.path.isabs(path) else os.path.join(HERE, path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with urllib.request.urlopen(url, context=CTX, timeout=600) as r, open(path, "wb") as f:
        f.write(r.read())
    print(f"  сохранено: {os.path.relpath(path, HERE)} ({os.path.getsize(path)//1024} KB)")
    return path


def upload(path):
    """Файл -> публичный URL через Replicate Files API (для reference_images)."""
    import uuid
    boundary = uuid.uuid4().hex
    name = os.path.basename(path)
    _ct = {".mp4": "video/mp4", ".mov": "video/quicktime", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".wav": "audio/wav", ".mp3": "audio/mpeg"}
    ctype = _ct.get(os.path.splitext(name)[1].lower(), "application/octet-stream")
    with open(path, "rb") as f:
        content = f.read()
    body = (
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"content\"; filename=\"{name}\"\r\n"
        f"Content-Type: {ctype}\r\n\r\n".encode() + content +
        f"\r\n--{boundary}--\r\n".encode()
    )
    r = urllib.request.Request(
        "https://api.replicate.com/v1/files", data=body, method="POST",
        headers={"Authorization": f"Bearer {TOKEN}",
                 "Content-Type": f"multipart/form-data; boundary={boundary}"})
    with urllib.request.urlopen(r, context=CTX, timeout=600) as resp:
        out = json.loads(resp.read().decode())
    return out["urls"]["get"]
