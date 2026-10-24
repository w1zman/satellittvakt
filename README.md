# Satellittvakt Narvik

Satellittene over Narvik og Tromsø i sanntid, i 3D: Starlink, rakettrinn og romstasjoner, med de neste klare passeringene.

Siden ligger på GitHub Pages. Banedataene hentes fra [CelesTrak](https://celestrak.org) to ganger i døgnet av jobben i `.github/workflows/oppdater-banedata.yml`, og siden regner ut posisjonene i nettleseren.

- `index.html` – selve siden
- `visual.csv`, `starlink-polar.txt`, `meta.json` – banedata (oppdateres automatisk)
- `tools/` – skriptene som bygger datafilene

## Endre siden
Kildekoden ligger i `src/` (`template.html`, `app.js`, `orb.js`). Etter endringer: `python3 src/build.py` lager `index.html` på nytt.
