import { useEffect, useRef, useState } from 'react';
import api, { townBadgeAPI, uploadAPI } from '../api/api';
import { theme as t, radius, fonts } from '../theme';
import { Page, PageHeader, Toolbar, FilterTabs, Button, Loading, ErrorBanner, EmptyState, pageStyles } from '../components/Layout';
import Icon from '../components/Icon';
import { Paged, usePaged } from '../components/Pagination';
import { notify } from '../components/AppAlert';
import { useLive } from '../api/live';

// Town & District Badges — the tiers of achievement (LibotBackend
// utils/achievements.js; the thesis panel, 2026-10-24): finishing every mission
// at every spot in a town earns its badge and "<Town> Traveler" (bronze);
// every town in a district that has spots, the district's badge and "District
// 1 Traveler" (silver); every town in Bulacan, The GOAT Traveler (gold, a title
// only). Here the admin sets each town's and district's badge image, and that
// image is the badge — no drawn stand-in. The name and wording are the same
// pattern for every one and can't be edited (mock defense notes, 2026-10-23:
// edited wording would make the achievements inconsistent), so a save also
// puts back any town wording changed before. Admins only, like the backend
// routes.

// The district badges' images (LibotBackend routes/districtBadges.js).
const districtBadgeAPI = {
  getAdmin: () => api.get('/api/achievements/district-badges/admin').then((r) => r.data.districts || []),
  save: (district, data) =>
    api.put(`/api/achievements/district-badges/${encodeURIComponent(district)}`, data).then((r) => r.data.badge),
};

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

// What each kind of badge says, and how its image is saved. Every town's badge
// says the same thing about its own town; a district's about its district.
const KINDS = {
  town: {
    tier: 'Bronze',
    id: (x) => x.municipality,
    name: (x) => x.municipality,
    wording: (x) => `Finished every mission in ${x.municipality}`,
    title: (x) => `${x.municipality} Traveler`,
    save: (x, image) => townBadgeAPI.save(x.municipality, { name: '', description: '', image }),
  },
  district: {
    tier: 'Silver',
    id: (x) => x.district,
    name: (x) => x.name,
    wording: (x) => `Finished every mission in ${x.name}: ${x.towns.join(', ')}`,
    title: (x) => x.title?.name || `${x.name} Traveler`,
    save: (x, image) => districtBadgeAPI.save(x.district, { image }),
  },
};

function BadgeCard({ item, kind, onSaved }) {
  const k = KINDS[kind];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const image = item.saved.image;
  const name = k.name(item);

  // An image is saved as soon as it's picked (or taken off): there is
  // nothing else on the card to change.
  const saveImage = async (url) => {
    setBusy(true);
    setError('');
    try {
      const badge = await k.save(item, url);
      onSaved(kind, k.id(item), badge);
      notify(url
        ? `${name}'s badge image is saved. Travelers see it next time they open their achievements.`
        : `${name}'s badge image is removed.`, { tone: 'success', title: 'Saved' });
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Could not save');
    }
    setBusy(false);
  };

  const pick = async (e) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      const { url } = await uploadAPI.spotMedia(await shrinkBadge(file), 'badge');
      await saveImage(url);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Upload failed');
      setBusy(false);
    }
  };

  return (
    <article style={{ ...s.card, borderTop: `3px solid ${kind === 'town' ? s.bronze : s.silver}` }} aria-label={`${name} badge`}>
      <div style={s.art}>
        {image ? (
          <img src={image} alt="" style={s.artImg} onError={() => setError('That image link is broken — upload it again.')} />
        ) : (
          <button type="button" style={s.emptyArt} onClick={() => fileRef.current?.click()} disabled={busy}
            aria-label={`Upload ${name}'s badge image`}>
            <Icon name="image" size={22} />
            <span>No image</span>
          </button>
        )}
      </div>

      <div style={s.cardBody}>
        <div style={s.cardHead}>
          <h2 style={s.townName}>{name}</h2>
          <span style={s.meta}>
            {item.spots ? `${item.spots} spot${item.spots === 1 ? '' : 's'}` : 'No spots yet'}
            {' · '}
            {item.earnedBy} earned
          </span>
        </div>
        <p style={s.wording}>{k.wording(item)}</p>
        <p style={s.titleLine}>
          <span aria-hidden="true" style={{ ...s.dot, background: kind === 'town' ? s.bronze : s.silver }} />
          <span style={s.tier}>{k.tier}</span>
          <span>· Comes with the title <strong style={s.titleName}>{k.title(item)}</strong></span>
        </p>

        <div style={s.actions}>
          <Button size="sm" icon="image" onClick={() => fileRef.current?.click()} disabled={busy}>
            {busy ? 'Saving…' : image ? 'Replace image' : 'Upload image'}
          </Button>
          {image && <Button size="sm" variant="danger" onClick={() => saveImage('')} disabled={busy}>Remove image</Button>}
          <input ref={fileRef} type="file" accept="image/png,image/webp,image/jpeg" onChange={pick} style={{ display: 'none' }} />
        </div>
        {error && <p style={s.error} role="alert"><Icon name="alert-triangle" size={12} /> {error}</p>}
      </div>
    </article>
  );
}

