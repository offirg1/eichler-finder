#!/usr/bin/env python3
"""One-time batch geocoder: adds an approximate centroid to each tract in data/tracts.json.

Tries each street listed for the tract against Nominatim (OpenStreetMap) until one
resolves; falls back to a city-level point. Respects the 1 req/sec usage policy.

Usage: python3 tools/geocode_tracts.py
"""
import json
import re
import subprocess
import sys
import time
import urllib.parse
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data" / "tracts.json"
UA = "EichlerFinder/0.1 (https://eichler-finder.vercel.app; offirg@gmail.com)"
CITY_FIX = {"Granada Hills (Los Angeles)": "Granada Hills, Los Angeles"}


def nominatim(query, prefer_city=None):
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
        {"q": query, "format": "jsonv2", "limit": 5, "countrycodes": "us"}
    )
    out = subprocess.run(
        ["curl", "-sf", "--max-time", "20", "-A", UA, url],
        capture_output=True, text=True,
    )
    time.sleep(1.2)  # usage policy: max 1 request/second
    if out.returncode != 0 or not out.stdout:
        return None
    results = json.loads(out.stdout)
    if not results:
        return None
    # streets often exist in several cities: prefer the hit naming the expected city
    if prefer_city:
        for r in results:
            if prefer_city.lower() in r["display_name"].lower():
                results = [r]
                break
    return (float(results[0]["lat"]), float(results[0]["lon"]))


def street_candidates(streets_text):
    if not streets_text:
        return []
    text = re.sub(r"\([^)]*\)", "", streets_text)
    parts = re.split(r"[,;]", text)
    suffix = r"(Dr|Ave|Way|Rd|Ct|Ln|Blvd|St|Pkwy|Cir|Pl)\.?$"
    return [p.strip() for p in parts if re.search(suffix, p.strip())]


def main():
    data = json.loads(DATA.read_text())
    for tract in data["tracts"]:
        if tract.get("centroid"):
            continue
        city = CITY_FIX.get(tract["city"], tract["city"])
        found = None
        precision = "street"
        for street in street_candidates(tract.get("streets", "")):
            found = nominatim(f"{street}, {city}, California, USA", prefer_city=city.split(",")[0])
            if found:
                break
        if not found:
            found = nominatim(f"{city}, California, USA")
            precision = "city"
        if not found:
            print(f"  FAILED: {tract['id']}", file=sys.stderr)
            continue
        tract["centroid"] = [round(found[0], 5), round(found[1], 5)]
        tract["centroidPrecision"] = precision
        print(f"  {tract['id']}: {tract['centroid']} ({precision})")
    DATA.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    print("done")


if __name__ == "__main__":
    main()
