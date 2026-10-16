"""Render public/world-map.jpg from Natural Earth 50m land polygons.

Grayscale, coastlines-only style: mid-gray filled land on white.
Equirectangular, exact +-180/+-90 extent, so the SVG grid overlay in
src/ui/world.ts registers pixel-perfectly by construction.

Usage: python3 scripts/render-world-map.py
Input: scripts/raw/ne_50m_land.geojson (git-ignored; see scripts/raw/README.md)
Output: public/world-map.jpg (committed)
"""
import json
import os
import sys

from PIL import Image, ImageDraw

W, H = 1120, 560
LAND_FILL = (140, 140, 140)
OCEAN_FILL = (255, 255, 255)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "scripts", "raw", "ne_50m_land.geojson")
OUT = os.path.join(ROOT, "public", "world-map.jpg")


def project(lon, lat):
    x = (lon + 180.0) / 360.0 * W
    y = (90.0 - lat) / 180.0 * H
    return (x, y)


def rings_of(geom):
    if geom["type"] == "Polygon":
        return geom["coordinates"]
    if geom["type"] == "MultiPolygon":
        return [ring for poly in geom["coordinates"] for ring in poly]
    return []


def main():
    if not os.path.exists(RAW):
        sys.exit(f"missing {RAW} (see scripts/raw/README.md)")
    with open(RAW, encoding="utf-8") as f:
        land = json.load(f)
    img = Image.new("RGB", (W, H), OCEAN_FILL)
    draw = ImageDraw.Draw(img)
    count = 0
    for feature in land["features"]:
        for ring in rings_of(feature["geometry"]):
            pts = [project(x, y) for x, y in ring]
            # Split segments jumping the antimeridian to avoid streaks.
            run = [pts[0]]
            runs = []
            for p in pts[1:]:
                if abs(p[0] - run[-1][0]) > W / 2:
                    runs.append(run)
                    run = [p]
                else:
                    run.append(p)
            runs.append(run)
            for r in runs:
                if len(r) >= 3:
                    draw.polygon(r, fill=LAND_FILL)
                    count += 1
    img.save(OUT, "JPEG", quality=72, optimize=True)
    size_kb = os.path.getsize(OUT) / 1024
    print(f"wrote {OUT} ({size_kb:.0f} KB, {count} rings)")


if __name__ == "__main__":
    main()
