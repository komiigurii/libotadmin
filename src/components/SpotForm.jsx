import { useState, useRef, useEffect } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { theme as t } from '../theme';
import { uploadAPI } from '../api/api';

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

const CATEGORIES = ['Historical', 'Religious', 'Nature', 'Festivals'];

const makeId = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

// Default map center: Malolos City, Bulacan
const DEFAULT_CENTER = { lat: 14.8433, lng: 120.8114 };

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

      const { url } = await uploadAPI.spotMedia(fileToUpload, uploadType);
      onUploaded(url);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Upload failed');
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
      <div style={styles.thumbEmpty}>{value ? '📦' : '—'}</div>
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
          <button type="button" onClick={() => inputRef.current?.click()} style={styles.uploadBtn} disabled={uploading}>
            {uploading ? 'Uploading…' : value ? 'Replace' : 'Choose file'}
          </button>
          {value && !uploading && (
            <button type="button" onClick={() => onUploaded('')} style={styles.clearBtn}>Remove</button>
          )}
          <input ref={inputRef} type="file" accept={accept} onChange={handleFile} style={{ display: 'none' }} />
        </div>

        {error && <p style={styles.warningText}>⚠️ {error}</p>}
        {value && previewType === 'file' && !error && <p style={styles.okText}>✅ {value.split('/').pop()}</p>}
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
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={handleClear} style={styles.searchClearBtn}>✕</button>
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

