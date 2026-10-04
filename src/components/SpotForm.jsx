import { useState, useRef, useEffect, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './SpotMap.css';
import { theme as t, radius, shadow } from '../theme';
import { uploadAPI, missionAPI, categoryAPI, spotAPI } from '../api/api';
import { notify, confirmAction } from './AppAlert';
import Icon from './Icon';
import { spotHasAR } from '../utils/spotHasAR';

// Fix default marker icons breaking under Vite/webpack bundling
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// Fallback only — the real list comes from GET /api/categories, so an admin can
// add or rename one without a code change. Kept so the form still works if that
// call fails; a spot form with no category chips can't be submitted at all.
const FALLBACK_CATEGORIES = ['Historical', 'Religious', 'Nature', 'Festivals'];

// Map pin colours. Leaflet divIcons are raw HTML strings, so they can't read
// the theme object directly — this is the one place the three map colours are
// written down, and the legend dots below read from it too so a pin and its
// legend swatch can never drift apart. Teal and yellow are the app's own brand
// and accent; blue is just a third hue that stays distinct from both.
const MAP_PIN = {
  spot:    t.brandSolid,  // the tourist spot itself
  mission: t.accent,      // the recommended eatery (mission 2)
  ar:      t.info,        // an AR model's placement
};

const makeId = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

// Default map center: Malolos City, Bulacan
const DEFAULT_CENTER = { lat: 14.8433, lng: 120.8114 };

// ── Coordinate helpers ────────────────────────────────────────────
// Coordinates live in state as raw strings while they're being typed, so
// everything that consumes them has to cope with "", "-", "14." and other
// half-finished input. `toNum` is the single gate: a usable number, or null.
// Never use a bare parseFloat on these — parseFloat("-") is NaN, and handing
// NaN to Leaflet's setLatLng throws.
const toNum = (v) => {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// Coordinates are almost always copied around as one "14.8433, 120.8114"
// string (that's what Google Maps' "copy coordinates" gives you), so pasting
// that into either box fills both rather than making the user split it by hand.
const parseCoordPair = (text) => {
  const m = String(text).trim().match(/^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
};

// Derived, not stored — so the message can never get out of step with the
// values it describes.
function coordError(lat, lng) {
  const check = (v, max, label) => {
    if (v === '' || v == null) return '';
    // Mid-typing states aren't errors yet — don't scold someone for the first
    // keystroke of a negative number.
    if (v === '-' || v === '.' || v === '-.') return '';
    const n = Number(v);
    if (!Number.isFinite(n)) return `${label} must be a number.`;
    if (Math.abs(n) > max) return `${label} must be between -${max} and ${max}.`;
    return '';
  };
  return check(lat, 90, 'Latitude') || check(lng, 180, 'Longitude');
}

// ── Radius rings ──────────────────────────────────────────────────
// Each map draws the radius the app actually uses around the pins it edits,
// so a moderator can see when two of them sit on the same ground.

// How close a traveler must be for the app to count a visit
// (ARRIVAL_RADIUS_METERS in the app's context/ArrivalContext.js). Two spots
// whose pins are under twice this apart overlap: someone standing between
// them arrives at both at once.
const ARRIVAL_RADIUS_M = 50;

// An AR model's trigger radius (BASE_MODEL_RADIUS_METERS in the app's
// Screens/ARScreen.js). For AR pins under twice this apart the app shrinks
// both rings to half the gap, never below AR_MIN_RADIUS_M.
const AR_RADIUS_M = 6;
const AR_MIN_RADIUS_M = 3;

const MISSION_RADIUS_DEFAULT_M = 60;

function distanceM(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const fmtDistance = (m) =>
  m >= 1000 ? `${(m / 1000).toFixed(1)} km` : m < 10 ? `${m.toFixed(1)} m` : `${Math.round(m)} m`;

// Where the app places a spot (getSpotCoords): its pin, then the older
// latitude/longitude fields, then the middle of its AR anchors.
function spotPosition(spot) {
  const c = spot?.coordinates;
  if (toNum(c?.lat) !== null && toNum(c?.lng) !== null) return { lat: toNum(c.lat), lng: toNum(c.lng) };
  if (toNum(spot?.latitude) !== null && toNum(spot?.longitude) !== null) {
    return { lat: toNum(spot.latitude), lng: toNum(spot.longitude) };
  }
  const anchors = (Array.isArray(spot?.modelsCoordinates) ? spot.modelsCoordinates : [])
    .filter((a) => toNum(a?.lat) !== null && toNum(a?.lng) !== null);
  if (!anchors.length) return null;
  return {
    lat: anchors.reduce((sum, a) => sum + Number(a.lat), 0) / anchors.length,
    lng: anchors.reduce((sum, a) => sum + Number(a.lng), 0) / anchors.length,
  };
}

// Pairs of AR pins whose rings overlap. `points` may hold nulls (a pin whose
// coordinates are half-typed); those are skipped but keep their index, so
// i/j still line up with "AR 1", "AR 2"…
function arOverlaps(points) {
  const pairs = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const a = points[i];
      const b = points[j];
      if (!a || !b) continue;
      const distance = distanceM(a.lat, a.lng, b.lat, b.lng);
      if (distance < 2 * AR_RADIUS_M) pairs.push({ i, j, distance });
    }
  }
  return pairs;
}

const missionRadiusOf = (v) => (Number(v) > 0 ? Number(v) : MISSION_RADIUS_DEFAULT_M);

// Rings are SVG paths whose colour comes from a class (SpotMap.css), so an
// overlap is shown by toggling one.
const markClash = (layer, on) => layer?.getElement()?.classList.toggle('is-clash', on);

// ── Editable lat/lng pair ─────────────────────────────────────────
// Clicking the map is the quick way to drop a pin, but coordinates often
// arrive as text — from a tourism office's list, a Google Maps share, or a
// GPS reading taken on site — and hunting for that exact point by clicking is
// both slow and imprecise. These inputs take the numbers directly; the pin on
// the map follows them, and dragging the pin writes back here.
function CoordFields({ lat, lng, onChange, compact = false, disabled = false }) {
  const err = coordError(lat, lng);

  const handle = (which) => (e) => {
    const raw = e.target.value;
    const pair = parseCoordPair(raw);
    if (pair) { onChange(String(pair.lat), String(pair.lng)); return; }
    if (which === 'lat') onChange(raw, lng);
    else onChange(lat, raw);
  };

  const inputStyle = compact ? styles.coordInputSm : styles.coordInput;

  return (
    <div style={compact ? styles.coordWrapSm : styles.coordWrap}>
      <div style={styles.coordRow}>
        <div style={styles.coordField}>
          {!compact && <label style={styles.coordLabel}>Latitude</label>}
          <input
            value={lat ?? ''}
            onChange={handle('lat')}
            disabled={disabled}
            inputMode="decimal"
            placeholder={compact ? 'lat' : '14.8433'}
            aria-label="Latitude"
            style={{ ...inputStyle, ...(err ? styles.coordInputError : {}) }}
            className="modern-input"
          />
        </div>
        <div style={styles.coordField}>
          {!compact && <label style={styles.coordLabel}>Longitude</label>}
          <input
            value={lng ?? ''}
            onChange={handle('lng')}
            disabled={disabled}
            inputMode="decimal"
            placeholder={compact ? 'lng' : '120.8114'}
            aria-label="Longitude"
            style={{ ...inputStyle, ...(err ? styles.coordInputError : {}) }}
            className="modern-input"
          />
        </div>
      </div>
      {err && <p style={styles.coordErrorText}>{err}</p>}
    </div>
  );
}

// Downscales an oversized image client-side before upload. Skips files
// already under the target size — no pointless re-encoding of small
// images. Runs in-browser via canvas, so no extra dependency needed.
function resizeImageFile(file, maxDimension = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const { width, height } = img;

      if (width <= maxDimension && height <= maxDimension) {
        resolve(file); // already small enough
        return;
      }

      const scale   = Math.min(maxDimension / width, maxDimension / height);
      const targetW = Math.round(width * scale);
      const targetH = Math.round(height * scale);

      const canvas = document.createElement('canvas');
      canvas.width  = targetW;
      canvas.height = targetH;
      canvas.getContext('2d').drawImage(img, 0, 0, targetW, targetH);

      canvas.toBlob(
        (blob) => {
          if (!blob) { reject(new Error('Image resize failed')); return; }
          resolve(new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }));
        },
        'image/jpeg',
        quality
      );
    };

    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Could not read image')); };
    img.src = objectUrl;
  });
}

// Must match SPOT_UPLOAD_MAX_BYTES in the backend's routes/uploadRoutes.js.
// Checking here as well isn't belt-and-braces — it's the only check that gives
// a usable message. Server-side, multer stops reading as soon as the limit
// trips, so the response goes out while the browser is still uploading and the
// browser reports the reset connection as a bare "Network Error" with no clue
// that the file was simply too big.
const UPLOAD_MAX_BYTES = 20 * 1024 * 1024;
const formatBytes = (n) =>
  n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;

const fileNameFromUrl = (url) => {
  const name = url.split('?')[0].split('/').pop();
  try { return decodeURIComponent(name); } catch { return name; }
};

