import { useEffect, useRef, useState } from 'react';
import { townBadgeAPI, uploadAPI } from '../api/api';
import { theme as t, radius, fonts } from '../theme';
import { Page, PageHeader, Toolbar, FilterTabs, Button, Loading, ErrorBanner, EmptyState, pageStyles } from '../components/Layout';
import Icon from '../components/Icon';
import TownSeal from '../components/TownSeal';
import { notify } from '../components/AppAlert';
import { useLive } from '../api/live';

// Town Badges — a traveler earns a town's badge by finishing every mission at
// every spot in it, and finishing towns earns titles (LibotBackend
// utils/achievements.js). Here the admin sets each town's badge: its image,
// name and description. A town with no image shows the seal the app draws.
// Admins only, like the backend route.

// LibotBackend routes/municipalityBadges.js TOWN_BADGE_LIMITS.
const NAME_MAX = 60;
const DESCRIPTION_MAX = 200;

// Badge art keeps its transparency: resized as PNG, never re-encoded to JPEG.
function shrinkBadge(file, max = 512) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      if (img.width <= max && img.height <= max) { resolve(file); return; }
      const scale = Math.min(max / img.width, max / img.height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => (blob
        ? resolve(new File([blob], file.name.replace(/\.\w+$/, '.png'), { type: 'image/png' }))
        : reject(new Error('Could not resize the image'))), 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read the image')); };
    img.src = url;
  });
}

