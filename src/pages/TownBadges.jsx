import { useEffect, useRef, useState } from 'react';
import api, { townBadgeAPI, spotBadgeAPI, uploadAPI } from '../api/api';
import { theme as t, radius, fonts } from '../theme';
import { Page, PageHeader, Toolbar, FilterTabs, Button, Loading, ErrorBanner, EmptyState, pageStyles } from '../components/Layout';
import Icon from '../components/Icon';
import { Paged, usePaged } from '../components/Pagination';
import { notify, confirmAction } from '../components/AppAlert';
import { useLive } from '../api/live';

// Badges — the tiers of achievement (LibotBackend utils/achievements.js; the
// thesis panel, 2026-10-24): finishing every mission at a spot earns its badge
// (iron, set only here since 2026-10-25: the spot form no longer has it, so a
// new spot goes live without one until an admin adds it; removing its image
// switches it off until a new one is set); every spot in a town, its badge and "<Town> Traveler" (bronze);
// every town in a district that has spots, the district's badge and "District
// 1 Traveler" (silver); every town in Bulacan, the Bulacan badge and The GOAT
// Traveler (gold, 2026-10-25). Here the admin sets each town's and district's
// badge image, and Bulacan's (first under Districts), and that image is the
// badge — no drawn stand-in. The name and wording are the same
// pattern for every one and can't be edited (mock defense notes, 2026-10-23:
// edited wording would make the achievements inconsistent), so a save also
// puts back any town wording changed before. Admins only, like the backend
// routes.

// The district badges' and the Bulacan badge's images (LibotBackend routes/districtBadges.js).
const districtBadgeAPI = {
  getAdmin: () => api.get('/api/achievements/district-badges/admin')
    .then((r) => ({ districts: r.data.districts || [], bulacan: r.data.bulacan || null })),
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
// A spot badge comes with no title: it counts toward its town's.
const KINDS = {
  spot: {
    tier: 'Iron',
    id: (x) => x.spotId,
    name: (x) => x.name,
    meta: (x) => `${x.municipality || 'No municipality'} · ${x.earnedBy} earned`,
    wording: (x) => `Finished every mission at ${x.name}`,
    reward: (x) => (x.municipality
      ? <span>· Counts toward the <strong style={s.titleName}>{x.municipality}</strong> badge</span>
      : null),
    removeNote: (name) => `${name}'s badge can't be earned until a new image is uploaded, and it leaves the app's badge list. Travelers who earned it keep it.`,
    save: (x, image) => spotBadgeAPI.save(x.spotId, image),
  },
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
  bulacan: {
    tier: 'Gold',
    id: () => 'bulacan',
    name: () => 'Bulacan',
    wording: () => 'Finished every mission in every municipality of Bulacan with spots',
    title: (x) => x.title?.name || 'The GOAT Traveler',
    save: (x, image) => districtBadgeAPI.save('bulacan', { image }),
  },
};

const KIND_METAL = { spot: 'iron', town: 'bronze', district: 'silver', bulacan: 'gold' };

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

  // The image is the badge, so taking it off asks first.
  const remove = async () => {
    const ok = await confirmAction(
      k.removeNote?.(name) || `${name}'s badge will have no image until a new one is uploaded. Travelers who earned it keep the badge and its title.`,
      { title: `Remove ${name}'s badge image?`, confirmText: 'Remove image', danger: true },
    );
    if (ok) await saveImage('');
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
    <article style={{ ...s.card, borderTop: `3px solid ${s[KIND_METAL[kind]]}` }} aria-label={`${name} badge`}>
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
            {k.meta ? k.meta(item) : (
              <>
                {item.spots ? `${item.spots} spot${item.spots === 1 ? '' : 's'}` : 'No spots yet'}
                {' · '}
                {item.earnedBy} earned
              </>
            )}
          </span>
        </div>
        <p style={s.wording}>{k.wording(item)}</p>
        <p style={s.titleLine}>
          <span aria-hidden="true" style={{ ...s.dot, background: s[KIND_METAL[kind]] }} />
          <span style={s.tier}>{k.tier}</span>
          {k.reward
            ? k.reward(item)
            : <span>· Comes with the title <strong style={s.titleName}>{k.title(item)}</strong></span>}
        </p>

        <div style={s.actions}>
          <Button size="sm" icon="image" onClick={() => fileRef.current?.click()} disabled={busy}>
            {busy ? 'Saving…' : image ? 'Replace image' : 'Upload image'}
          </Button>
          {image && <Button size="sm" variant="danger" onClick={remove} disabled={busy}>Remove image</Button>}
          <input ref={fileRef} type="file" accept="image/png,image/webp,image/jpeg" onChange={pick} style={{ display: 'none' }} />
        </div>
        {error && <p style={s.error} role="alert"><Icon name="alert-triangle" size={12} /> {error}</p>}
      </div>
    </article>
  );
}

// Spots still missing their badge image first, so they're the first thing seen.
const byMissingThenName = (a, b) =>
  (!!a.saved.image - !!b.saved.image) || a.name.localeCompare(b.name);