// ── Merged map: one Leaflet instance shows the spot pin AND every AR
// position pin together. The mode toggle above the map is exclusive: in
// "Spot" mode only the spot pin can be dragged and map clicks move it; in
// "AR" mode only AR pins can be dragged and map clicks add new ones.
function SpotMapPicker({ spotLat, spotLng, onSpotChange, arModels, addingAr, onPlaceAr, onArMove, height = 320 }) {
  const containerRef  = useRef(null);
  const mapRef        = useRef(null);
  const spotMarkerRef = useRef(null);
  const arMarkersRef  = useRef({});

  // Always-fresh refs so the map's event handlers (bound once) see current props/callbacks
  const stateRef = useRef({ addingAr, onSpotChange, onPlaceAr, onArMove });
  useEffect(() => {
    stateRef.current = { addingAr, onSpotChange, onPlaceAr, onArMove };
  });

  const spotIcon = useRef(
    L.divIcon({
      html: '<div style="background:#8b4440;width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>',
      className: '',
      iconSize: [26, 26],
      iconAnchor: [13, 26],
    })
  ).current;

  const makeArIcon = (num) =>
    L.divIcon({
      html: `<div style="background:#2c5f9e;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.4);color:#fff;font-weight:700;font-size:12px;">${num}</div>`,
      className: '',
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });

  // Initialize the map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const hasSpot  = spotLat !== '' && spotLat != null && spotLng !== '' && spotLng != null;
    const startLat = hasSpot ? parseFloat(spotLat) : DEFAULT_CENTER.lat;
    const startLng = hasSpot ? parseFloat(spotLng) : DEFAULT_CENTER.lng;

    const map = L.map(containerRef.current, { zoomControl: false }).setView([startLat, startLng], hasSpot ? 16 : 13);
    mapRef.current = map;

    // Zoom +/- control, moved down to the bottom-right corner instead of
    // Leaflet's default top-left placement.
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    map.on('click', (e) => {
      const { addingAr, onSpotChange, onPlaceAr } = stateRef.current;
      if (addingAr) onPlaceAr(e.latlng.lat, e.latlng.lng);
      else onSpotChange(e.latlng.lat, e.latlng.lng);
    });

    // Fix sizing glitches when the map first renders inside a scrolling modal
    setTimeout(() => map.invalidateSize(), 150);

    return () => {
      map.remove();
      mapRef.current = null;
      spotMarkerRef.current = null;
      arMarkersRef.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the spot marker in sync with props (set, moved, dragged, or cleared)
  useEffect(() => {
    if (!mapRef.current) return;
    const hasSpot = spotLat !== '' && spotLat != null && spotLng !== '' && spotLng != null;

    if (!hasSpot) {
      if (spotMarkerRef.current) {
        mapRef.current.removeLayer(spotMarkerRef.current);
        spotMarkerRef.current = null;
      }
      return;
    }

    const la = parseFloat(spotLat);
    const ln = parseFloat(spotLng);

    if (spotMarkerRef.current) {
      const cur = spotMarkerRef.current.getLatLng();
      if (Math.abs(cur.lat - la) > 1e-9 || Math.abs(cur.lng - ln) > 1e-9) {
        spotMarkerRef.current.setLatLng([la, ln]);
      }
    } else {
      spotMarkerRef.current = L.marker([la, ln], { icon: spotIcon, draggable: !stateRef.current.addingAr })
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

      mapRef.current.setView([la, ln], mapRef.current.getZoom());
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
      const hasCoords = model.lat !== '' && model.lat != null && model.lng !== '' && model.lng != null;
      if (!hasCoords) return;

      const la  = parseFloat(model.lat);
      const ln  = parseFloat(model.lng);
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
        marker = L.marker([la, ln], { icon: makeArIcon(num), draggable: stateRef.current.addingAr })
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

  // Lock dragging to the active mode: Spot mode → only the spot pin drags;
  // AR mode → only AR pins drag.
  useEffect(() => {
    if (!mapRef.current) return;
    if (spotMarkerRef.current) {
      if (addingAr) spotMarkerRef.current.dragging?.disable();
      else spotMarkerRef.current.dragging?.enable();
    }
    Object.values(arMarkersRef.current).forEach(marker => {
      if (addingAr) marker.dragging?.enable();
      else marker.dragging?.disable();
    });
  }, [addingAr]);

  return (
    <div style={styles.mapWrap}>
      <MapSearch mapRef={mapRef} />
      <div
        ref={containerRef}
        style={{ height, borderRadius: 12, overflow: 'hidden', border: `1px solid ${t.border}` }}
      />
    </div>
  );
}

export default function SpotForm({ initial, onSave, onCancel, saving = false, isModerator = false, lockedCity = '' }) {
  const [form, setForm] = useState({
    name:            initial?.name             || '',
    category:        (Array.isArray(initial?.category) ? initial.category : (initial?.category ? [initial.category] : [])).filter(c => CATEGORIES.includes(c)),
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

  // Pinning mode: false = Spot mode (drag/click moves the spot pin only),
  // true = AR mode (click adds a new AR pin, existing AR pins are draggable).
  // Stays armed until toggled back so several AR pins can be placed in a row.
  const [addingAr, setAddingAr] = useState(false);

  // Snapshot of the form's starting values, used to detect unsaved changes on Cancel
  const initialSnapshotRef = useRef(null);
  if (initialSnapshotRef.current === null) {
    initialSnapshotRef.current = JSON.stringify({ form, arModels });
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

  const handleCancelClick = () => {
    const currentSnapshot = JSON.stringify({ form, arModels });
    if (currentSnapshot !== initialSnapshotRef.current) {
      if (!window.confirm('You have unsaved changes. Discard them and close this form?')) return;
    }
    onCancel();
  };

  const handleSave = () => {
  if (!form.name.trim()) {
    return alert('Name is required');
  }
  if (!form.category.length) {
    return alert('Select at least one category');
  }
  if (!form.city.trim()) {
    return alert('City is required');
  }
  if (!form.image) {
    return alert('Image is required');
  }
  if (
    form.coordinates_lat === '' ||
    form.coordinates_lng === ''
  ) {
    return alert('Spot location is required');
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
    coordinates: {
      lat: Number(form.coordinates_lat),
      lng: Number(form.coordinates_lng),
    },
    modelsCoordinates: arModels
      .filter(
        model =>
          model.lat !== '' &&
          model.lat != null &&
          model.lng !== '' &&
          model.lng != null
      )
      .map(model => ({
        label: model.label || 'Model',
        lat: Number(model.lat),
        lng: Number(model.lng),
      })),
  };
  onSave(payload);
};

  const mapHint = addingAr
    ? `Click the map to drop AR ${arModels.length + 1}. Drag any AR pin to fine-tune it.`
    : form.coordinates_lat && form.coordinates_lng
      ? 'Click the map or drag the pin to move the spot location.'
      : 'Click the map to set the spot location.';

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>

        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>
            {initial
              ? (isModerator ? 'Propose Edit' : 'Edit Spot')
              : 'Add New Spot'}
          </h2>
          <button onClick={handleCancelClick} style={styles.closeBtn} disabled={saving}>✕</button>
        </div>

        <div style={styles.body}>

          <section style={styles.section}>
            <p style={styles.sectionTitle}>Basic info</p>

            <div style={styles.field}>
              <label style={styles.label}>Name <span style={styles.required}>*</span></label>
              <input name="name" value={form.name} onChange={handleChange} style={styles.input} placeholder="e.g. Barasoain Church" />
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
                <input name="city" value={form.city} onChange={handleChange} style={styles.input} placeholder="e.g. Malolos City" />
              )}
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Category <span style={styles.required}>*</span></label>
              <div style={styles.categoryChips}>
                {CATEGORIES.map(cat => {
                  const active = form.category.includes(cat);
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => toggleCategory(cat)}
                      style={{ ...styles.categoryChip, ...(active ? styles.categoryChipActive : {}) }}
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
                <input name="entranceFee" value={form.entranceFee} onChange={handleChange} style={styles.input} placeholder="Free or ₱50" />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Visiting hours</label>
                <input name="visitingHours" value={form.visitingHours} onChange={handleChange} style={styles.input} placeholder="6am – 10pm" />
              </div>
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Description</label>
              <textarea name="description" value={form.description} onChange={handleChange} style={styles.textarea} rows={3} placeholder="Short description of the spot..." />
            </div>
          </section>

          <section style={styles.section}>
            <p style={styles.sectionTitle}>Media</p>
            <div style={styles.uploadGrid}>
              <FileUploadField label="Spot image" required accept="image/*" uploadType="image" previewType="image" value={form.image} onUploaded={setField('image')} />
              <FileUploadField label="Badge image" hint="Reward for visiting" accept="image/*" uploadType="badge" previewType="badge" value={form.Badge} onUploaded={setField('Badge')} />
              <FileUploadField label="Display 3D model" hint=".glb — spot detail screen" accept=".glb,.gltf" uploadType="model" previewType="file" value={form.modelUrl} onUploaded={setField('modelUrl')} />
              <FileUploadField label="AR 3D model" hint=".glb — AR camera" accept=".glb,.gltf" uploadType="model" previewType="file" value={form.ARModelUrl} onUploaded={setField('ARModelUrl')} />
            </div>
          </section>

          <section style={styles.section}>
            <div style={styles.mapSectionHeader}>
              <p style={styles.sectionTitle}>Location &amp; AR positions <span style={styles.required}>*</span></p>
              <div style={styles.modeToggle}>
                <button
                  type="button"
                  onClick={() => setAddingAr(false)}
                  style={{ ...styles.modeBtn, ...(!addingAr ? styles.modeBtnActiveSpot : {}) }}
                >
                  <span style={{ ...styles.modeDot, background: '#8b4440' }} />
                  Spot
                </button>
                <button
                  type="button"
                  onClick={() => setAddingAr(true)}
                  style={{ ...styles.modeBtn, ...(addingAr ? styles.modeBtnActiveAr : {}) }}
                >
                  <span style={{ ...styles.modeDot, background: '#2c5f9e' }} />
                  AR position
                </button>
              </div>
            </div>

            <div style={styles.mapHintRow}>
              <p style={styles.mapHint}>{mapHint}</p>
              {!addingAr && form.coordinates_lat && form.coordinates_lng && (
                <button type="button" onClick={handleClearSpot} style={styles.clearPinBtn}>
                  Clear pin
                </button>
              )}
            </div>

            <SpotMapPicker
              spotLat={form.coordinates_lat}
              spotLng={form.coordinates_lng}
              onSpotChange={handleSpotChange}
              arModels={arModels}
              addingAr={addingAr}
              onPlaceAr={handlePlaceAr}
              onArMove={handleArMove}
            />

            {arModels.length === 0 ? (
              <div style={styles.emptyAr}>No AR positions yet. Switch to "AR position" mode above, then tap the map.</div>
            ) : (
              <div style={styles.arList}>
                {arModels.map((model, index) => (
                  <div key={model.id} style={styles.arListRow}>
                    <span style={styles.arBadge}>AR {index + 1}</span>
                    <span style={styles.arListCoords}>
                      {model.lat && model.lng ? `${parseFloat(model.lat).toFixed(6)}, ${parseFloat(model.lng).toFixed(6)}` : 'Not set'}
                    </span>
                    <button onClick={() => removeArModel(model.id)} style={styles.removeBtn}>Remove</button>
                  </div>
                ))}
              </div>
            )}
          </section>

        </div>

        <div style={styles.footer}>
          <span style={styles.requiredNote}>* Required fields</span>
          <div style={styles.footerRight}>
            <button onClick={handleCancelClick} style={styles.cancelBtn} disabled={saving}>Cancel</button>
            <button onClick={handleSave} style={{ ...styles.saveBtn, opacity: saving ? 0.7 : 1 }} disabled={saving}>
              {saving
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
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 },
  modal:   { background: t.cardBg, borderRadius: 16, width: '100%', maxWidth: 640, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,0.5)', border: `1px solid ${t.border}` },

  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px', borderBottom: `1px solid ${t.divider}`, flexShrink: 0 },
  modalTitle:  { fontSize: 17, fontWeight: 700, color: t.textPrimary },
  closeBtn:    { width: 30, height: 30, borderRadius: 8, border: 'none', background: t.brandSoft, color: t.textPrimary, fontWeight: 700, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  body: { overflowY: 'auto', flex: 1, padding: '0 24px' },

  section:      { padding: '20px 0', borderBottom: `1px solid ${t.divider}`, display: 'flex', flexDirection: 'column', gap: 14 },
  sectionTitle: { fontSize: 12, fontWeight: 700, color: t.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em' },

  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  twoCol: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },

  label:    { fontSize: 13, fontWeight: 600, color: t.textPrimary },
  required: { color: t.danger, fontWeight: 700 },
  hint:     { fontSize: 12, color: t.textMuted, margin: 0 },

  input:    { width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${t.border}`, fontSize: 14, color: t.textPrimary, outline: 'none', background: t.sidebarBg, boxSizing: 'border-box' },
  textarea: { width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${t.border}`, fontSize: 14, color: t.textPrimary, outline: 'none', background: t.sidebarBg, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' },

  categoryChips:      { display: 'flex', flexWrap: 'wrap', gap: 8 },
  categoryChip:       { padding: '7px 14px', borderRadius: 20, border: `1px solid ${t.border}`, background: t.sidebarBg, color: t.textSecondary, fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  categoryChipActive: { background: t.brandSolid, borderColor: t.brandSolid, color: '#fff' },

  uploadGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  uploadCard: { display: 'flex', gap: 12, padding: 12, borderRadius: 10, border: `1px solid ${t.border}`, background: t.sidebarBg },
  uploadCardBody: { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, flex: 1 },

  thumbImg:   { width: 56, height: 56, objectFit: 'cover', borderRadius: 8, flexShrink: 0, border: `1px solid ${t.border}` },
  thumbBadge: { width: 56, height: 56, objectFit: 'contain', borderRadius: 8, flexShrink: 0, border: `1px solid ${t.border}`, background: t.cardBg },
  thumbEmpty: { width: 56, height: 56, borderRadius: 8, flexShrink: 0, border: `1px dashed ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.textMuted, fontSize: 18 },

  uploadRow: { display: 'flex', alignItems: 'center', gap: 8 },
  uploadBtn: { padding: '6px 12px', borderRadius: 7, border: `1px solid ${t.border}`, background: t.cardBg, color: t.textPrimary, fontWeight: 600, fontSize: 12, cursor: 'pointer' },
  clearBtn:  { padding: '6px 10px', borderRadius: 7, border: 'none', background: t.dangerBg, color: t.danger, fontWeight: 600, fontSize: 12, cursor: 'pointer' },

  mapSectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' },

  modeToggle:        { display: 'inline-flex', border: `1px solid ${t.border}`, borderRadius: 9, overflow: 'hidden' },
  modeBtn:           { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 14px', background: t.sidebarBg, color: t.textSecondary, border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  modeBtnActiveSpot: { background: t.brandSoft, color: t.textPrimary },
  modeBtnActiveAr:   { background: t.brandSoft, color: t.textPrimary },
  modeDot:           { width: 8, height: 8, borderRadius: '50%', display: 'inline-block', flexShrink: 0 },

  mapHintRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  mapHint: { fontSize: 12, color: t.textSecondary, margin: 0 },
  clearPinBtn: { fontSize: 12, fontWeight: 600, color: t.danger, background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 },

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
  arBadge:      { fontSize: 12, fontWeight: 700, color: '#2c5f9e', background: '#2c5f9e1a', borderRadius: 6, padding: '3px 8px', flexShrink: 0 },
  arListCoords: { flex: 1, fontSize: 12, color: t.textSecondary, fontVariantNumeric: 'tabular-nums' },
  removeBtn:    { padding: '5px 10px', background: t.dangerBg, color: t.danger, border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 12, cursor: 'pointer', flexShrink: 0 },

  footer:      { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 24px', borderTop: `1px solid ${t.divider}`, flexShrink: 0 },
  footerRight: { display: 'flex', alignItems: 'center', gap: 10 },
  requiredNote: { fontSize: 12, color: t.textSecondary },
  cancelBtn: { padding: '9px 18px', borderRadius: 8, border: `1px solid ${t.border}`, background: 'transparent', color: t.textSecondary, fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  saveBtn:   { padding: '9px 18px', borderRadius: 8, border: 'none', background: t.brandSolid, color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' },

  warningText: { fontSize: 12, color: t.danger, fontWeight: 500, margin: 0 },
  okText:      { fontSize: 12, color: t.success, fontWeight: 500, margin: 0 },
};