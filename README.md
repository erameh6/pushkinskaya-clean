# Прогулка по Пушкинской — Pushkinskaya Street Tourist Guide

A web app that helps tourists explore Pushkinskaya Street in Rostov-on-Don. Point a
phone camera at a historical building or monument and the app identifies it and shows
its history. Covers the three assignment tasks:

1. **Collected tourist-site information** — historical buildings and monuments only.
   Military buildings are excluded by design (see `src/sites.js`).
2. **Photos from various angles** — you capture these on-site with the calibration tool.
   The app never photographs or stores military buildings.
3. **Camera-based identification** — the app recognises a site from the camera image
   and loads its textual description.

## Your photos serve TWO purposes (both now built in)

When you photograph the sites, the same photos are used two ways:

**1. Display photos (how the app looks).** Drop your photos into the folder for each
site and they show up automatically in the catalogue and in the identification result —
no code editing. The folders already exist:

```
public/sites/pushkin-monument/
public/sites/paramonov-mansion/
public/sites/fine-arts-museum/
public/sites/bakulin-house/
public/sites/betani-house/
public/sites/pushkin-spheres/
public/sites/squirrel-sculpture/
public/sites/four-lions/
```

Put 3–5 photos in each (`.jpg`, `.jpeg`, `.png`, or `.webp`). Name them `1.jpg`,
`2.jpg`, `3.jpg` — they display in filename order. Each folder has a
`PUT-PHOTOS-HERE.txt` reminding you which site it is. The server scans these folders on
each request, so new photos appear after a page refresh. Empty folders show a polite
"photos coming after the on-site shoot" note instead of breaking.

**2. Recognition signatures (how it identifies buildings).** Open `/calibrate.html`,
pick a site, upload the same photos, and save. This converts them into a colour
signature used to recognise the building from the camera. (Details below.)

So the workflow on the street is: photograph a site → drop the files in its folder for
display → upload them in the calibration tool for recognition. Same photos, both jobs.

## Recognition: how it works

The app identifies a site two ways, combined into one confidence score:

- **GPS narrowing.** Each site has real coordinates. Your phone's location filters to
  sites within 150 m. This alone identifies sites reliably on the street.
- **Image colour-signature matching.** Each site is represented by a normalised colour
  histogram (a 4×4×4 = 64-bucket distribution) averaged over several reference photos.
  The camera frame is reduced to the same kind of signature and compared with a
  Bhattacharyya coefficient. It's lightweight, runs on any phone, needs no GPU or large
  model, and is fully explainable — which matters for a defence.

## Run with Docker

The app is containerized, so it runs identically on any machine with Docker — no
installing Node or matching versions.

Easiest (one command, with persistent calibration data and live photo folders):
```bash
docker compose up
```
Then open http://localhost:4000. Stop with Ctrl+C (or `docker compose up -d` to run in
the background).

Or with plain Docker:
```bash
docker build -t pushkinskaya .
docker run -p 4000:4000 -v "$(pwd)/signatures.json:/app/signatures.json" pushkinskaya
```

The volume mounts mean your calibration (`signatures.json`) and any photos you add to
`public/sites/` persist across restarts and rebuilds — this is the container answer to
the "data resets on redeploy" limitation of free hosting tiers.

Note: Docker packages and runs the app; it does not by itself give you a public URL or
HTTPS. To expose it on the internet you still run the container on a host (a VPS, etc.)
and put it behind a reverse proxy with a certificate — the same Nginx + Certbot steps
as the VPS deployment below.

## Run locally (without Docker)

```bash
npm install
npm start
```
Open http://localhost:4000

- Main app: the **Камера** tab (needs camera + location permission — works best on a
  phone, or any laptop with a webcam).
- Catalogue: **Все объекты** lists every site with full text.
- Calibration: http://localhost:4000/calibrate.html

**Camera + GPS need HTTPS on phones.** On localhost it works; once deployed, use the
https URL (Render gives you one — see below).

## Deploy on Render

1. Push to GitHub.
2. Render → New + → Web Service → connect the repo.
3. Build: `npm install` · Start: `npm start` · Free instance.
4. Open the https URL on your phone, allow camera + location, and walk the street.

Note: `signatures.json` (your calibration) lives on disk and resets on redeploy on the
free tier — calibrate in the same session as your demo, or add a Render persistent disk.

## Sites included (Task 1)

Monument to Pushkin (1959) · Paramonov Mansion / ZNB SFU library (1914) · Regional Museum
of Fine Arts (1898) · Bakulin House (late 19th c.) · Betani House (1904) · Pushkin Spheres ·
Squirrel sculpture (2023) · Four Lions sculpture. All historical/cultural; no military.

## Project structure

```
pushkinskaya/
├── public/
│   ├── index.html       # tourist app: camera identify + catalogue
│   └── calibrate.html   # build recognition signatures from your photos
├── src/
│   ├── server.js        # API: /sites, /identify, /calibrate
│   ├── sites.js         # Task 1 data — real sites, no military
│   └── recognition.js   # histogram + similarity + GPS distance math
└── package.json
```

## API

| Method | Path | Purpose |
|--------|------|---------|
| GET  | `/api/sites` | List all sites |
| GET  | `/api/sites/:id` | One site |
| POST | `/api/identify` | Identify from `{lat,lng,histogram}` → ranked candidates |
| POST | `/api/calibrate` | Save a site's colour signature from your photos |
