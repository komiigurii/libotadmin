import { useState, useRef, useEffect, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { theme as t, radius, shadow } from '../theme';
import { uploadAPI, missionAPI, categoryAPI } from '../api/api';
import { notify, confirmAction } from './AppAlert';
import Icon from './Icon';

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
          `Reduce the model's polygon count or export it with Draco compression, then try again.`
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
        {value && previewType === 'file' && !error && <p style={styles.okText}><Icon name="check-circle" size={12} /> {value.split('/').pop()}</p>}
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

// ── Merged map: one Leaflet instance shows the spot pin, every AR position
// pin, and (when a food-recommendation mission exists for this spot) its
// single geofence pin, all together. The mode toggle above the map is
// exclusive: only the pin(s) for the active mode are draggable, and map
// clicks affect only that mode's pin(s).
function SpotMapPicker({
  spotLat, spotLng, onSpotChange,
  arModels, onPlaceAr, onArMove,
  mode = 'spot', // 'spot' | 'ar' | 'mission'
  missionLat, missionLng, onMissionChange,
  height = 320,
}) {
  const containerRef  = useRef(null);
  const mapRef        = useRef(null);
  const spotMarkerRef = useRef(null);
  const arMarkersRef  = useRef({});
  const missionMarkerRef = useRef(null);

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

    const startLat = toNum(spotLat);
    const startLng = toNum(spotLng);
    const hasSpot  = startLat !== null && startLng !== null;

    const map = L.map(containerRef.current, { zoomControl: false })
      .setView([hasSpot ? startLat : DEFAULT_CENTER.lat, hasSpot ? startLng : DEFAULT_CENTER.lng], hasSpot ? 16 : 13);
    mapRef.current = map;

    // Zoom +/- control, moved down to the bottom-right corner instead of
    // Leaflet's default top-left placement.
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spotLat, spotLng]);

  // Keep AR position markers in sync: add new ones, move existing ones,
  // remove deleted ones, and renumber icons/tooltips when the list changes.
  useEffect(() => {
    if (!mapRef.current) return;
    const currentIds = new Set(arModels.map(m => m.id));

    Object.keys(arMarkersRef.current).forEach(id => {
      if (!currentIds.has(id)) {
        mapRef.current.removeLayer(arMarkersRef.current[id]);
        delete arMarkersRef.current[id];
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
        marker.on('dragend', () => {
          const pos = marker.getLatLng();
          stateRef.current.onArMove(thisId, pos.lat, pos.lng);
        });

        arMarkersRef.current[model.id] = marker;
      }
    });
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

      missionMarkerRef.current.on('dragend', () => {
        const pos = missionMarkerRef.current.getLatLng();
        stateRef.current.onMissionChange(pos.lat, pos.lng);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missionLat, missionLng]);

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

  // Any category already on this spot that isn't in the list still gets a chip,
  // so an older or since-renamed value stays visible and removable instead of
  // vanishing from the UI while remaining on the record.
  const categoryOptions = useMemo(
    () => [...new Set([...categories, ...(form.category || [])])],
    [categories, form.category]
  );

  // Pinning mode: 'spot' (drag/click moves the spot pin only), 'ar' (click
  // adds a new AR pin, existing AR pins draggable), or 'mission' (click/drag
  // moves the food-recommendation mission's single geofence pin). Stays
  // armed until switched back so several pins of the same kind can be
  // placed/adjusted in a row.
  const [mode, setMode] = useState('spot');

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
  if (!form.name.trim()) {
    return notify('Name is required');
  }
  if (!form.category.length) {
    return notify('Select at least one category');
  }
  if (!form.city.trim()) {
    return notify('City is required');
  }
  if (!form.image) {
    return notify('Image is required');
  }
  // Typed coordinates can be blank, half-finished ("14.") or out of range, so
  // this checks for a usable number rather than just a non-empty string.
  const spotLatNum = toNum(form.coordinates_lat);
  const spotLngNum = toNum(form.coordinates_lng);
  if (spotLatNum === null || spotLngNum === null) {
    return notify('Spot location is required — pin it on the map or type valid coordinates.');
  }
  const spotCoordErr = coordError(form.coordinates_lat, form.coordinates_lng);
  if (spotCoordErr) return notify(spotCoordErr);

  const badAr = arModels.findIndex(
    (m) => (m.lat !== '' || m.lng !== '') && (toNum(m.lat) === null || toNum(m.lng) === null)
  );
  if (badAr !== -1) {
    return notify(`AR ${badAr + 1} has an incomplete coordinate — fix or remove it.`);
  }

  const payload = {
    name: form.name.trim(),
    category: form.category,
    description: form.description.trim(),
    city: form.city.trim(),
    entranceFee: form.entranceFee.trim(),
    visitingHours: form.visitingHours.trim(),
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
  if (missionResult === 'failed') return;

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

  const mapHint =
    mode === 'ar'
      ? `Click the map to drop AR ${arModels.length + 1}. Drag any AR pin to fine-tune it, or edit its numbers below.`
      : mode === 'mission'
        ? (missionPinned
            ? 'Click the map, drag the pin, or type the coordinates below to move the food mission location.'
            : 'Click the map to pin where the food recommendation actually is — or type its coordinates below.')
        : spotPinned
          ? 'Click the map, drag the pin, or type the coordinates below to move the spot location.'
          : 'Click the map to set the spot location — or type its coordinates below.';

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>

        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>
            {initial
              ? (isModerator ? 'Propose Edit' : 'Edit Spot')
              : 'Add New Spot'}
          </h2>
          <button onClick={handleCancelClick} style={styles.closeBtn} className="modern-btn" disabled={saving || savingMission} aria-label="Close"><Icon name="x" size={13} /></button>
        </div>

        <div style={styles.body}>

          <section style={styles.section}>
            <p style={styles.sectionTitle}>Basic info</p>

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
                <label style={styles.label}>Entrance fee</label>
                <input name="entranceFee" value={form.entranceFee} onChange={handleChange} style={styles.input} className="modern-input" placeholder="Free or ₱50" />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Visiting hours</label>
                <input name="visitingHours" value={form.visitingHours} onChange={handleChange} style={styles.input} className="modern-input" placeholder="6am – 10pm" />
              </div>
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Description</label>
              <textarea name="description" value={form.description} onChange={handleChange} style={styles.textarea} className="modern-input" rows={3} placeholder="Short description of the spot..." />
            </div>
          </section>

          <section style={styles.section}>
            <p style={styles.sectionTitle}>Media</p>
            <div style={styles.uploadGrid}>
              <FileUploadField label="Spot image" required accept="image/*" uploadType="image" previewType="image" value={form.image} onUploaded={setField('image')} />
              <FileUploadField label="Badge image" hint="Reward for visiting" accept="image/*" uploadType="badge" previewType="badge" value={form.Badge} onUploaded={setField('Badge')} />
              <FileUploadField label="Display 3D model" hint=".glb — spot detail screen" accept=".glb,.gltf" uploadType="model" previewType="file" value={form.modelUrl} onUploaded={setField('modelUrl')} />
              <FileUploadField label="AR 3D model" hint=".glb — AR camera" accept=".glb,.gltf" uploadType="model" previewType="file" value={form.ARModelUrl} onUploaded={setField('ARModelUrl')} />
              {initial?._id && locationMission && (
                <FileUploadField
                  label="Restaurant photo"
                  hint="For the 2nd mission's food recommendation"
                  accept="image/*"
                  uploadType="image"
                  previewType="image"
                  value={missionImage}
                  onUploaded={setMissionImage}
                />
              )}
            </div>
          </section>

          <section style={styles.section}>
            <div style={styles.mapSectionHeader}>
              <p style={styles.sectionTitle}>Location &amp; AR positions <span style={styles.required}>*</span></p>
              <div style={styles.modeToggle}>
                <button
                  type="button"
                  onClick={() => setMode('spot')}
                  style={{ ...styles.modeBtn, ...(mode === 'spot' ? styles.modeBtnActiveSpot : {}) }}
                  className="modern-btn"
                >
                  <span style={{ ...styles.modeDot, background: MAP_PIN.spot }} />
                  Spot
                </button>
                <button
                  type="button"
                  onClick={() => setMode('ar')}
                  style={{ ...styles.modeBtn, ...(mode === 'ar' ? styles.modeBtnActiveAr : {}) }}
                  className="modern-btn"
                >
                  <span style={{ ...styles.modeDot, background: MAP_PIN.ar }} />
                  AR position
                </button>
                <button
                  type="button"
                  onClick={() => locationMission && setMode('mission')}
                  disabled={!locationMission}
                  title={
                    !initial?._id ? 'Save this spot first — missions are created afterwards'
                    : loadingMission ? 'Checking for a food mission…'
                    : !locationMission ? 'This spot has no food-recommendation mission yet (none were auto-created for it)'
                    : undefined
                  }
                  style={{
                    ...styles.modeBtn,
                    ...(mode === 'mission' ? styles.modeBtnActiveMission : {}),
                    ...(!locationMission ? styles.modeBtnDisabled : {}),
                  }}
                  className="modern-btn"
                >
                  <span style={{ ...styles.modeDot, background: MAP_PIN.mission }} />
                  {!initial?._id ? 'Food mission (save spot first)'
                    : loadingMission ? 'Food mission (checking…)'
                    : locationMission ? 'Food mission'
                    : 'Food mission (none yet)'}
                </button>
              </div>
            </div>

            <div style={styles.mapHintRow}>
              <p style={styles.mapHint}>{mapHint}</p>
              {mode === 'spot' && spotPinned && (
                <button type="button" onClick={handleClearSpot} style={styles.clearPinBtn} className="modern-btn">
                  Clear pin
                </button>
              )}
              {mode === 'mission' && missionPinned && (
                <button type="button" onClick={handleClearMissionPin} style={styles.clearPinBtn} className="modern-btn">
                  Clear pin
                </button>
              )}
              {addingAr && arModels.length > 0 && (
                <button type="button" onClick={() => setArModels([])} style={styles.clearPinBtn}>
                  Clear all AR pins
                </button>
              )}
            </div>

            <SpotMapPicker
              spotLat={form.coordinates_lat}
              spotLng={form.coordinates_lng}
              onSpotChange={handleSpotChange}
              arModels={arModels}
              onPlaceAr={handlePlaceAr}
              onArMove={handleArMove}
              mode={mode}
              missionLat={missionLat}
              missionLng={missionLng}
              onMissionChange={handleMissionChange}
            />

            <div style={styles.coordBlock}>
              <p style={styles.coordBlockTitle}>Spot coordinates <span style={styles.required}>*</span></p>
              <CoordFields
                lat={form.coordinates_lat}
                lng={form.coordinates_lng}
                onChange={handleSpotChange}
                disabled={saving || savingMission}
              />
              <p style={styles.hint}>
                Type or paste them if you already have the numbers — pasting
                "14.8433, 120.8114" into either box fills both. The pin follows.
              </p>
            </div>

            {arModels.length === 0 ? (
              <div style={styles.emptyAr}>No AR positions yet. Switch to "AR position" mode above, then tap the map.</div>
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
                      disabled={saving || savingMission}
                    />
                    <button onClick={() => removeArModel(model.id)} style={styles.removeBtn} className="modern-btn">Remove</button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {initial?._id && !loadingMission && !locationMission && (
            <section style={styles.section}>
              <p style={styles.sectionTitle}>Food Recommendation Mission</p>
              <p style={styles.hint}>
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
          )}

          {initial?._id && !loadingMission && locationMission && (
            <section style={styles.section}>
              <p style={styles.sectionTitle}>Food Recommendation Mission</p>
              <p style={styles.hint}>
                This spot's 2nd mission — the user must physically be within range of this pin to
                complete it. Switch the map above to "Food mission" mode to place or move it.
                Changes here go out together with the spot's own edits when you press{' '}
                {isModerator ? '"Submit for review"' : '"Save changes"'} below — proposed for
                admin review, same as spot edits, only going live once approved.
              </p>

              {missionError && <p style={styles.warningText}><Icon name="alert-triangle" size={12} /> {missionError}</p>}

              <div style={styles.missionStatusRow}>
                <span style={missionPinned ? styles.badgeOk : styles.badgeWarn}>
                  {missionPinned
                    ? <><Icon name="map-pin" size={12} /> Location pinned</>
                    : <><Icon name="alert-triangle" size={12} /> Not pinned yet</>}
                </span>
              </div>

              <div style={styles.coordBlock}>
                <p style={styles.coordBlockTitle}>Restaurant coordinates</p>
                <CoordFields
                  lat={missionLat}
                  lng={missionLng}
                  onChange={handleMissionChange}
                  disabled={saving || savingMission}
                />
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

              <div style={styles.field}>
                <label style={styles.label}>Restaurant info</label>
                <textarea
                  value={locationInfo}
                  onChange={(e) => setLocationInfo(e.target.value)}
                  style={styles.textarea} className="modern-input"
                  rows={3}
                  placeholder="e.g. Famous for their sisig and halo-halo. Open 10am–9pm, cash only."
                />
                <p style={styles.hint}>Shown to the user below the restaurant photo.</p>
              </div>
            </section>
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
  modal:   { background: t.cardBg, borderRadius: radius.xl + 4, width: '100%', maxWidth: 640, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: shadow.lg, border: `1px solid ${t.border}` },

  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px', borderBottom: `1px solid ${t.divider}`, flexShrink: 0 },
  modalTitle:  { fontSize: 17, fontWeight: 700, color: t.textPrimary },
  closeBtn:    { width: 30, height: 30, borderRadius: radius.md, border: 'none', background: t.brandSoft, color: t.textPrimary, fontWeight: 700, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  body: { overflowY: 'auto', flex: 1, padding: '0 24px' },

  section:      { padding: '20px 0', borderBottom: `1px solid ${t.divider}`, display: 'flex', flexDirection: 'column', gap: 14 },
  sectionTitle: { fontSize: 12, fontWeight: 700, color: t.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em' },

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

  mapSectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' },

  modeToggle:        { display: 'inline-flex', border: `1px solid ${t.border}`, borderRadius: radius.md, overflow: 'hidden' },
  modeBtn:           { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 14px', background: t.sidebarBg, color: t.textSecondary, border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  modeBtnActiveSpot:    { background: t.brandSoft, color: t.textPrimary },
  modeBtnActiveAr:      { background: t.brandSoft, color: t.textPrimary },
  modeBtnActiveMission: { background: t.brandSoft, color: t.textPrimary },
  modeBtnDisabled:      { opacity: 0.45, cursor: 'not-allowed' },
  modeDot:           { width: 8, height: 8, borderRadius: '50%', display: 'inline-block', flexShrink: 0 },

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

  emptyAr: { background: t.sidebarBg, borderRadius: 10, padding: 16, textAlign: 'center', color: t.textSecondary, fontSize: 13, border: `1px dashed ${t.border}` },

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
  okText:      { fontSize: 12, color: t.success, fontWeight: 500, margin: 0 },
};