export default function TownBadges() {
  const [spotBadges, setSpotBadges] = useState([]);
  const [towns, setTowns] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [bulacan, setBulacan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [show, setShow] = useState('spotBadges');

  // `quiet`: a live update. Each card keeps what is being typed into it.
  const load = async ({ quiet = false } = {}) => {
    if (!quiet) {
      setLoading(true);
      setError(null);
    }
    try {
      const [spotList, townList, above] = await Promise.all([
        spotBadgeAPI.getAdmin(), townBadgeAPI.getAdmin(), districtBadgeAPI.getAdmin(),
      ]);
      setSpotBadges([...spotList].sort(byMissingThenName));
      setTowns(townList);
      setDistricts(above.districts);
      setBulacan(above.bulacan);
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
  // Under Districts, the Bulacan badge comes first: it takes every district.
  const kindOf = (item) => (show === 'spotBadges' ? 'spot'
    : show !== 'districts' ? 'town' : item.key === 'bulacan' ? 'bulacan' : 'district');
  const visible = show === 'spotBadges' ? spotBadges
    : show === 'spots' ? withSpots : show === 'all' ? towns : [...(bulacan ? [bulacan] : []), ...districts];
  const paged = usePaged(visible, show);
  const missingSpotArt = spotBadges.filter((x) => !x.saved.image).length;
  const missingTownArt = withSpots.filter((x) => !x.saved.image).length;
  const missingDistrictArt = districtsWithSpots.filter((x) => !x.saved.image).length;
  const missingBulacanArt = bulacan?.spots > 0 && !bulacan.saved.image;
  const missingCount = missingSpotArt + missingTownArt + missingDistrictArt + (missingBulacanArt ? 1 : 0);

  // A spot keeps its place in the list when its image is saved: re-sorting
  // under the admin's cursor would move the card they just used.
  const onSaved = (savedKind, id, badge) => {
    const merge = (x) => ({ ...x, ...badge, saved: { ...x.saved, ...badge.saved } });
    if (savedKind === 'spot') setSpotBadges((prev) => prev.map((x) => (x.spotId === id ? merge(x) : x)));
    else if (savedKind === 'town') setTowns((prev) => prev.map((x) => (x.municipality === id ? merge(x) : x)));
    else if (savedKind === 'bulacan') setBulacan((prev) => prev && merge(prev));
    else setDistricts((prev) => prev.map((x) => (x.district === id ? merge(x) : x)));
  };

  return (
    <Page>
      <PageHeader
        title="Badges"
        count={loading ? '…' : spotBadges.length + withSpots.length + districtsWithSpots.length + (bulacan?.spots > 0 ? 1 : 0)}
      />

      {error && <ErrorBanner onDismiss={() => setError(null)}>{error}</ErrorBanner>}

      {!loading && missingCount > 0 && (
        <div style={s.note}>
          <Icon name="info" size={14} />
          <span>
            {[
              missingSpotArt && `${missingSpotArt} of ${spotBadges.length} spots`,
              missingTownArt && `${missingTownArt} of ${withSpots.length} municipalities with spots`,
              missingDistrictArt && `${missingDistrictArt} of ${districtsWithSpots.length} districts with spots`,
              missingBulacanArt && 'the Bulacan badge',
            ].filter(Boolean).join(', ').replace(/, ([^,]*)$/, ' and $1')} {missingCount === 1 ? 'has' : 'have'} no badge image yet.
            {missingSpotArt > 0 && ' A spot without one can’t be earned yet.'}
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
            { value: 'spotBadges', label: 'Spots', count: spotBadges.length },
            { value: 'spots',     label: 'Municipalities with spots', count: withSpots.length },
            { value: 'all',       label: 'All 24 municipalities', count: towns.length },
            { value: 'districts', label: 'Districts & Bulacan', count: districts.length + (bulacan ? 1 : 0) },
          ]}
        />
      </Toolbar>

      {loading ? (
        <Loading label="Loading the badges…" kind="tiles" />
      ) : visible.length === 0 ? (
        show === 'spotBadges'
          ? <EmptyState icon="map-pin" title="No spots yet" subtitle="Each spot's badge shows here once the spot is live." />
          : <EmptyState icon="map-pin" title="No municipality has spots yet" subtitle="A municipality's badge can be earned once it has at least one spot." />
      ) : (
        <Paged {...paged} label={show === 'spotBadges' ? 'Spot pages' : show === 'districts' ? 'District pages' : 'Municipality pages'}>
          <div style={s.grid}>
            {paged.rows.map((item) => (
              <BadgeCard key={KINDS[kindOf(item)].id(item)} item={item} kind={kindOf(item)} onSaved={onSaved} />
            ))}
          </div>
        </Paged>
      )}
    </Page>
  );
}

const s = {
  ...pageStyles,
  // The tiers' metals (the app's iron, bronze, silver and gold), only as the cards'
  // top edge and the dot by the tier's name: the words stay in the theme's colours.
  iron: '#5E5A57',
  bronze: '#B4703A',
  silver: '#8E9AA3',
  gold: '#D9B21A',
  dot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0, alignSelf: 'center' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))', gap: 14 },
  // Too narrow for the words beside the image (a small phone): the image
  // goes on top.
  card: {
    display: 'flex', flexWrap: 'wrap', gap: 16, padding: 16, background: t.cardBg, borderRadius: radius.lg,
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
  cardBody: { flex: '1 1 170px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6, overflowWrap: 'anywhere' },
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
