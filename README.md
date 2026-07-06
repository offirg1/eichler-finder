# Eichler Finder

A website that helps people identify which Eichler home model they live in.

**How it works:** Eichler built his ~11,000 homes in named tracts, and each tract used a small set of models. So identification is a funnel: pick your neighborhood (→ architect, years, era), answer three visual questions (front door, roof, stories), and get your likely **model family** — plus instructions for finding your exact plan number.

## Running it

It's a plain static site — no build step. Any web server works:

```sh
cd "eichler finder"
python3 -m http.server 8420
# open http://localhost:8420
```

## Structure

- `index.html` — the single-page app (3 steps: neighborhood → quiz → result)
- `data/tracts.json` — the tract database: ~55 Eichler neighborhoods with city, region, years, architects, approximate home counts, streets, and notes
- `data/model-families.json` — the 7 model families (Early Flat-Top, Low-Gable Classic, Gallery, Courtyard, Atrium, Double A-Frame, Two-Story) with eras, telltale signs, and the quiz definition
- `js/app.js` — tract picker, quiz scoring, era cross-check against the selected tract
- `css/style.css` — mid-century-styled theme

## Data status & sources

All tract entries are marked `"verified": false` — years and counts are compiled from public secondary sources and need cross-checking, ideally against the original site plans:

- **UC Berkeley Environmental Design Archives — [Oakland & Imada Eichler site plans](https://ced.berkeley.edu/collections/eichler-site-plans-oakland-and-imada-virtual-collection)** ([Virtual Collections Portal](https://virtualcollections.ced.berkeley.edu/)): scanned site plans for 36 tracts with the model number for every lot. This is the source for a future address → exact model lookup. Facts transcribed from the plans (lot → model number) are not copyrightable; reproducing the scanned images would need permission (designarchives@berkeley.edu).
- [Mid-Mod Homes neighborhood taxonomy](https://www.midmodhomes.com/blog/comprehensive-geographic-and-architectural-taxonomy-of-joseph-eichlers-northern-california-developments-a-spatial-analysis-and-neighborhood-inventory) — basis for most NorCal tract entries
- [Eichler Network](https://www.eichlernetwork.com) — plan numbering systems, tract histories
- [USModernist Eichler catalog](https://www.usmodernist.org/eichler.htm) — individual homes with plan references
- [Eichler Tracts of Orange StoryMap](https://storymaps.arcgis.com/stories/c5f913f6197c4e5f96e68a08162e3687) — SoCal tracts

## Address lookup

The address box geocodes what the user types via [Nominatim](https://nominatim.org) (OpenStreetMap, no API key) and matches against the tract database in two passes:

1. **Street match** (confident): the geocoded street name, normalized, appears in a tract's street list — and the city agrees or the point is within 5 km (unincorporated areas like Lucas Valley geocode under different place names).
2. **Proximity match** (likely/nearby): distance to each tract's centroid — under 1.2 km with a street-precision centroid is "very likely", under 3 km is "closest known tract".

Centroids live in `tracts.json` (`centroid` + `centroidPrecision`), generated once by `tools/geocode_tracts.py` (1 req/sec, curl-based). Tracts marked `centroidPrecision: "city"` still need real anchor streets for precise matching.

## Roadmap

1. ~~**MVP:** tract picker + visual quiz → model family~~ ✅
2. ~~**Address lookup:** geocode the user's address, auto-detect the tract~~ ✅ (centroid-based; boundary polygons would be the next refinement)
3. **Then:** per-lot model numbers — transcribe the Berkeley site plans for a few flagship tracts (Greenmeadow, San Mateo Highlands, the Orange tracts) into a `homes` table; add a "confirm/correct my model" button so owners crowdsource the rest
4. **Later:** photo-based identification, floor-plan galleries per model
