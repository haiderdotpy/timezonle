# How to manually refresh the GeoNames raw dump (when network is blocked).
#
# 1. Download from https://download.geonames.org/export/dump/ :
#      - cities15000.zip   (all cities with population > 15,000)
#      - admin1CodesASCII.txt (admin1 region names)
# 2. Unzip cities15000.zip and place the files here as:
#      - scripts/raw/cities15000.txt
#      - scripts/raw/admin1CodesASCII.txt
# 3. Run: npm run data:all
#
# Attribution: GeoNames data is licensed CC BY 4.0
# (https://creativecommons.org/licenses/by/4.0/). A credit footer is
# included in the app UI.
#
# Map picture (for scripts/render-world-map.py, when network is blocked):
# 1. Land: ne_50m_land.geojson from
#    https://www.naturalearthdata.com/downloads/50m-physical-vectors/50m-land/
# 2. Place it here as scripts/raw/ne_50m_land.geojson, then run:
#    python3 scripts/render-world-map.py
#
# Raw downloads are git-ignored; only scripts/raw/README.md is committed.