function TownCard({ town, onSaved }) {
  const [name, setName] = useState(town.saved.name);
  const [description, setDescription] = useState(town.saved.description);
  const [image, setImage] = useState(town.saved.image);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const changed = name !== town.saved.name || description !== town.saved.description || image !== town.saved.image;
  const defaultName = town.municipality;
  const defaultDescription = `Finished every mission in ${town.municipality}`;

  const pick = async (e) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      const { url } = await uploadAPI.spotMedia(await shrinkBadge(file), 'badge');
      setImage(url);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Upload failed');
    }
    setBusy(false);
  };

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const badge = await townBadgeAPI.save(town.municipality, { name: name.trim(), description: description.trim(), image });
      onSaved(town.municipality, badge);
      notify(`${town.municipality}'s badge is saved. Travelers see it next time they open their achievements.`, { tone: 'success', title: 'Saved' });
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Could not save');
    }
    setBusy(false);
  };

  return (
    <article style={s.card} aria-label={`${town.municipality} badge`}>
      <div style={s.art}>
        {image
          ? <img src={image} alt="" style={s.artImg} onError={() => setError('That image link is broken — upload it again.')} />
          : <TownSeal town={town.municipality} size={112} />}
      </div>

      <div style={s.cardBody}>
        <div style={s.cardHead}>
          <h2 style={s.townName}>{town.municipality}</h2>
          <span style={s.meta}>
            {town.spots ? `${town.spots} spot${town.spots === 1 ? '' : 's'}` : 'No spots yet'}
            {' · '}
            {town.earnedBy} earned
          </span>
        </div>

        <label style={s.label} htmlFor={`tb-name-${town.municipality}`}>Badge name</label>
        <input
          id={`tb-name-${town.municipality}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={NAME_MAX}
          placeholder={defaultName}
          disabled={busy}
          style={s.input}
          className="modern-input"
        />

        <label style={s.label} htmlFor={`tb-desc-${town.municipality}`}>Description</label>
        <textarea
          id={`tb-desc-${town.municipality}`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={DESCRIPTION_MAX}
          rows={2}
          placeholder={defaultDescription}
          disabled={busy}
          style={s.textarea}
          className="modern-input"
        />

        <div style={s.actions}>
          <Button size="sm" icon="image" onClick={() => fileRef.current?.click()} disabled={busy}>
            {image ? 'Replace image' : 'Upload image'}
          </Button>
          {image && <Button size="sm" variant="danger" onClick={() => setImage('')} disabled={busy}>Use the seal</Button>}
          <input ref={fileRef} type="file" accept="image/png,image/webp,image/jpeg" onChange={pick} style={{ display: 'none' }} />
          <Button size="sm" variant="primary" onClick={save} disabled={busy || !changed} style={{ marginLeft: 'auto' }}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </div>
        {error && <p style={s.error} role="alert"><Icon name="alert-triangle" size={12} /> {error}</p>}
      </div>
    </article>
  );
}

export default function TownBadges() {
  const [towns, setTowns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [show, setShow] = useState('spots');

  // `quiet`: a live update. Each card keeps what is being typed into it.
  const load = async ({ quiet = false } = {}) => {
    if (!quiet) {
      setLoading(true);
      setError(null);
    }
    try {
      setTowns(await townBadgeAPI.getAdmin());
    } catch (err) {
      console.error('[TownBadges]', err);
      if (!quiet) setError('Couldn’t load the town badges.');
    }
    if (!quiet) setLoading(false);
  };
  useEffect(() => { load(); }, []);
  // Spot counts and "earned by" as they change, and another admin's save.
  useLive(['badges', 'spots', 'progress'], () => load({ quiet: true }));

  const withSpots = towns.filter((x) => x.spots > 0);
  const visible = show === 'spots' ? withSpots : towns;
  const missingArt = withSpots.filter((x) => !x.saved.image).length;

  const onSaved = (municipality, badge) =>
    setTowns((prev) => prev.map((x) => (x.municipality === municipality ? { ...x, ...badge, saved: badge.saved } : x)));

  return (
    <Page>
      <PageHeader
        title="Town Badges"
        count={withSpots.length}
      />

      {error && <ErrorBanner onDismiss={() => setError(null)}>{error}</ErrorBanner>}

      {!loading && missingArt > 0 && (
        <div style={s.note}>
          <Icon name="info" size={14} />
          <span>
            {missingArt} of {withSpots.length} towns with spots have no badge image yet. Until they do, the app shows
            the drawn seal you see here — with the town's name and the Libot star.
          </span>
        </div>
      )}

      <Toolbar>
        <FilterTabs
          label="Show"
          value={show}
          onChange={setShow}
          options={[
            { value: 'spots', label: 'Towns with spots', count: withSpots.length },
            { value: 'all',   label: 'All 24 towns',     count: towns.length },
          ]}
        />
      </Toolbar>

      {loading ? (
        <Loading label="Loading the town badges…" />
      ) : visible.length === 0 ? (
        <EmptyState icon="map-pin" title="No town has spots yet" subtitle="A town's badge can be earned once it has at least one spot." />
      ) : (
        <div style={s.grid}>
          {visible.map((town) => <TownCard key={town.municipality} town={town} onSaved={onSaved} />)}
        </div>
      )}
    </Page>
  );
}

const s = {
  ...pageStyles,
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 },
  card: {
    display: 'flex', gap: 16, padding: 16, background: t.cardBg, borderRadius: radius.lg,
    border: `1px solid ${t.border}`,
  },
  art: {
    width: 112, height: 112, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  artImg: { width: 112, height: 112, objectFit: 'contain', borderRadius: radius.md },
  cardBody: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 },
  cardHead: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 4 },
  townName: { fontFamily: fonts.display, fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em', margin: 0, color: t.textPrimary },
  meta: { fontSize: 12, color: t.textMuted, fontVariantNumeric: 'tabular-nums' },
  label: { fontSize: 11.5, fontWeight: 600, color: t.textMuted, letterSpacing: '0.02em' },
  input: {
    width: '100%', padding: '8px 10px', borderRadius: radius.md, border: `1px solid ${t.border}`, fontSize: 13.5,
    color: t.textPrimary, outline: 'none', background: t.sidebarBg, boxSizing: 'border-box', fontFamily: 'inherit',
  },
  textarea: {
    width: '100%', padding: '8px 10px', borderRadius: radius.md, border: `1px solid ${t.border}`, fontSize: 13.5,
    color: t.textPrimary, outline: 'none', background: t.sidebarBg, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit',
  },
  actions: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 6 },
  error: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: t.danger, margin: 0 },
  note: {
    display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', borderRadius: radius.md,
    background: t.infoBg, color: t.info, fontSize: 13, lineHeight: 1.5,
  },
};
