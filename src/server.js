// src/server.js
require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { SITES } = require('./sites');
const { similarity, metersBetween } = require('./recognition');

const app = express();
app.use(express.json({ limit: '8mb' })); // query histograms are small, but allow headroom
app.use(express.static(path.join(__dirname, '..', 'public')));

// Load any calibrated signatures saved by the calibration tool (optional file).
const SIG_FILE = path.join(__dirname, '..', 'signatures.json');
function loadSignatures() {
  try {
    const saved = JSON.parse(fs.readFileSync(SIG_FILE, 'utf8'));
    for (const s of SITES) {
      if (saved[s.id]) { s.colorSignature = saved[s.id].colorSignature; s.photos = saved[s.id].photos || []; }
    }
    console.log('[sig] Loaded calibrated signatures.');
  } catch {
    console.log('[sig] No signatures.json yet — running on GPS only until you calibrate.');
  }
}
loadSignatures();

// Scan public/sites/<id>/ for image files you've dropped in. Any .jpg/.jpeg/.png/.webp
// becomes a displayable photo. No code editing needed — just add files to the folder.
function imagesForSite(id) {
  const dir = path.join(__dirname, '..', 'public', 'sites', id);
  try {
    return fs.readdirSync(dir)
      .filter(f => /\.(jpe?g|png|webp)$/i.test(f))
      .sort()
      .map(f => `/sites/${id}/${encodeURIComponent(f)}`);
  } catch {
    return [];
  }
}

// List all sites (for the catalogue screen)
app.get('/api/sites', (req, res) => {
  res.json(SITES.map(s => ({
    id: s.id, name: s.name, nameEn: s.nameEn, type: s.type,
    address: s.address, addressEn: s.addressEn, year: s.year,
    authors: s.authors, authorsEn: s.authorsEn, text: s.text, textEn: s.textEn,
    lat: s.lat, lng: s.lng, hasSignature: !!s.colorSignature,
    images: imagesForSite(s.id)
  })));
});

// One site by id
app.get('/api/sites/:id', (req, res) => {
  const s = SITES.find(x => x.id === req.params.id);
  if (!s) return res.status(404).json({ error: 'Site not found.' });
  res.json({ ...s, images: imagesForSite(s.id) });
});

// -------------------------------------------------------------------------
// IDENTIFY: the core feature. Client sends an optional GPS position and an
// optional color histogram of the camera frame. We combine them:
//   1) GPS narrows to nearby sites (if location given).
//   2) Image signature ranks the candidates (if calibrated + histogram given).
// Returns a ranked list with confidence so the UI can show the best guess.
// -------------------------------------------------------------------------
app.post('/api/identify', (req, res) => {
  const { lat, lng, histogram, mode } = req.body || {};
  // mode: 'auto' (default, blends GPS+image), 'image' (ignore GPS), 'gps' (ignore image)

  let candidates = SITES.map(s => ({ site: s, gpsMeters: null, imageScore: null }));

  // Step 1: GPS narrowing — skipped in image-only mode
  const useGps = mode !== 'image' && typeof lat === 'number' && typeof lng === 'number';
  if (useGps) {
    candidates.forEach(c => { c.gpsMeters = metersBetween(lat, lng, c.site.lat, c.site.lng); });
    candidates.sort((a, b) => a.gpsMeters - b.gpsMeters);
    // keep sites within 150 m; if none, keep nearest 3 as a fallback
    const near = candidates.filter(c => c.gpsMeters <= 150);
    candidates = near.length ? near : candidates.slice(0, 3);
  }

  // Step 2: image signature ranking — skipped in gps-only mode
  const useImage = mode !== 'gps' && Array.isArray(histogram);
  if (useImage) {
    candidates.forEach(c => {
      c.imageScore = c.site.colorSignature ? similarity(histogram, c.site.colorSignature) : null;
    });
  }

  // Combine into a single confidence score.
  const scored = candidates.map(c => {
    let conf;
    if (c.imageScore != null && c.gpsMeters != null) {
      const gpsConf = Math.max(0, 1 - c.gpsMeters / 150);       // closer = better
      conf = 0.5 * gpsConf + 0.5 * c.imageScore;                // blend both
    } else if (c.imageScore != null) {
      conf = c.imageScore;
    } else if (c.gpsMeters != null) {
      conf = Math.max(0, 1 - c.gpsMeters / 150);
    } else {
      conf = 0;
    }
    return {
      id: c.site.id, name: c.site.name, nameEn: c.site.nameEn, type: c.site.type,
      address: c.site.address, addressEn: c.site.addressEn, year: c.site.year,
      authors: c.site.authors, authorsEn: c.site.authorsEn, text: c.site.text, textEn: c.site.textEn,
      images: imagesForSite(c.site.id),
      distanceMeters: c.gpsMeters != null ? Math.round(c.gpsMeters) : null,
      imageScore: c.imageScore != null ? Number(c.imageScore.toFixed(3)) : null,
      confidence: Number(conf.toFixed(3))
    };
  }).sort((a, b) => b.confidence - a.confidence);

  res.json({ best: scored[0] || null, candidates: scored.slice(0, 5) });
});

// Save calibrated signatures (used by the calibration tool, public/calibrate.html)
app.post('/api/calibrate', (req, res) => {
  const { id, colorSignature, photo } = req.body || {};
  const s = SITES.find(x => x.id === id);
  if (!s) return res.status(404).json({ error: 'Site not found.' });

  s.colorSignature = colorSignature;
  if (photo) { s.photos = s.photos || []; if (s.photos.length < 5) s.photos.push(photo); }

  const out = {};
  for (const site of SITES) {
    if (site.colorSignature) out[site.id] = { colorSignature: site.colorSignature, photos: site.photos };
  }
  fs.writeFileSync(SIG_FILE, JSON.stringify(out));
  res.json({ ok: true, calibrated: Object.keys(out).length });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Pushkinskaya guide running on http://localhost:${PORT}`));