export default function TownBadges() {
  const [towns, setTowns] = useState([]);
  const [districts, setDistricts] = useState([]);
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
      const [townList, districtList] = await Promise.all([townBadgeAPI.getAdmin(), districtBadgeAPI.getAdmin()]);
      setTowns(townList);
      setDistricts(districtList);
    } catch (err) {
      console.error('[TownBadges]', err);
      if (!quiet) setError('Couldn’t load the badges.');
    }
    if (!quiet) setLoading(false);
  };
  useEffect(() => { load(); }, []);
  // Spot counts and "earned by" as they change, and another admin's save.
  useLive(['badges', 'spots', 'progress'], () => load({ quiet: true }));

  const withSpots = towns.filter((x) => x.spots > 0);
  const districtsWithSpots = districts.filter((x) => x.spots > 0);
  const kind = show === 'districts' ? 'district' : 'town';
  const visible = show === 'spots' ? withSpots : show === 'all' ? towns : districts;
  const paged = usePaged(visible, show);
  const missingTownArt = withSpots.filter((x) => !x.saved.image).length;
  const missingDistrictArt = districtsWithSpots.filter((x) => !x.saved.image).length;

  const onSaved = (savedKind, id, badge) => {
    const merge = (x) => ({ ...x, ...badge, saved: { ...x.saved, ...badge.saved } });
    if (savedKind === 'town') setTowns((prev) => prev.map((x) => (x.municipality === id ? merge(x) : x)));
    else setDistricts((prev) => prev.map((x) => (x.district === id ? merge(x) : x)));
  };

  return (
    <Page>
      <PageHeader
        title="Town & District Badges"
        count={loading ? '…' : withSpots.length + districtsWithSpots.length}
      />

      {error && <ErrorBanner onDismiss={() => setError(null)}>{error}</ErrorBanner>}

      {!loading && missingTownArt + missingDistrictArt > 0 && (
        <div style={s.note}>
          <Icon name="info" size={14} />
          <span>
            {[
              missingTownArt && `${missingTownArt} of ${withSpots.length} towns with spots`,
              missingDistrictArt && `${missingDistrictArt} of ${districtsWithSpots.length} districts with spots`,
            ].filter(Boolean).join(' and ')} have no badge image yet.
          </span>
        </div>
      )}

      <Toolbar>
        <FilterTabs
          label="Show"
          pending={loading}
          value={show}
          onChange={setShow}
          options={[
            { value: 'spots',     label: 'Towns with spots', count: withSpots.length },
            { value: 'all',       label: 'All 24 towns',     count: towns.length },
            { value: 'districts', label: 'Districts',        count: districts.length },
          ]}
        />
      </Toolbar>

      {loading ? (
        <Loading label="Loading the badges…" kind="tiles" />
      ) : visible.length === 0 ? (
        <EmptyState icon="map-pin" title="No town has spots yet" subtitle="A town's badge can be earned once it has at least one spot." />
      ) : (
        <Paged {...paged} label={kind === 'town' ? 'Town pages' : 'District pages'}>
          <div style={s.grid}>
            {paged.rows.map((item) => (
              <BadgeCard key={KINDS[kind].id(item)} item={item} kind={kind} onSaved={onSaved} />
            ))}
          </div>
        </Paged>
      )}
    </Page>
  );
}

const s = {
  ...pageStyles,
  // The tiers' metals (the app's bronze and silver), only as the cards' top
  // edge and the dot by the tier's name: the words stay in the theme's colours.
  bronze: '#B4703A',
  silver: '#8E9AA3',
  dot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0, alignSelf: 'center' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 },
  card: {
    display: 'flex', gap: 16, padding: 16, background: t.cardBg, borderRadius: radius.lg,
    border: `1px solid ${t.border}`,
  },
  art: {
    width: 112, height: 112, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  artImg: { width: 112, height: 112, objectFit: 'contain', borderRadius: radius.md },
  emptyArt: {
    width: 112, height: 112, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
    border: `1.5px dashed ${t.border}`, borderRadius: radius.md, background: t.bg, color: t.textMuted,
    fontFamily: 'inherit', fontSize: 14, cursor: 'pointer',
  },
  cardBody: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 },
  cardHead: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 4 },
  townName: { fontFamily: fonts.display, fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em', margin: 0, color: t.textPrimary },
  meta: { fontSize: 12, color: t.textMuted, fontVariantNumeric: 'tabular-nums' },
  wording: { fontSize: 14, color: t.textSecondary, lineHeight: 1.4, margin: 0 },
  titleLine: { display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap', fontSize: 13, color: t.textSecondary, margin: 0 },
  tier: { fontWeight: 700, color: t.textPrimary },
  titleName: { color: t.textPrimary, fontWeight: 600 },
  actions: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 6 },
  error: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: t.danger, margin: 0 },
  note: {
    display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', borderRadius: radius.md,
    background: t.infoBg, color: t.info, fontSize: 13, lineHeight: 1.5,
  },
};