// ── Reusable file upload field ────────────────────────────────────
function FileUploadField({ label, required, hint, accept, uploadType, value, onUploaded, previewType = 'image' }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setUploading(true);
    try {
      const isImageUpload = uploadType === 'image' || uploadType === 'badge';
      const fileToUpload = isImageUpload
        ? await resizeImageFile(file, uploadType === 'badge' ? 512 : 1600)
        : file;

      // Images are downscaled above, so this realistically only catches 3D
      // models — which is exactly where it's needed, since a .glb straight out
      // of Blender or Sketchfab is routinely far over the limit.
      if (fileToUpload.size > UPLOAD_MAX_BYTES) {
        setError(
          `This file is ${formatBytes(fileToUpload.size)}, over the ${formatBytes(UPLOAD_MAX_BYTES)} limit. ` +
          // Not Draco: the app's 3D engine can't decode it, so the server refuses those files.
          `Reduce the model's polygon count or texture sizes (JPEG textures are much smaller than PNG), then try again.`
        );
        return;
      }

      const { url } = await uploadAPI.spotMedia(fileToUpload, uploadType);
      onUploaded(url);
    } catch (err) {
      // axios reports anything that never got a response as "Network Error",
      // which on its own tells the moderator nothing they can act on.
      const isNetwork = !err?.response && /network/i.test(err?.message || '');
      setError(
        err?.response?.data?.message ||
        (isNetwork
          ? 'Could not reach the server. Check your connection, and if the file is large try a smaller one — you may also need to sign in again.'
          : err.message) ||
        'Upload failed'
      );
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const thumb =
    previewType === 'badge' ? (
      value ? (
        <img src={value} alt="" style={styles.thumbBadge} onError={() => { setError('Broken link — cleared, please re-upload.'); onUploaded(''); }} />
      ) : (
        <div style={styles.thumbEmpty}>—</div>
      )
    ) : previewType === 'image' ? (
      value ? (
        <img src={value} alt="" style={styles.thumbImg} onError={() => { setError('Broken link — cleared, please re-upload.'); onUploaded(''); }} />
      ) : (
        <div style={styles.thumbEmpty}>—</div>
      )
    ) : (
      <div style={styles.thumbEmpty}>{value ? <Icon name="box" size={18} color={t.textSecondary} /> : '—'}</div>
    );

  return (
    <div style={styles.uploadCard}>
      {thumb}
      <div style={styles.uploadCardBody}>
        <label style={styles.label}>
          {label} {required && <span style={styles.required}>*</span>}
        </label>
        {hint && <p style={styles.hint}>{hint}</p>}

        <div style={styles.uploadRow}>
          <button type="button" onClick={() => inputRef.current?.click()} style={styles.uploadBtn} className="modern-btn" disabled={uploading}>
            {uploading ? 'Uploading…' : value ? 'Replace' : 'Choose file'}
          </button>
          {value && !uploading && (
            <button type="button" onClick={() => onUploaded('')} style={styles.clearBtn} className="modern-btn">Remove</button>
          )}
          <input ref={inputRef} type="file" accept={accept} onChange={handleFile} style={{ display: 'none' }} />
        </div>

        {error && <p style={styles.warningText}><Icon name="alert-triangle" size={12} /> {error}</p>}
        {value && previewType === 'file' && !error && (
          <p style={styles.okText}>
            <Icon name="check-circle" size={12} />{' '}
            <a href={value} target="_blank" rel="noreferrer" title="Open or download the uploaded file" style={styles.fileLink}>
              {fileNameFromUrl(value)}
            </a>
          </p>
        )}
      </div>
    </div>
  );
}

// ── Search box that pans/zooms the map to a place, using OSM's free
// Nominatim geocoder. Purely for navigation — it never touches the spot
// or AR pins, it just moves the viewport.
function MapSearch({ mapRef }) {
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen]       = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=6&countrycodes=ph&q=${encodeURIComponent(q)}`
        );
        const data = await res.json();
        setResults(Array.isArray(data) ? data : []);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const goTo = (place) => {
    const lat = parseFloat(place.lat);
    const lon = parseFloat(place.lon);
    if (mapRef.current && Number.isFinite(lat) && Number.isFinite(lon)) {
      mapRef.current.setView([lat, lon], 17);
    }
    setQuery(place.display_name);
    setOpen(false);
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setOpen(false);
  };

  return (
    <div style={styles.searchWrap}>
      <div style={styles.searchInputRow}>
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => results.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && results.length > 0) goTo(results[0]);
            if (e.key === 'Escape') setOpen(false);
          }}
          placeholder="Search a place to jump the map there…"
          style={styles.searchInput}
        />
        {loading && <span style={styles.searchSpinner}>…</span>}
        {query && !loading && (
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={handleClear} style={styles.searchClearBtn} className="modern-btn"><Icon name="x" size={12} /></button>
        )}
      </div>

      {open && results.length > 0 && (
        <div style={styles.searchDropdown}>
          {results.map((r) => (
            <button
              key={r.place_id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => goTo(r)}
              style={styles.searchResultItem}
            >
              {r.display_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Map: every instance shows the spot pin, every AR position pin, and (when
// a food-recommendation mission exists for this spot) its single geofence
// pin, all together. Each tab that needs a map (Location, AR, Food mission)
// mounts its own, with `mode` fixed to that tab: only that mode's pin(s) are
// draggable and map clicks only affect them. The other pins stay visible for
// reference — AR models are placed relative to the spot, and so is the eatery.
//
// The pins a map edits also get a ring at the radius the app uses for them
// (spot: arrival, AR: trigger, food: completion). The Location map adds every
// other spot with its own arrival ring, and rings that overlap turn red — live
// while a pin is dragged, not just once it's dropped.
function SpotMapPicker({
  spotLat, spotLng, onSpotChange,
  arModels, onPlaceAr, onArMove,
  mode = 'spot', // 'spot' | 'ar' | 'mission'
  missionLat, missionLng, onMissionChange,
  missionRadius = MISSION_RADIUS_DEFAULT_M,
  otherSpots = [], // [{ id, name, lat, lng }] — drawn on the Location map only
  active = true, // false while this map's tab is hidden
  height = 320,
}) {
  const containerRef  = useRef(null);
  const mapRef        = useRef(null);
  const spotMarkerRef = useRef(null);
  const arMarkersRef  = useRef({});
  const missionMarkerRef = useRef(null);
  const spotRingRef    = useRef(null);
  const arRingsRef     = useRef({});
  const missionRingRef = useRef(null);
  const othersRef      = useRef([]); // [{ lat, lng, ring, dot }]

  // Both read only refs, so the drag handlers (bound once, when a marker is
  // created) can call them without going stale.
  const paintSpotClash = (lat, lng) => {
    let any = false;
    othersRef.current.forEach((o) => {
      const on = lat != null && distanceM(lat, lng, o.lat, o.lng) < 2 * ARRIVAL_RADIUS_M;
      markClash(o.ring, on);
      markClash(o.dot, on);
      if (on) any = true;
    });
    markClash(spotRingRef.current, any);
  };

  const paintArClash = () => {
    const rings = Object.values(arRingsRef.current);
    const hit = new Set();
    arOverlaps(rings.map((r) => r.getLatLng())).forEach(({ i, j }) => { hit.add(i); hit.add(j); });
    rings.forEach((r, i) => markClash(r, hit.has(i)));
  };

  const ring = (latlng, radiusM, kind) =>
    L.circle(latlng, { radius: radiusM, className: `map-ring map-ring--${kind}`, interactive: false });

  // Always-fresh refs so the map's event handlers (bound once) see current props/callbacks
  const stateRef = useRef({ mode, onSpotChange, onPlaceAr, onArMove, onMissionChange });
  useEffect(() => {
    stateRef.current = { mode, onSpotChange, onPlaceAr, onArMove, onMissionChange };
  });

  const spotIcon = useRef(
    L.divIcon({
      html: `<div style="background:${MAP_PIN.spot};width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>`,
      className: '',
      iconSize: [26, 26],
      iconAnchor: [13, 26],
    })
  ).current;

  const missionIcon = useRef(
    L.divIcon({
      // Leaflet divIcons are raw HTML strings, so this can't use the <Icon>
      // component — the same Feather "map-pin" path is inlined instead of the
      // fork-and-knife emoji that used to sit here.
      html: `<div style="background:${MAP_PIN.mission};width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.4);">`
          + `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2C2810" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">`
          + `<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg></div>`,
      className: '',
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    })
  ).current;

  const makeArIcon = (num) =>
    L.divIcon({
      html: `<div style="background:${MAP_PIN.ar};width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.4);color:#0B2233;font-weight:700;font-size:12px;">${num}</div>`,
      className: '',
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });

  // Initialize the map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Open framed on what this tab edits, with the spot alongside for
    // reference: the AR tab on the spot and its AR pins, the food tab on the
    // spot and the eatery.
    const pts = [];
    const add = (la, ln) => {
      const a = toNum(la), b = toNum(ln);
      if (a !== null && b !== null) pts.push([a, b]);
    };
    add(spotLat, spotLng);
    if (mode === 'ar') arModels.forEach((m) => add(m.lat, m.lng));
    if (mode === 'mission') add(missionLat, missionLng);

    // Close enough that each tab's rings are bigger than its pins: a 50 m
    // arrival ring is ~45 px across at 17, a 6 m AR ring ~40 px at 20.
    const zoom = mode === 'ar' ? 20 : mode === 'spot' ? 17 : 16;
    const map = L.map(containerRef.current, { zoomControl: false, maxZoom: 21 });
    if (pts.length > 1) map.fitBounds(pts, { padding: [48, 48], maxZoom: zoom });
    else if (pts.length === 1) map.setView(pts[0], zoom);
    else map.setView([DEFAULT_CENTER.lat, DEFAULT_CENTER.lng], 13);
    mapRef.current = map;

    // Zoom +/- control, moved down to the bottom-right corner instead of
    // Leaflet's default top-left placement.
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // OSM serves nothing past 19; beyond that Leaflet enlarges the z19 tiles,
    // which is what lets AR pins a few metres apart be told apart.
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxNativeZoom: 19,
      maxZoom: 21,
    }).addTo(map);

    map.on('click', (e) => {
      const { mode, onSpotChange, onPlaceAr, onMissionChange } = stateRef.current;
      if (mode === 'mission') onMissionChange(e.latlng.lat, e.latlng.lng);
      else if (mode === 'ar') onPlaceAr(e.latlng.lat, e.latlng.lng);
      else onSpotChange(e.latlng.lat, e.latlng.lng);
    });

    // Fix sizing glitches when the map first renders inside a scrolling modal
    setTimeout(() => map.invalidateSize(), 150);

    return () => {
      map.remove();
      mapRef.current = null;
      spotMarkerRef.current = null;
      arMarkersRef.current = {};
      missionMarkerRef.current = null;
      spotRingRef.current = null;
      arRingsRef.current = {};
      missionRingRef.current = null;
      othersRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the spot marker in sync with props (set, moved, dragged, or cleared)
  useEffect(() => {
    if (!mapRef.current) return;
    const la = toNum(spotLat);
    const ln = toNum(spotLng);

    // Also covers a half-typed value ("-", "14.") — leave the last good pin
    // on the map rather than tearing it down and rebuilding it per keystroke.
    if (la === null || ln === null) {
      if (spotLat === '' && spotLng === '' && spotMarkerRef.current) {
        mapRef.current.removeLayer(spotMarkerRef.current);
        spotMarkerRef.current = null;
        spotRingRef.current?.remove();
        spotRingRef.current = null;
        paintSpotClash(null, null);
      }
      return;
    }

    if (spotMarkerRef.current) {
      const cur = spotMarkerRef.current.getLatLng();
      if (Math.abs(cur.lat - la) > 1e-9 || Math.abs(cur.lng - ln) > 1e-9) {
        spotMarkerRef.current.setLatLng([la, ln]);
      }
    } else {
      spotMarkerRef.current = L.marker([la, ln], { icon: spotIcon, draggable: stateRef.current.mode === 'spot' })
        .addTo(mapRef.current)
        .bindTooltip('Spot', { permanent: false });

      // Only commit to React state on dragend. Leaflet already moves the
      // marker smoothly on its own during the drag (it's pure DOM/CSS
      // transform under the hood) — firing a React state update on every
      // 'drag' tick forces the whole form to re-render dozens of times a
      // second and fights with that native smoothness, causing stutter.
      // The ring follows on 'drag' the same way: Leaflet only, no React.
      spotMarkerRef.current.on('drag', () => {
        const pos = spotMarkerRef.current.getLatLng();
        spotRingRef.current?.setLatLng(pos);
        paintSpotClash(pos.lat, pos.lng);
      });
      spotMarkerRef.current.on('dragend', () => {
        const pos = spotMarkerRef.current.getLatLng();
        stateRef.current.onSpotChange(pos.lat, pos.lng);
      });

      // Only recentre if the new pin would otherwise be off-screen. A pin
      // created by clicking the map is already in view, so this no longer
      // jumps the map out from under the click.
      if (!mapRef.current.getBounds().contains([la, ln])) {
        mapRef.current.setView([la, ln], mapRef.current.getZoom());
      }
    }

    // The arrival ring, on the map that moves this pin.
    if (mode === 'spot') {
      if (spotRingRef.current) spotRingRef.current.setLatLng([la, ln]);
      else spotRingRef.current = ring([la, ln], ARRIVAL_RADIUS_M, 'spot').addTo(mapRef.current);
      paintSpotClash(la, ln);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spotLat, spotLng]);

  // Every other spot with its arrival ring, Location map only. Added after
  // the spot's own ring, so theirs draw on top and stay readable where the
  // two overlap.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || mode !== 'spot') return;
    const layer = L.layerGroup().addTo(map);
    othersRef.current = otherSpots.map((o) => ({
      lat: o.lat,
      lng: o.lng,
      ring: ring([o.lat, o.lng], ARRIVAL_RADIUS_M, 'other').addTo(layer),
      dot: L.circleMarker([o.lat, o.lng], { radius: 5, className: 'map-dot' })
        .bindTooltip(o.name || 'Unnamed spot')
        .addTo(layer),
    }));
    const cur = spotMarkerRef.current?.getLatLng();
    paintSpotClash(cur?.lat ?? null, cur?.lng ?? null);
    return () => {
      layer.remove();
      othersRef.current = [];
    };
  }, [otherSpots, mode]);

  // Keep AR position markers in sync: add new ones, move existing ones,
  // remove deleted ones, and renumber icons/tooltips when the list changes.
  useEffect(() => {
    if (!mapRef.current) return;
    const currentIds = new Set(arModels.map(m => m.id));

    Object.keys(arMarkersRef.current).forEach(id => {
      if (!currentIds.has(id)) {
        mapRef.current.removeLayer(arMarkersRef.current[id]);
        delete arMarkersRef.current[id];
        arRingsRef.current[id]?.remove();
        delete arRingsRef.current[id];
      }
    });

    arModels.forEach((model, index) => {
      const la  = toNum(model.lat);
      const ln  = toNum(model.lng);
      if (la === null || ln === null) return;
      const num = index + 1;

      let marker = arMarkersRef.current[model.id];
      if (marker) {
        const cur = marker.getLatLng();
        if (Math.abs(cur.lat - la) > 1e-9 || Math.abs(cur.lng - ln) > 1e-9) {
          marker.setLatLng([la, ln]);
        }
        marker.setIcon(makeArIcon(num));
        marker.setTooltipContent(`AR ${num}`);
      } else {
        marker = L.marker([la, ln], { icon: makeArIcon(num), draggable: stateRef.current.mode === 'ar' })
          .addTo(mapRef.current)
          .bindTooltip(`AR ${num}`, { permanent: false });

        const thisId = model.id;
        marker.on('drag', () => {
          arRingsRef.current[thisId]?.setLatLng(marker.getLatLng());
          paintArClash();
        });
        marker.on('dragend', () => {
          const pos = marker.getLatLng();
          stateRef.current.onArMove(thisId, pos.lat, pos.lng);
        });

        arMarkersRef.current[model.id] = marker;
      }

      // Trigger rings on the AR map only — at the spot's zoom they'd be
      // specks under the pins anyway.
      if (mode === 'ar') {
        const r = arRingsRef.current[model.id];
        if (r) r.setLatLng([la, ln]);
        else arRingsRef.current[model.id] = ring([la, ln], AR_RADIUS_M, 'ar').addTo(mapRef.current);
      }
    });
    paintArClash();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arModels]);

  // Keep the food-mission pin in sync (set, moved, dragged, or cleared) —
  // same pattern as the spot marker, just a second independent single pin.
  useEffect(() => {
    if (!mapRef.current) return;
    const la = toNum(missionLat);
    const ln = toNum(missionLng);

    if (la === null || ln === null) {
      if (missionLat === '' && missionLng === '' && missionMarkerRef.current) {
        mapRef.current.removeLayer(missionMarkerRef.current);
        missionMarkerRef.current = null;
        missionRingRef.current?.remove();
        missionRingRef.current = null;
      }
      return;
    }

    if (missionMarkerRef.current) {
      const cur = missionMarkerRef.current.getLatLng();
      if (Math.abs(cur.lat - la) > 1e-9 || Math.abs(cur.lng - ln) > 1e-9) {
        missionMarkerRef.current.setLatLng([la, ln]);
      }
    } else {
      missionMarkerRef.current = L.marker([la, ln], { icon: missionIcon, draggable: stateRef.current.mode === 'mission' })
        .addTo(mapRef.current)
        .bindTooltip('Food mission', { permanent: false });

      missionMarkerRef.current.on('drag', () => {
        missionRingRef.current?.setLatLng(missionMarkerRef.current.getLatLng());
      });
      missionMarkerRef.current.on('dragend', () => {
        const pos = missionMarkerRef.current.getLatLng();
        stateRef.current.onMissionChange(pos.lat, pos.lng);
      });
    }

    // The completion ring follows the Radius field as it's typed.
    if (mode === 'mission') {
      const r = missionRadiusOf(missionRadius);
      if (missionRingRef.current) missionRingRef.current.setLatLng([la, ln]).setRadius(r);
      else missionRingRef.current = ring([la, ln], r, 'food').addTo(mapRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missionLat, missionLng, missionRadius]);

  // Follow a typed coordinate that lands off-screen, so the pin doesn't
  // silently move somewhere the user can't see.
  //
  // Debounced on purpose: typing "14.8433" passes through 1 -> 14 -> 14.8, and
  // recentring on each of those would fling the map across the planet and
  // back. Waiting for a pause means one move, to the final value. Pins placed
  // by clicking or dragging are in view already, so the bounds check makes
  // this a no-op for them.
  useEffect(() => {
    const la = toNum(mode === 'mission' ? missionLat : spotLat);
    const ln = toNum(mode === 'mission' ? missionLng : spotLng);
    if (la === null || ln === null) return;

    const id = setTimeout(() => {
      const map = mapRef.current;
      if (!map) return;
      if (!map.getBounds().contains([la, ln])) {
        map.setView([la, ln], Math.max(map.getZoom(), 15));
      }
    }, 700);
    return () => clearTimeout(id);
  }, [spotLat, spotLng, missionLat, missionLng, mode]);

  // A hidden tab keeps its map mounted (so its view survives a tab switch);
  // Leaflet can't measure a display:none container, so re-measure on show.
  useEffect(() => {
    if (active) mapRef.current?.invalidateSize();
  }, [active]);

  // Lock dragging to the active mode — only the pin(s) for the current mode
  // are draggable, so a stray drag doesn't move the wrong pin.
  useEffect(() => {
    if (!mapRef.current) return;
    if (spotMarkerRef.current) {
      spotMarkerRef.current.dragging?.[mode === 'spot' ? 'enable' : 'disable']();
    }
    Object.values(arMarkersRef.current).forEach(marker => {
      marker.dragging?.[mode === 'ar' ? 'enable' : 'disable']();
    });
    if (missionMarkerRef.current) {
      missionMarkerRef.current.dragging?.[mode === 'mission' ? 'enable' : 'disable']();
    }
  }, [mode]);

  return (
    <div style={styles.mapWrap}>
      <MapSearch mapRef={mapRef} />
      <div
        ref={containerRef}
        style={{ height, borderRadius: radius.lg, overflow: 'hidden', border: `1px solid ${t.border}`, boxShadow: shadow.sm }}
      />
    </div>
  );
}

// ── Sections ──────────────────────────────────────────────────────
// The form used to be one long scroll. Each tab now holds everything for one
// feature, so e.g. the AR model file, its map positions and its trivia sit
// together instead of across three sections.
const TABS = [
  { id: 'details',  label: 'Details',      icon: 'info' },
  { id: 'media',    label: 'Media',        icon: 'image' },
  { id: 'location', label: 'Location',     icon: 'map-pin' },
  { id: 'ar',       label: 'AR',           icon: 'aperture' },
  { id: 'food',     label: 'Food mission', icon: 'utensils' },
];

// WAI-ARIA tabs: arrow keys / Home / End move between tabs, and only the
// selected tab is in the Tab order. `status[id]` adds a warning dot
// (`missing`: what's still required) or a count.
function FormTabs({ active, onChange, status }) {
  const refs = useRef({});

  const onKeyDown = (e) => {
    const i = TABS.findIndex((tab) => tab.id === active);
    const next =
      e.key === 'ArrowRight' ? TABS[(i + 1) % TABS.length]
      : e.key === 'ArrowLeft' ? TABS[(i - 1 + TABS.length) % TABS.length]
      : e.key === 'Home' ? TABS[0]
      : e.key === 'End' ? TABS[TABS.length - 1]
      : null;
    if (!next) return;
    e.preventDefault();
    onChange(next.id);
    refs.current[next.id]?.focus();
  };

  return (
    <div role="tablist" aria-label="Spot sections" style={styles.tabBar} onKeyDown={onKeyDown}>
      {TABS.map((tab) => {
        const selected = tab.id === active;
        const st = status[tab.id] || {};
        return (
          <button
            key={tab.id}
            ref={(el) => { refs.current[tab.id] = el; }}
            type="button"
            role="tab"
            id={`spot-tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`spot-panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            title={st.missing || undefined}
            style={{ ...styles.tab, ...(selected ? styles.tabActive : {}) }}
          >
            <Icon name={tab.icon} size={15} color={selected ? t.brand : 'currentColor'} weight={selected ? 'bold' : 'regular'} />
            {tab.label}
            {st.count > 0 && <span style={styles.tabCount}>{st.count}</span>}
            {st.missing && (
              <>
                <span style={styles.tabDot} aria-hidden="true" />
                <span style={styles.srOnly}> — {st.missing}</span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

// Kept mounted once visited (just hidden), so an upload in progress or a
// map's viewport survives switching away and back.
function TabPanel({ id, active, children }) {
  return (
    <div role="tabpanel" id={`spot-panel-${id}`} aria-labelledby={`spot-tab-${id}`} hidden={!active}>
      {children}
    </div>
  );
}

// Which pin is which, now that there's no Spot / AR / Food toggle above the
// map carrying the coloured dots. The pins this tab edits are listed first
// and in full colour; the rest are there for reference. The last entry says
// what the ring around this tab's pins measures.
function MapLegend({ mode, spotPinned, arCount, missionPinned, otherCount = 0, missionRadius }) {
  const items = [
    (spotPinned || mode === 'spot') && { key: 'spot', color: MAP_PIN.spot, label: 'Spot' },
    mode === 'spot' && otherCount > 0 && { key: 'other', color: t.mapOther, label: 'Other spots' },
    (arCount > 0 || mode === 'ar') && { key: 'ar', color: MAP_PIN.ar, label: arCount === 1 ? 'AR position' : 'AR positions' },
    (missionPinned || mode === 'mission') && { key: 'mission', color: MAP_PIN.mission, label: 'Food spot' },
  ].filter(Boolean).sort((a, b) => (b.key === mode) - (a.key === mode));
  const ringKey =
    mode === 'ar' ? { color: t.mapAr, label: `${AR_RADIUS_M} m AR trigger radius · red where two overlap` }
    : mode === 'mission' ? { color: t.mapFood, label: `${missionRadiusOf(missionRadius)} m completion radius` }
    : { color: t.mapSpot, label: `${ARRIVAL_RADIUS_M} m arrival radius · red where two spots overlap` };
  return (
    <div style={styles.legend}>
      {items.length > 1 && items.map((it) => (
        <span key={it.key} style={it.key === mode ? styles.legendItemActive : styles.legendItem}>
          <span style={{ ...styles.modeDot, background: it.color }} />
          {it.label}{it.key === mode ? '' : ' (reference)'}
        </span>
      ))}
      <span style={styles.legendItem}>
        <span style={{ ...styles.ringSwatch, borderColor: ringKey.color }} />
        {ringKey.label}
      </span>
    </div>
  );
}

// Under the Location map: does this spot's arrival ring overlap another
// spot's? Spelled out, because a red ring alone doesn't say what it costs.
// `neighbours` is every other spot with its distance, nearest first; null
// while they load, false if they couldn't be.
function SpotOverlapNote({ neighbours }) {
  if (neighbours === null) return <p style={styles.overlapMuted}>Checking the spots nearby…</p>;
  if (neighbours === false) {
    return <p style={styles.overlapMuted}>Couldn’t load the other spots, so overlaps can’t be checked right now.</p>;
  }
  const clashes = neighbours.filter((n) => n.distance < 2 * ARRIVAL_RADIUS_M);
  if (!clashes.length) {
    const nearest = neighbours[0];
    return (
      <p style={styles.overlapOk}>
        <Icon name="check-circle" size={13} />
        <span>
          No overlap
          {nearest ? ` — the nearest spot, ${nearest.name || 'unnamed'}, is ${fmtDistance(nearest.distance)} away.` : '.'}
        </span>
      </p>
    );
  }
  return (
    <div style={styles.overlapWarn} role="status">
      <p style={styles.overlapTitle}>
        <Icon name="alert-triangle" size={13} />
        Overlaps {clashes.length === 1 ? 'another spot' : `${clashes.length} other spots`}
      </p>
      <ul style={styles.overlapList}>
        {clashes.map((c) => (
          <li key={c.id}>
            <strong>{c.name || 'Unnamed spot'}</strong> — {fmtDistance(c.distance)} apart
            {c.distance < ARRIVAL_RADIUS_M ? ', so standing on either pin counts as arriving at both' : ''}
          </li>
        ))}
      </ul>
      <p style={styles.overlapText}>
        A traveler arrives within {ARRIVAL_RADIUS_M} m of a pin, so pins closer than {2 * ARRIVAL_RADIUS_M} m
        share ground: someone standing between them arrives at both at once.
      </p>
    </div>
  );
}

// Under the AR map: AR pins whose trigger rings overlap.
function ArOverlapNote({ arModels }) {
  const pairs = arOverlaps(arModels.map((m) => {
    const lat = toNum(m.lat);
    const lng = toNum(m.lng);
    return lat === null || lng === null ? null : { lat, lng };
  }));
  if (!pairs.length) return null;
  return (
    <div style={styles.overlapWarn} role="status">
      <p style={styles.overlapTitle}>
        <Icon name="alert-triangle" size={13} />
        AR rings overlap
      </p>
      <ul style={styles.overlapList}>
        {pairs.map(({ i, j, distance }) => (
          <li key={`${i}-${j}`}>
            <strong>AR {i + 1}</strong> and <strong>AR {j + 1}</strong> — {fmtDistance(distance)} apart
            {distance < 2 * AR_MIN_RADIUS_M ? ', too close for the app to tell apart' : ''}
          </li>
        ))}
      </ul>
      <p style={styles.overlapText}>
        Each AR model triggers within {AR_RADIUS_M} m. For pins closer than {2 * AR_RADIUS_M} m the app
        shrinks both rings to half the gap, and below {2 * AR_MIN_RADIUS_M} m it can’t keep them apart.
      </p>
    </div>
  );
}

export default function SpotForm({ initial, onSave, onCancel, saving = false, isModerator = false, lockedCity = '' }) {
  const [form, setForm] = useState({
    name:            initial?.name             || '',
    // Deliberately NOT filtered against the known category list any more.
    // That filter ran at initial-state time, and now the list arrives from the
    // server a moment later — so filtering here would silently wipe a spot's
    // existing categories before the fetch landed, and saving would persist
    // the loss. Anything unrecognised is shown as a chip below instead.
    category:        Array.isArray(initial?.category) ? initial.category : (initial?.category ? [initial.category] : []),
    description:     initial?.description      || '',
    city:            initial?.city             || lockedCity || '',
    entranceFee:     initial?.entranceFee      || '',
    visitingHours:   initial?.visitingHours    || '',
    image:           initial?.image            || '',
    modelUrl:        initial?.modelUrl         || '',
    ARModelUrl:      initial?.AR3DModelURL     || '',
    Badge:           initial?.Badge            || '',
    coordinates_lat: initial?.coordinates?.lat || '',
    coordinates_lng: initial?.coordinates?.lng || '',
    // Edited as one fact per line; stored as an array — each entry is one card
    // in the app's AR trivia popup.
    trivia:          Array.isArray(initial?.trivia) ? initial.trivia.join('\n') : '',
  });

  const [arModels, setArModels] = useState(() => {
    if (initial?.modelsCoordinates) {
      if (Array.isArray(initial.modelsCoordinates)) {
        return initial.modelsCoordinates.map(m => ({ id: makeId(), lat: m.lat || '', lng: m.lng || '' }));
      }
      return [{ id: makeId(), lat: initial.modelsCoordinates.lat || '', lng: initial.modelsCoordinates.lng || '' }];
    }
    return [];
  });

  // Categories now come from the database. Seeded with the fallback so the
  // chips render on first paint rather than popping in.
  const [categories, setCategories] = useState(FALLBACK_CATEGORIES);
  useEffect(() => {
    let cancelled = false;
    categoryAPI.getAll()
      .then((rows) => {
        if (cancelled) return;
        const names = (rows || []).map((c) => c.name).filter(Boolean);
        if (names.length) setCategories(names);
      })
      .catch(() => { /* keep the fallback */ });
    return () => { cancelled = true; };
  }, []);

  // Every published spot, so the Location map can show whether this one's
  // arrival ring overlaps another's. All cities, not just this moderator's:
  // the app checks every spot, and two towns' spots can face each other across
  // a boundary road. null while loading, false if the request failed.
  const [allSpots, setAllSpots] = useState(null);
  useEffect(() => {
    let cancelled = false;
    spotAPI.getAll()
      .then((rows) => { if (!cancelled) setAllSpots(rows || []); })
      .catch(() => { if (!cancelled) setAllSpots(false); });
    return () => { cancelled = true; };
  }, []);

  const otherSpots = useMemo(
    () => (allSpots || [])
      .filter((s) => s._id !== initial?._id)
      .map((s) => {
        const at = spotPosition(s);
        return at && { id: s._id, name: s.name, ...at };
      })
      .filter(Boolean),
    [allSpots, initial?._id]
  );

  // Any category already on this spot that isn't in the list still gets a chip,
  // so an older or since-renamed value stays visible and removable instead of
  // vanishing from the UI while remaining on the record.
  const categoryOptions = useMemo(
    () => [...new Set([...categories, ...(form.category || [])])],
    [categories, form.category]
  );

  // Which section is showing. Panels mount on first visit and then stay
  // mounted (hidden) — see TabPanel. The tab also decides the map's pinning
  // mode: Location moves the spot pin, AR drops/drags AR pins, Food mission
  // moves the eatery's geofence pin.
  const [tab, setTab] = useState('details');
  const [visited, setVisited] = useState(() => new Set(['details']));
  const bodyRef = useRef(null);
  const selectTab = (id) => {
    setTab(id);
    setVisited((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  };

  // The spot's 2nd ("location") mission — a food recommendation the user
  // must physically visit. Only exists for spots that already have one
  // created (see the backend's mission auto-creation); null while loading
  // or if this spot has none yet. Saved independently of the spot itself via
  // PATCH /api/missions/:id/location, since it's a different resource.
  const [locationMission, setLocationMission] = useState(null);
  const [loadingMission, setLoadingMission]   = useState(!!initial?._id);
  const [missionLat, setMissionLat]     = useState('');
  const [missionLng, setMissionLng]     = useState('');
  const [locationName, setLocationName] = useState(''); // the restaurant's name
  const [missionImage, setMissionImage] = useState(''); // photo of the restaurant
  const [locationInfo, setLocationInfo] = useState(''); // info about the restaurant (specialty, hours, etc.), shown below the photo
  const [radiusMeters, setRadiusMeters] = useState(60);
  const [savingMission, setSavingMission] = useState(false);
  const [missionError, setMissionError]   = useState('');
  const [creatingMissions, setCreatingMissions] = useState(false);

  // Snapshot of the mission fields as last loaded/saved, so the unified
  // submit button below only proposes a mission-location change when one of
  // these actually changed — editing just the spot's name shouldn't also
  // silently re-submit an identical mission proposal.
  // Coordinates go through toNum for the same reason as the spot snapshot
  // below: the map writes numbers, the inputs write strings, and "14.8433"
  // must not count as a change from 14.8433.
  const missionSnapshotRef = useRef(null);
  const snapshotMission = (lat, lng, name, image, info, radius) =>
    JSON.stringify({ lat: toNum(lat), lng: toNum(lng), name, image, info, radius: Number(radius) || 60 });

  useEffect(() => {
    if (!initial?._id) { setLoadingMission(false); return; }
    let cancelled = false;
    missionAPI.getForSpot(initial._id)
      .then((missions) => {
        if (cancelled) return;
        const mission = (missions || []).find((m) => m.order === 2);
        setLocationMission(mission || null);
        if (mission) {
          // If a proposal is already pending, load THAT instead of the
          // (stale) live values — otherwise reopening this form shows blank
          // fields even though something was already submitted, and saving
          // again from there would silently overwrite the pending proposal
          // with the reset/blank values instead of what was actually meant.
          const pc = mission.pendingChange;
          const lat = (pc ? pc.coordinates?.lat : mission.coordinates?.lat) ?? '';
          const lng = (pc ? pc.coordinates?.lng : mission.coordinates?.lng) ?? '';
          const name = (pc ? pc.locationName : mission.locationName) || '';
          const image = (pc ? pc.image : mission.image) || '';
          const info = (pc ? pc.locationInfo : mission.locationInfo) || '';
          const radius = (pc ? pc.radiusMeters : mission.radiusMeters) || 60;
          setMissionLat(lat);
          setMissionLng(lng);
          setLocationName(name);
          setMissionImage(image);
          setLocationInfo(info);
          setRadiusMeters(radius);
          missionSnapshotRef.current = snapshotMission(lat, lng, name, image, info, radius);
        }
      })
      .catch(() => { if (!cancelled) setLocationMission(null); })
      .finally(() => { if (!cancelled) setLoadingMission(false); });
    return () => { cancelled = true; };
  }, [initial?._id]);

  const handleMissionChange = (lat, lng) => { setMissionLat(lat); setMissionLng(lng); };
  const handleClearMissionPin = () => { setMissionLat(''); setMissionLng(''); };

  // For spots that predate auto-created missions (or where that failed) —
  // creates the standard 3-mission set right here, no separate step outside
  // this form.
  const handleCreateDefaultMissions = async () => {
    if (!initial?._id) return;
    setCreatingMissions(true);
    setMissionError('');
    try {
      const { missions } = await missionAPI.createDefaults(initial._id);
      const mission = (missions || []).find((m) => m.order === 2);
      setLocationMission(mission || null);
      if (mission) {
        const lat = mission.coordinates?.lat ?? '';
        const lng = mission.coordinates?.lng ?? '';
        const name = mission.locationName || '';
        const image = mission.image || '';
        const info = mission.locationInfo || '';
        const radius = mission.radiusMeters || 60;
        setMissionLat(lat);
        setMissionLng(lng);
        setLocationName(name);
        setMissionImage(image);
        setLocationInfo(info);
        setRadiusMeters(radius);
        missionSnapshotRef.current = snapshotMission(lat, lng, name, image, info, radius);
      }
    } catch (err) {
      setMissionError(err?.response?.data?.message || err.message || 'Failed to create missions.');
    }
    setCreatingMissions(false);
  };

  // Proposes the mission-location change, if anything about it actually
  // changed since it was loaded. Called from the single Save/Submit button
  // below — not its own separate button — so one click submits both the
  // spot's edits and the food-mission location together, but only the ones
  // that actually changed: a spot's own fields (Spot.pendingChange) and a
  // mission's location (Mission.pendingChange) are two different documents
  // on the backend, each producing their own mod-request item, so
  // submitting one that didn't change would create a spurious extra
  // request for the admin to review.
  // Returns 'skipped' (nothing mission-related changed, or there's no
  // mission at all), 'ok' (proposed successfully), or 'failed' (caller
  // should stop and keep the form open so the error stays visible instead
  // of the modal closing out from under it).
  const maybeSubmitMissionLocation = async () => {
    if (!locationMission) return 'skipped';
    const currentSnapshot = snapshotMission(missionLat, missionLng, locationName, missionImage, locationInfo, radiusMeters);
    if (currentSnapshot === missionSnapshotRef.current) return 'skipped';

    // A half-typed coordinate would otherwise be sent as null, silently
    // clearing a pin the moderator was in the middle of editing.
    const missionErr = coordError(missionLat, missionLng);
    if (missionErr) { setMissionError(missionErr); return 'failed'; }
    const missionLatNum = toNum(missionLat);
    const missionLngNum = toNum(missionLng);
    if ((missionLatNum === null) !== (missionLngNum === null)) {
      setMissionError('Enter both the latitude and the longitude, or clear both.');
      return 'failed';
    }

    setSavingMission(true);
    setMissionError('');
    try {
      const data = await missionAPI.proposeLocation(locationMission._id, {
        lat: missionLatNum,
        lng: missionLngNum,
        locationName: locationName.trim(),
        image: missionImage,
        locationInfo: locationInfo.trim(),
        radiusMeters: Number(radiusMeters) || 60,
      });
      setLocationMission(data.mission);
      missionSnapshotRef.current = currentSnapshot;
      setSavingMission(false);
      return 'ok';
    } catch (err) {
      setMissionError(err?.response?.data?.message || err.message || 'Failed to submit food mission location.');
      setSavingMission(false);
      return 'failed';
    }
  };

  // Snapshot of the form's starting values, used to detect unsaved changes on
  // Cancel and — more importantly — to decide whether to submit a spot edit at
  // all. Coordinates are normalised through toNum first: the map writes them as
  // numbers and the inputs write them as strings, so without this, typing a
  // coordinate back to the value it already had would look like a change and
  // raise a pointless second mod request for the admin to review.
  const snapshotSpot = (formValue, models) => JSON.stringify({
    ...formValue,
    coordinates_lat: toNum(formValue.coordinates_lat),
    coordinates_lng: toNum(formValue.coordinates_lng),
    arModels: models.map((m) => ({ id: m.id, lat: toNum(m.lat), lng: toNum(m.lng) })),
  });

  const initialSnapshotRef = useRef(null);
  if (initialSnapshotRef.current === null) {
    initialSnapshotRef.current = snapshotSpot(form, arModels);
  }

  const handleChange = (e) =>
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const toggleCategory = (cat) =>
    setForm(prev => ({
      ...prev,
      category: prev.category.includes(cat)
        ? prev.category.filter(c => c !== cat)
        : [...prev.category, cat],
    }));

  const setField = (field) => (value) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const handleSpotChange = (lat, lng) =>
    setForm(prev => ({ ...prev, coordinates_lat: lat, coordinates_lng: lng }));

  const handleClearSpot = () =>
    setForm(prev => ({ ...prev, coordinates_lat: '', coordinates_lng: '' }));

  const handlePlaceAr = (lat, lng) =>
    setArModels(prev => [...prev, { id: makeId(), lat, lng }]);

  const handleArMove = (id, lat, lng) =>
    setArModels(prev => prev.map(m => (m.id === id ? { ...m, lat, lng } : m)));

  const removeArModel = (id) => setArModels(prev => prev.filter(m => m.id !== id));

  const handleCancelClick = async () => {
    const currentSnapshot = snapshotSpot(form, arModels);
    if (currentSnapshot !== initialSnapshotRef.current) {
      if (!(await confirmAction('You have unsaved changes. Discard them and close this form?', { danger: true, confirmText: 'Discard' }))) return;
    }
    onCancel();
  };

  const handleSave = async () => {
  // Every problem opens the tab it lives on — with the form split into tabs,
  // "Image is required" is no help if the image field is out of sight.
  const fail = (tabId, message) => { selectTab(tabId); notify(message); };

  if (!form.name.trim()) {
    return fail('details', 'Name is required');
  }
  if (!form.category.length) {
    return fail('details', 'Select at least one category');
  }
  if (!form.city.trim()) {
    return fail('details', 'City is required');
  }
  // The spot page in the app shows all three, so a spot without them looked
  // unfinished. A place with no fee says "Free" rather than leaving it blank.
  if (!form.entranceFee.trim()) {
    return fail('details', 'Entrance fee is required — type "Free" if there is none.');
  }
  if (!form.visitingHours.trim()) {
    return fail('details', 'Visiting hours are required');
  }
  if (!form.description.trim()) {
    return fail('details', 'Description is required');
  }
  if (!form.image) {
    return fail('media', 'Spot image is required');
  }
  // Typed coordinates can be blank, half-finished ("14.") or out of range, so
  // this checks for a usable number rather than just a non-empty string.
  const spotLatNum = toNum(form.coordinates_lat);
  const spotLngNum = toNum(form.coordinates_lng);
  if (spotLatNum === null || spotLngNum === null) {
    return fail('location', 'Spot location is required — pin it on the map or type valid coordinates.');
  }
  const spotCoordErr = coordError(form.coordinates_lat, form.coordinates_lng);
  if (spotCoordErr) return fail('location', spotCoordErr);

  const badAr = arModels.findIndex(
    (m) => (m.lat !== '' || m.lng !== '') && (toNum(m.lat) === null || toNum(m.lng) === null)
  );
  // Not checked for a Nature or Festivals spot: its AR tab doesn't show the
  // positions, so there'd be nothing for the admin to fix.
  if (badAr !== -1 && spotHasAR(form.category)) {
    return fail('ar', `AR ${badAr + 1} has an incomplete coordinate — fix or remove it.`);
  }

  const payload = {
    name: form.name.trim(),
    category: form.category,
    description: form.description.trim(),
    city: form.city.trim(),
    entranceFee: form.entranceFee.trim(),
    visitingHours: form.visitingHours.trim(),
    trivia: form.trivia.split('\n').map(line => line.trim()).filter(Boolean),
    image: form.image,
    modelUrl: form.modelUrl || null,
    AR3DModelURL: form.ARModelUrl || null,
    Badge: form.Badge || null,
    coordinates: { lat: spotLatNum, lng: spotLngNum },
    modelsCoordinates: arModels
      .map(model => ({ label: model.label || 'Model', lat: toNum(model.lat), lng: toNum(model.lng) }))
      .filter(model => model.lat !== null && model.lng !== null),
  };

  // One submit button covers both: the food-mission location proposal (if
  // it changed) goes out alongside the spot's own save/proposal, instead of
  // needing a separate click. If it fails, stop here — don't let the spot
  // save succeed and close the form out from under a visible error.
  const missionResult = await maybeSubmitMissionLocation();
  if (missionResult === 'failed') { selectTab('food'); return; }

  // Only actually submit the spot itself if something about it changed (or
  // it's a brand-new spot, which must always go through) — otherwise a
  // mission-only edit would also create a spurious, unchanged spot-edit
  // request alongside the real mission-location one.
  const spotChanged = snapshotSpot(form, arModels) !== initialSnapshotRef.current;
  if (!initial || spotChanged) {
    onSave(payload);
    return;
  }

  if (missionResult === 'ok') {
    notify('Food mission location submitted for admin review.', { tone: 'success' });
    onCancel();
  } else {
    // Spelled out, because this is the one path where pressing Save sends
    // nothing at all. A bare "No changes to submit." reads like a confirmation
    // and leaves someone believing a request is now waiting for the admin when
    // none was ever created — e.g. after a file upload silently failed, so the
    // field they thought they'd filled is still empty.
    notify(
      'Nothing was sent — this form has no changes compared to when you opened it. ' +
      'If you meant to attach a file, check that it finished uploading (it should be listed under the upload button).',
      { tone: 'warning', title: 'No request created' }
    );
  }
};

  // Derived rather than stored, and via toNum rather than truthiness — a bare
  // `missionLat && missionLng` reads a legitimate 0 as "not pinned".
  const spotPinned    = toNum(form.coordinates_lat) !== null && toNum(form.coordinates_lng) !== null;
  const missionPinned = toNum(missionLat) !== null && toNum(missionLng) !== null;

  // Every other spot's distance from this pin, nearest first, for the note
  // under the Location map. The map recolours its rings live during a drag;
  // this catches up when the pin is dropped.
  const spotNeighbours =
    allSpots === null ? null
    : allSpots === false ? false
    : spotPinned && !coordError(form.coordinates_lat, form.coordinates_lng)
      ? otherSpots
          .map((o) => ({ ...o, distance: distanceM(toNum(form.coordinates_lat), toNum(form.coordinates_lng), o.lat, o.lng) }))
          .sort((a, b) => a.distance - b.distance)
      : [];

  // Per-tab map instructions — each map has one fixed mode now.
  const mapHintFor = (m) =>
    m === 'ar'
      ? `Click the map to drop AR ${arModels.length + 1}. Drag any AR pin to fine-tune it, or edit its numbers below.`
      : m === 'mission'
        ? (missionPinned
            ? 'Click the map, drag the pin, or type the coordinates below to move the food mission location.'
            : 'Click the map to pin where the food recommendation actually is — or type its coordinates below.')
        : spotPinned
          ? 'Click the map, drag the pin, or type the coordinates below to move the spot location.'
          : 'Click the map to set the spot location — or type its coordinates below.';

  // Drives the dots on the tab bar: what's still required on each tab, so a
  // missing field on a tab you aren't looking at is still visible.
  const missingDetails = [
    !form.name.trim() && 'name',
    !form.city.trim() && 'city',
    !form.category.length && 'category',
    !form.entranceFee.trim() && 'entrance fee',
    !form.visitingHours.trim() && 'visiting hours',
    !form.description.trim() && 'description',
  ].filter(Boolean);
  const hasAR = spotHasAR(form.category);
  const tabStatus = {
    details:  { missing: missingDetails.length ? `Still needed: ${missingDetails.join(', ')}` : '' },
    media:    { missing: form.image ? '' : 'Spot image is required' },
    location: { missing: spotPinned ? coordError(form.coordinates_lat, form.coordinates_lng) : 'Spot location is required' },
    ar:       { count: hasAR ? arModels.length : 0 },
  };

  // Shared by the three maps; each adds its own mode.
  const mapProps = {
    spotLat: form.coordinates_lat,
    spotLng: form.coordinates_lng,
    onSpotChange: handleSpotChange,
    arModels,
    onPlaceAr: handlePlaceAr,
    onArMove: handleArMove,
    missionLat,
    missionLng,
    onMissionChange: handleMissionChange,
    missionRadius: radiusMeters,
    otherSpots,
  };
  const legendProps = { spotPinned, arCount: arModels.length, missionPinned, otherCount: otherSpots.length, missionRadius: radiusMeters };
  const busy = saving || savingMission;

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>

        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>
            {initial
              ? (isModerator ? 'Propose Edit' : 'Edit Spot')
              : 'Add New Spot'}
          </h2>
          <button onClick={handleCancelClick} style={styles.closeBtn} className="modern-btn" disabled={busy} aria-label="Close"><Icon name="x" size={13} /></button>
        </div>

        <FormTabs active={tab} onChange={selectTab} status={tabStatus} />

        <div ref={bodyRef} style={styles.body}>

          {visited.has('details') && (
            <TabPanel id="details" active={tab === 'details'}>
              <section style={styles.section}>
                <div style={styles.field}>
                  <label style={styles.label}>Name <span style={styles.required}>*</span></label>
                  <input name="name" value={form.name} onChange={handleChange} style={styles.input} className="modern-input" placeholder="e.g. Barasoain Church" />
                </div>

                <div style={styles.field}>
                  <label style={styles.label}>City <span style={styles.required}>*</span></label>
                  {lockedCity ? (
                    <input
                      name="city"
                      value={form.city}
                      readOnly
                      style={{ ...styles.input, background: t.divider, cursor: 'not-allowed', color: t.textSecondary }}
                    />
                  ) : (
                    <input name="city" value={form.city} onChange={handleChange} style={styles.input} className="modern-input" placeholder="e.g. Malolos City" />
                  )}
                </div>

                <div style={styles.field}>
                  <label style={styles.label}>Category <span style={styles.required}>*</span></label>
                  <div style={styles.categoryChips}>
                    {categoryOptions.map(cat => {
                      const active = form.category.includes(cat);
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => toggleCategory(cat)}
                          style={{ ...styles.categoryChip, ...(active ? styles.categoryChipActive : {}) }}
                          className="modern-btn"
                        >
                          {cat}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div style={styles.twoCol}>
                  <div style={styles.field}>
                    <label style={styles.label}>Entrance fee <span style={styles.required}>*</span></label>
                    <input name="entranceFee" value={form.entranceFee} onChange={handleChange} style={styles.input} className="modern-input" placeholder="Free or ₱50" />
                  </div>
                  <div style={styles.field}>
                    <label style={styles.label}>Visiting hours <span style={styles.required}>*</span></label>
                    <input name="visitingHours" value={form.visitingHours} onChange={handleChange} style={styles.input} className="modern-input" placeholder="6am – 10pm" />
                  </div>
                </div>

                <div style={styles.field}>
                  <label style={styles.label}>Description <span style={styles.required}>*</span></label>
                  <textarea name="description" value={form.description} onChange={handleChange} style={styles.textarea} className="modern-input" rows={4} placeholder="Short description of the spot..." />
                </div>
                {/* No History field: removed from the Spot model on 2026-10-04
                    (the app never showed it). */}
              </section>
            </TabPanel>
          )}

          {visited.has('media') && (
            <TabPanel id="media" active={tab === 'media'}>
              <section style={styles.section}>
                <p style={styles.panelIntro}>
                  What the app shows on this spot's page. The AR model and the restaurant
                  photo are on the AR and Food mission tabs.
                </p>
                <div style={styles.uploadGrid}>
                  <FileUploadField label="Spot image" required accept="image/*" uploadType="image" previewType="image" value={form.image} onUploaded={setField('image')} />
                  <FileUploadField label="Badge image" hint="Reward for visiting" accept="image/*" uploadType="badge" previewType="badge" value={form.Badge} onUploaded={setField('Badge')} />
                  <FileUploadField label="Display 3D model" hint=".glb — spot detail screen" accept=".glb,.gltf" uploadType="model" previewType="file" value={form.modelUrl} onUploaded={setField('modelUrl')} />
                </div>
              </section>
            </TabPanel>
          )}

          {visited.has('location') && (
            <TabPanel id="location" active={tab === 'location'}>
              <section style={styles.section}>
                <div style={styles.mapHintRow}>
                  <p style={styles.mapHint}>{mapHintFor('spot')}</p>
                  {spotPinned && (
                    <button type="button" onClick={handleClearSpot} style={styles.clearPinBtn} className="modern-btn">
                      Clear pin
                    </button>
                  )}
                </div>

                <SpotMapPicker {...mapProps} mode="spot" active={tab === 'location'} />
                <MapLegend mode="spot" {...legendProps} />
                {spotPinned && <SpotOverlapNote neighbours={spotNeighbours} />}

                <div style={styles.coordBlock}>
                  <p style={styles.coordBlockTitle}>Spot coordinates <span style={styles.required}>*</span></p>
                  <CoordFields
                    lat={form.coordinates_lat}
                    lng={form.coordinates_lng}
                    onChange={handleSpotChange}
                    disabled={busy}
                  />
                  <p style={styles.hint}>
                    Type or paste them if you already have the numbers — pasting
                    "14.8433, 120.8114" into either box fills both. The pin follows.
                  </p>
                </div>
              </section>
            </TabPanel>
          )}

          {visited.has('ar') && (
            <TabPanel id="ar" active={tab === 'ar'}>
              {!hasAR ? (
                // Anything already set here is kept (it comes back if the
                // category changes) but the app ignores it for this spot.
                <section style={styles.section}>
                  <div style={styles.emptyNote}>
                    Nature and Festivals spots have no AR. The app shows no AR View button and no
                    AR mission for this spot, so there's nothing to set here.
                  </div>
                </section>
              ) : (<>
              <section style={styles.section}>
                <p style={styles.sectionTitle}>AR model</p>
                <FileUploadField label="AR 3D model" hint=".glb — what users see through the AR camera" accept=".glb,.gltf" uploadType="model" previewType="file" value={form.ARModelUrl} onUploaded={setField('ARModelUrl')} />
              </section>

              <section style={styles.section}>
                <p style={styles.sectionTitle}>AR positions</p>
                <div style={styles.mapHintRow}>
                  <p style={styles.mapHint}>{mapHintFor('ar')}</p>
                  {arModels.length > 0 && (
                    <button type="button" onClick={() => setArModels([])} style={styles.clearPinBtn} className="modern-btn">
                      Clear all AR pins
                    </button>
                  )}
                </div>

                <SpotMapPicker {...mapProps} mode="ar" active={tab === 'ar'} />
                <MapLegend mode="ar" {...legendProps} />
                <ArOverlapNote arModels={arModels} />

                {arModels.length === 0 ? (
                  <div style={styles.emptyNote}>No AR positions yet — click the map above to drop one.</div>
                ) : (
                  <div style={styles.arList}>
                    {arModels.map((model, index) => (
                      <div key={model.id} style={styles.arListRow}>
                        <span style={styles.arBadge}>AR {index + 1}</span>
                        <CoordFields
                          lat={model.lat}
                          lng={model.lng}
                          onChange={(lat, lng) => handleArMove(model.id, lat, lng)}
                          compact
                          disabled={busy}
                        />
                        <button onClick={() => removeArModel(model.id)} style={styles.removeBtn} className="modern-btn">Remove</button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section style={styles.section}>
                <div style={styles.field}>
                  <label style={styles.sectionTitle} htmlFor="spot-trivia">AR trivia</label>
                  <p style={styles.hint}>One fact per line — each line becomes one card in the app's AR trivia popup.</p>
                  <textarea id="spot-trivia" name="trivia" value={form.trivia} onChange={handleChange} style={styles.textarea} className="modern-input" rows={6} placeholder={'The present church was built from 1885 to 1888.\nThe Malolos Congress opened here on September 15, 1898.'} />
                </div>
              </section>
              </>)}
            </TabPanel>
          )}

          {visited.has('food') && (
            <TabPanel id="food" active={tab === 'food'}>
              {!initial?._id ? (
                <section style={styles.section}>
                  <div style={styles.emptyNote}>
                    Save the spot first. New spots get their missions created automatically —
                    reopen this spot afterwards to set up its food recommendation.
                  </div>
                </section>
              ) : loadingMission ? (
                <section style={styles.section}>
                  <div style={styles.emptyNote}>Checking for a food mission…</div>
                </section>
              ) : !locationMission ? (
                <section style={styles.section}>
                  <p style={styles.panelIntro}>
                    This spot has no missions yet — new spots normally get their 3 missions
                    (including this one) created automatically, so this one likely predates that.
                    Create them now and its location can be pinned right here.
                  </p>
                  {missionError && <p style={styles.warningText}><Icon name="alert-triangle" size={12} /> {missionError}</p>}
                  <button
                    type="button"
                    onClick={handleCreateDefaultMissions}
                    disabled={creatingMissions}
                    style={{ ...styles.saveMissionBtn, opacity: creatingMissions ? 0.7 : 1 }}
                    className="modern-btn"
                  >
                    {creatingMissions ? 'Creating…' : <><Icon name="sparkle" size={13} /> Create missions for this spot</>}
                  </button>
                </section>
              ) : (
                <>
                  <section style={styles.section}>
                    <p style={styles.panelIntro}>
                      This spot's 2nd mission — the user must physically be within range of this
                      pin to complete it. Changes here go out together with the spot's own edits
                      when you press {isModerator ? '"Submit for review"' : '"Save changes"'} below —
                      proposed for admin review, same as spot edits, only going live once approved.
                    </p>

                    {missionError && <p style={styles.warningText}><Icon name="alert-triangle" size={12} /> {missionError}</p>}

                    <div style={styles.missionStatusRow}>
                      <span style={missionPinned ? styles.badgeOk : styles.badgeWarn}>
                        {missionPinned
                          ? <><Icon name="map-pin" size={12} /> Location pinned</>
                          : <><Icon name="alert-triangle" size={12} /> Not pinned yet</>}
                      </span>
                    </div>

                    {locationMission.pendingChange && (
                      <div style={styles.missionPendingNote}>
                        <Icon name="clock" size={12} /> A change is already awaiting admin review for this mission
                        {locationMission.pendingChange.locationName ? ` ("${locationMission.pendingChange.locationName}")` : ''}.
                        Submitting again replaces that pending proposal.
                      </div>
                    )}

                    <div style={styles.twoCol}>
                      <div style={styles.field}>
                        <label style={styles.label}>Restaurant name</label>
                        <input
                          value={locationName}
                          onChange={(e) => setLocationName(e.target.value)}
                          style={styles.input} className="modern-input"
                          placeholder="e.g. Kuya's Turo-Turo"
                        />
                      </div>
                      <div style={styles.field}>
                        <label style={styles.label}>Radius (meters)</label>
                        <input
                          type="number"
                          min={10}
                          value={radiusMeters}
                          onChange={(e) => setRadiusMeters(e.target.value)}
                          style={styles.input} className="modern-input"
                        />
                      </div>
                    </div>
                  </section>

                  <section style={styles.section}>
                    <p style={styles.sectionTitle}>Restaurant location</p>
                    <div style={styles.mapHintRow}>
                      <p style={styles.mapHint}>{mapHintFor('mission')}</p>
                      {missionPinned && (
                        <button type="button" onClick={handleClearMissionPin} style={styles.clearPinBtn} className="modern-btn">
                          Clear pin
                        </button>
                      )}
                    </div>

                    <SpotMapPicker {...mapProps} mode="mission" active={tab === 'food'} />
                    <MapLegend mode="mission" {...legendProps} />

                    <div style={styles.coordBlock}>
                      <p style={styles.coordBlockTitle}>Restaurant coordinates</p>
                      <CoordFields
                        lat={missionLat}
                        lng={missionLng}
                        onChange={handleMissionChange}
                        disabled={busy}
                      />
                    </div>
                  </section>

                  <section style={styles.section}>
                    <p style={styles.sectionTitle}>What users see</p>
                    <FileUploadField
                      label="Restaurant photo"
                      hint="Shown beside the restaurant's name in the app"
                      accept="image/*"
                      uploadType="image"
                      previewType="image"
                      value={missionImage}
                      onUploaded={setMissionImage}
                    />
                    <div style={styles.field}>
                      <label style={styles.label}>Restaurant info</label>
                      <textarea
                        value={locationInfo}
                        onChange={(e) => setLocationInfo(e.target.value)}
                        style={styles.textarea} className="modern-input"
                        rows={3}
                        placeholder="e.g. Famous for their sisig and halo-halo. Open 10am–9pm, cash only."
                      />
                      <p style={styles.hint}>Shown to the user under the mission's description.</p>
                    </div>
                  </section>
                </>
              )}
            </TabPanel>
          )}

        </div>

        <div style={styles.footer}>
          <span style={styles.requiredNote}>* Required fields</span>
          <div style={styles.footerRight}>
            <button onClick={handleCancelClick} style={styles.cancelBtn} className="modern-btn" disabled={saving || savingMission}>Cancel</button>
            <button onClick={handleSave} style={{ ...styles.saveBtn, opacity: (saving || savingMission) ? 0.7 : 1 }} className="modern-btn" disabled={saving || savingMission}>
              {saving || savingMission
                ? 'Saving…'
                : initial
                  ? (isModerator ? 'Submit for review' : 'Save changes')
                  : 'Add spot'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

const styles = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 },
  // A fixed height rather than a max: tabs differ a lot in length, and a modal
  // that resizes on every tab switch makes the tab bar jump under the cursor.
  modal:   { background: t.cardBg, borderRadius: radius.xl + 4, width: '100%', maxWidth: 640, height: 'min(88vh, 860px)', display: 'flex', flexDirection: 'column', boxShadow: shadow.lg, border: `1px solid ${t.border}` },

  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px', borderBottom: `1px solid ${t.divider}`, flexShrink: 0 },
  modalTitle:  { fontSize: 17, fontWeight: 700, color: t.textPrimary },
  closeBtn:    { width: 30, height: 30, borderRadius: radius.md, border: 'none', background: t.brandSoft, color: t.textPrimary, fontWeight: 700, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  // ── Tab bar ── scrolls sideways rather than wrapping on a narrow screen.
  tabBar:    { display: 'flex', gap: 4, padding: '0 16px', borderBottom: `1px solid ${t.divider}`, overflowX: 'auto', flexShrink: 0, scrollbarWidth: 'none' },
  // Border as longhands only, and the SAME longhand (borderColor) in both
  // states. Mixing the `borderBottom` shorthand with a `borderBottomColor`
  // override breaks on deselect: React removes the longhand but never
  // re-applies the shorthand, so the old tab kept a text-coloured underline.
  tab:       { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '12px 10px 10px', marginBottom: -1, borderWidth: '0 0 2px 0', borderStyle: 'solid', borderColor: 'transparent', background: 'none', color: t.textSecondary, fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', borderRadius: 0 },
  tabActive: { color: t.textPrimary, borderColor: t.brand },
  tabCount:  { fontSize: 11, fontWeight: 700, lineHeight: '16px', padding: '0 6px', borderRadius: radius.pill, background: t.infoBg, color: t.info },
  tabDot:    { width: 7, height: 7, borderRadius: '50%', background: t.warning, flexShrink: 0 },
  srOnly:    { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 },

  body: { overflowY: 'auto', flex: 1, padding: '0 24px' },

  section:      { padding: '20px 0', borderBottom: `1px solid ${t.divider}`, display: 'flex', flexDirection: 'column', gap: 14 },
  sectionTitle: { fontSize: 12, fontWeight: 700, color: t.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 },
  panelIntro:   { fontSize: 13, color: t.textSecondary, lineHeight: 1.55, margin: 0 },

  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  twoCol: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },

  label:    { fontSize: 13, fontWeight: 600, color: t.textPrimary },
  required: { color: t.danger, fontWeight: 700 },
  hint:     { fontSize: 12, color: t.textMuted, margin: 0 },

  input:    { width: '100%', padding: '10px 12px', borderRadius: radius.md, border: `1px solid ${t.border}`, fontSize: 14, color: t.textPrimary, outline: 'none', background: t.sidebarBg, boxSizing: 'border-box' },
  textarea: { width: '100%', padding: '10px 12px', borderRadius: radius.md, border: `1px solid ${t.border}`, fontSize: 14, color: t.textPrimary, outline: 'none', background: t.sidebarBg, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' },

  // ── Editable coordinates ──
  coordBlock:      { display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderRadius: radius.lg, border: `1px solid ${t.border}`, background: t.sidebarBg },
  coordBlockTitle: { fontSize: 12, fontWeight: 700, color: t.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 },
  coordWrap:       { display: 'flex', flexDirection: 'column', gap: 6 },
  // In an AR row the fields sit between the badge and the Remove button, so
  // this one flexes to fill instead of setting its own width.
  coordWrapSm:     { display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 },
  coordRow:        { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  coordField:      { display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 },
  coordLabel:      { fontSize: 11.5, fontWeight: 600, color: t.textMuted, letterSpacing: '0.02em' },
  coordInput:      { width: '100%', padding: '9px 12px', borderRadius: radius.md, border: `1px solid ${t.border}`, fontSize: 14, color: t.textPrimary, outline: 'none', background: t.cardBg, boxSizing: 'border-box', fontVariantNumeric: 'tabular-nums' },
  coordInputSm:    { width: '100%', padding: '5px 8px', borderRadius: radius.sm, border: `1px solid ${t.border}`, fontSize: 12.5, color: t.textPrimary, outline: 'none', background: t.cardBg, boxSizing: 'border-box', fontVariantNumeric: 'tabular-nums' },
  coordInputError: { borderColor: t.danger },
  coordErrorText:  { fontSize: 11.5, color: t.danger, margin: 0 },

  categoryChips:      { display: 'flex', flexWrap: 'wrap', gap: 8 },
  categoryChip:       { padding: '7px 14px', borderRadius: radius.pill, border: `1px solid ${t.border}`, background: t.sidebarBg, color: t.textSecondary, fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  categoryChipActive: { background: t.brandSolid, borderColor: t.brandSolid, color: '#fff' },

  uploadGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  uploadCard: { display: 'flex', gap: 12, padding: 12, borderRadius: radius.lg, border: `1px solid ${t.border}`, background: t.sidebarBg, boxShadow: shadow.sm },
  uploadCardBody: { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, flex: 1 },

  thumbImg:   { width: 56, height: 56, objectFit: 'cover', borderRadius: radius.md, flexShrink: 0, border: `1px solid ${t.border}` },
  thumbBadge: { width: 56, height: 56, objectFit: 'contain', borderRadius: radius.md, flexShrink: 0, border: `1px solid ${t.border}`, background: t.cardBg },
  thumbEmpty: { width: 56, height: 56, borderRadius: radius.md, flexShrink: 0, border: `1px dashed ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.textMuted, fontSize: 18 },

  uploadRow: { display: 'flex', alignItems: 'center', gap: 8 },
  uploadBtn: { padding: '6px 12px', borderRadius: radius.sm, border: `1px solid ${t.border}`, background: t.cardBg, color: t.textPrimary, fontWeight: 600, fontSize: 12, cursor: 'pointer' },
  clearBtn:  { padding: '6px 10px', borderRadius: radius.sm, border: 'none', background: t.dangerBg, color: t.danger, fontWeight: 600, fontSize: 12, cursor: 'pointer' },

  // ── Map legend ──
  legend:           { display: 'flex', flexWrap: 'wrap', gap: '6px 16px', marginTop: -4 },
  legendItem:       { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: t.textMuted },
  legendItemActive: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: t.textPrimary, fontWeight: 600 },
  modeDot:          { width: 8, height: 8, borderRadius: '50%', display: 'inline-block', flexShrink: 0 },
  ringSwatch:       { width: 11, height: 11, borderRadius: '50%', borderWidth: 2, borderStyle: 'solid', display: 'inline-block', flexShrink: 0, boxSizing: 'border-box' },

  // ── Overlap notes under the maps ──
  overlapOk:    { display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12.5, color: t.success, margin: 0, lineHeight: 1.45 },
  overlapMuted: { fontSize: 12.5, color: t.textMuted, margin: 0 },
  overlapWarn:  { display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px', borderRadius: radius.md, background: t.dangerBg, border: `1px solid ${t.dangerBorder}` },
  overlapTitle: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: t.danger, margin: 0 },
  overlapList:  { margin: 0, paddingLeft: 18, fontSize: 12.5, color: t.textPrimary, lineHeight: 1.55 },
  overlapText:  { fontSize: 12, color: t.textSecondary, margin: 0, lineHeight: 1.5 },

  mapHintRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  mapHint: { fontSize: 12, color: t.textSecondary, margin: 0 },
  clearPinBtn: { fontSize: 12, fontWeight: 600, color: t.danger, background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 },

  missionStatusRow: { display: 'flex', alignItems: 'center', gap: 10 },
  badgeOk:   { padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: t.successBg, color: t.success },
  badgeWarn: { padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: t.warningBg, color: t.warning },
  missionPendingNote: { fontSize: 12, color: t.purple, background: t.purpleBg, borderRadius: radius.md, padding: '8px 12px', lineHeight: 1.5 },
  saveMissionBtn: { alignSelf: 'flex-start', padding: '9px 16px', borderRadius: radius.md, border: 'none', background: t.brandSolid, color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', boxShadow: shadow.sm },

  mapWrap: { display: 'flex', flexDirection: 'column', gap: 8, position: 'relative' },
  searchWrap: { position: 'relative', zIndex: 1000 },
  searchInputRow: { display: 'flex', alignItems: 'center', gap: 6, background: t.sidebarBg, border: `1px solid ${t.border}`, borderRadius: 8, padding: '2px 8px' },
  searchInput: { flex: 1, padding: '8px 4px', border: 'none', background: 'transparent', fontSize: 13, color: t.textPrimary, outline: 'none' },
  searchSpinner: { fontSize: 13, color: t.textMuted, flexShrink: 0 },
  searchClearBtn: { border: 'none', background: 'none', color: t.textMuted, cursor: 'pointer', fontSize: 12, padding: 4, flexShrink: 0 },
  searchDropdown: { position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.35)', overflow: 'hidden', maxHeight: 220, overflowY: 'auto' },
  searchResultItem: { display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', border: 'none', borderBottom: `1px solid ${t.divider}`, background: 'transparent', color: t.textPrimary, fontSize: 12.5, cursor: 'pointer', lineHeight: 1.4 },

  emptyNote: { background: t.sidebarBg, borderRadius: 10, padding: 16, textAlign: 'center', color: t.textSecondary, fontSize: 13, lineHeight: 1.55, border: `1px dashed ${t.border}` },

  arList:       { display: 'flex', flexDirection: 'column', gap: 6 },
  arListRow:    { display: 'flex', alignItems: 'center', gap: 10, background: t.sidebarBg, borderRadius: 8, padding: '8px 12px', border: `1px solid ${t.border}` },
  arBadge:      { fontSize: 12, fontWeight: 700, color: t.info, background: t.infoBg, borderRadius: 6, padding: '3px 8px', flexShrink: 0 },
  removeBtn:    { padding: '5px 10px', background: t.dangerBg, color: t.danger, border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 12, cursor: 'pointer', flexShrink: 0 },

  footer:      { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 24px', borderTop: `1px solid ${t.divider}`, flexShrink: 0 },
  footerRight: { display: 'flex', alignItems: 'center', gap: 10 },
  requiredNote: { fontSize: 12, color: t.textSecondary },
  cancelBtn: { padding: '9px 18px', borderRadius: radius.md, border: `1px solid ${t.border}`, background: 'transparent', color: t.textSecondary, fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  // The one primary CTA on this form — yellow, like the app's accent. The
  // mission backfill button above stays teal so there's never two "the" buttons.
  saveBtn:   { padding: '9px 18px', borderRadius: radius.md, border: 'none', background: t.accent, color: t.onAccent, fontWeight: 700, fontSize: 13, cursor: 'pointer', boxShadow: shadow.sm },

  warningText: { fontSize: 12, color: t.danger, fontWeight: 500, margin: 0 },
  okText:      { fontSize: 12, color: t.success, fontWeight: 500, margin: 0, overflowWrap: 'anywhere' },
  fileLink:    { color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 2 },
};