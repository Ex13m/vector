# -*- coding: utf-8 -*-
"""Создаёт разовый товар «полная версия» в Google Play.

Цены не выдумываем: спрашиваем у Google матрицу под базовые $4.99 — она даёт
привычные для каждого рынка суммы (129.99 CZK, 4.99 EUR, 22.99 PLN), а не
пересчёт по курсу.

ID товара совпадает с PRODUCT_ID в src/lib/billing.ts и menять его нельзя:
Play не позволяет ни переименовать, ни переиспользовать id.

Запуск:
  python scripts/create-product.py            # показать, что будет создано
  python scripts/create-product.py --commit   # создать
"""
import argparse
import importlib.util
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("pp", os.path.join(HERE, "play-publish.py"))
pp = importlib.util.module_from_spec(spec)
sys.modules["pp"] = pp
spec.loader.exec_module(pp)

PRODUCT_ID = "vektor_full_unlock"
BASE_PRICE = {"currencyCode": "USD", "units": "4", "nanos": 990000000}

# Заголовок и описание видит покупатель в окне оплаты Google Play.
LISTINGS = [
    {
        "languageCode": "en-US",
        "title": "Vector — full version",
        "description": "Unlimited rides. One-time purchase, no subscription, no ads.",
    },
    {
        "languageCode": "ru-RU",
        "title": "Vector — полная версия",
        "description": "Поездки без ограничений. Разовая покупка, без подписки и рекламы.",
    },
    {
        "languageCode": "de-DE",
        "title": "Vector — Vollversion",
        "description": "Unbegrenzte Fahrten. Einmalkauf, kein Abo, keine Werbung.",
    },
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--commit", action="store_true", help="создать товар (без флага — только показать)")
    args = ap.parse_args()

    svc = pp.service()
    mon = svc.monetization()

    existing = mon.onetimeproducts().list(packageName=pp.PACKAGE).execute().get("oneTimeProducts", [])
    if any(p.get("productId") == PRODUCT_ID for p in existing):
        sys.exit(f"Товар {PRODUCT_ID} уже существует — создавать повторно нельзя.")

    conv = mon.convertRegionPrices(packageName=pp.PACKAGE, body={"price": BASE_PRICE}).execute()
    prices = conv.get("convertedRegionPrices", {})
    # Версию регионов берём из ответа, а не константой: список стран и их валюты
    # меняются (Болгария перешла на евро — с версией 2022/02 Play ждал левы и
    # отклонял цену), и Google в этом же ответе сообщает актуальную.
    regions_version = conv.get("regionVersion", {}).get("version", "2022/02")
    if not prices:
        sys.exit("Google не вернул цены — проверь платёжный профиль.")

    regions = [
        {"regionCode": code, "price": data["price"], "availability": "AVAILABLE"}
        for code, data in sorted(prices.items())
        if data.get("price")
    ]

    body = {
        "packageName": pp.PACKAGE,
        "productId": PRODUCT_ID,
        "listings": LISTINGS,
        "purchaseOptions": [{
            "purchaseOptionId": "buy",
            "state": "ACTIVE",
            # Разовая покупка навсегда. multiQuantity выключен: две «полные
            # версии» одному человеку не нужны, а включённая опция путает.
            "buyOption": {"legacyCompatible": True, "multiQuantityEnabled": False},
            "regionalPricingAndAvailabilityConfigs": regions,
        }],
        "regionsVersion": {"version": regions_version},
        "taxAndComplianceSettings": {"isTokenizedDigitalAsset": False},
    }

    def money(m):
        return f"{int(m.get('units', 0)) + int(m.get('nanos', 0)) / 1e9:.2f} {m['currencyCode']}"

    print(f"товар:  {PRODUCT_ID}")
    print(f"тип:    разовая покупка (Buy), состояние ACTIVE")
    print(f"языков: {len(LISTINGS)} · регионов: {len(regions)} · версия регионов: {regions_version}")
    for c in ("CZ", "US", "DE", "PL", "GB"):
        if c in prices:
            print(f"  {c}: {money(prices[c]['price'])}")

    if not args.commit:
        print("\n(предпросмотр: добавь --commit чтобы создать)")
        return

    # Отдельного create в API нет — товар заводится через patch с allowMissing:
    # тот же вызов и создаёт, и обновляет.
    created = mon.onetimeproducts().patch(
        packageName=pp.PACKAGE,
        productId=PRODUCT_ID,
        regionsVersion_version=regions_version,
        allowMissing=True,
        updateMask="listings,purchaseOptions,taxAndComplianceSettings",
        body=body,
    ).execute()
    print(f"\n✅ СОЗДАН: {created.get('productId')}")
    for po in created.get("purchaseOptions", []):
        print(f"   опция {po.get('purchaseOptionId')}: {po.get('state')}")


if __name__ == "__main__":
    main()
