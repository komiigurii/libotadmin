import { useCallback, useEffect, useState } from 'react';
import { commentAPI, bannedAccountsAPI } from '../api/api';
import { notify, confirmAction } from '../components/AppAlert';
import {
  Page, PageHeader, Toolbar, SearchInput, FilterTabs, List, Button, Tag, StatusPill,
  Loading, ErrorBanner, EmptyState, Avatar, ReviewPhotos, pageStyles as s,
} from '../components/Layout';
import Pagination, { PAGE_SIZE, PagerFoot } from '../components/Pagination';
import { fmtDateTime, fmtNum } from '../utils/format';
import Icon from '../components/Icon';
import { theme as t, radius } from '../theme';
import { useLive } from '../api/live';

// Rate and Review — admin only (named as the paper names it; it was "Reviews
// & Feedback"). Every review travelers have left, ten to a page, and the
// spec's user-management actions on its author: warn, suspend, ban
// permanently, or delete the review itself.
//
// Mock defense 2026-10-21: travelers no longer report reviews; the server
// masks bad words with *** as a review is posted. Those reviews carry a
// "Filtered" tag and have their own tab, and the admin can read what was
// actually written, to warn the writer.

const STARS = [{ value: '', label: 'Any rating' }, ...[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} star${n === 1 ? '' : 's'}` }))];

export default function Comments() {
  const [data,     setData]     = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [query,    setQuery]    = useState('');
  const [search,   setSearch]   = useState('');
  const [tab,      setTab]      = useState('');
  const [rating,   setRating]   = useState('');
  const [page,     setPage]     = useState(1);
  const [expandedId, setExpandedId] = useState(null);

  // Search waits for a pause in typing, then starts again from page 1.
  useEffect(() => {
    const timer = setTimeout(() => { setSearch(query.trim()); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // `quiet`: a live update — no spinner, and a failure keeps the page shown.
  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) {
      setLoading(true);
      setError(null);
    }
    try {
      setData(await commentAPI.getAll({
        page, limit: PAGE_SIZE,
        ...(search ? { q: search } : {}),
        ...(tab === 'filtered' ? { filtered: 1 } : {}),
        ...(rating ? { rating } : {}),
      }));
    } catch {
      if (!quiet) setError('Couldn’t load reviews.');
    }
    if (!quiet) setLoading(false);
  }, [page, search, tab, rating]);

  useEffect(() => { load(); }, [load]);
  // New reviews as travelers post them; a warning changes the writer's standing.
  useLive(['reviews', 'travelers'], () => load({ quiet: true }));

  const reviews = (data?.reviews || []).filter((c) => c?._id);
  const filtersOn = !!(search || tab || rating);

  return (
    <Page>
      <PageHeader
        title="Rate and Review"
        count={data?.counts?.all}
      />

      <Toolbar>
        <FilterTabs
          label="Which reviews"
          value={tab}
          onChange={(v) => { setTab(v); setPage(1); }}
          options={[
            { value: '', label: 'All', count: data?.counts?.all },
            { value: 'filtered', label: 'Filtered', count: data?.counts?.filtered },
          ]}
        />
        <select value={rating} onChange={(e) => { setRating(e.target.value); setPage(1); }} aria-label="Rating"
          style={{ ...s.select, width: 'auto' }}>
          {STARS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <SearchInput
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search what they wrote, or a traveler’s name…"
        />
      </Toolbar>

      {error && <ErrorBanner>{error}</ErrorBanner>}
      {!data ? (
        <Loading label="Loading reviews…" kind="list" media="avatar" />
      ) : reviews.length === 0 ? (
        <EmptyState
          icon="message-square"
          title={filtersOn ? 'No reviews match' : 'No reviews yet'}
          subtitle={filtersOn
            ? (tab === 'filtered' && !search && !rating ? 'No review has needed masking.' : 'Try a different search or filter.')
            : 'Reviews travelers leave in the app will appear here.'}
        />
      ) : (
        // The page in view stays, dimmed, while the next one loads.
        <div style={{ opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <List>
            {reviews.map(c => (
              <CommentRow
                key={c._id}
                comment={c}
                expanded={expandedId === c._id}
                onToggle={() => setExpandedId(expandedId === c._id ? null : c._id)}
                onUpdated={() => { setExpandedId(null); load(); }}
              />
            ))}
          </List>
          <PagerFoot pinned={data.pages > 1}>
            <span style={s.itemDate}>
              {fmtNum((data.page - 1) * PAGE_SIZE + 1)}–{fmtNum((data.page - 1) * PAGE_SIZE + reviews.length)} of {fmtNum(data.total)}
            </span>
            <Pagination page={data.page} pages={data.pages} onChange={(p) => { setPage(p); window.scrollTo?.(0, 0); }} label="Review pages" />
          </PagerFoot>
        </div>
      )}
    </Page>
  );
}

function CommentRow({ comment, expanded, onToggle, onUpdated }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const userName = (comment.userId && typeof comment.userId === 'object' ? comment.userId.name : comment.userName) || 'Anonymous';
  const spotName = (comment.spotId && typeof comment.spotId === 'object' ? comment.spotId.name : '') || '—';
  const spotCity = (comment.spotId && typeof comment.spotId === 'object' ? comment.spotId.city : '') || '';

  // clerkUserId lives directly on the review doc; fall back to a populated
  // userId object just in case the endpoint ever starts populating it.
  const clerkUserId = comment.clerkUserId
    || (comment.userId && typeof comment.userId === 'object' ? comment.userId.clerkUserId : null);

  // Every action here needs a reason — it's recorded, and shown on the
  // traveler's appeal if they send one.
  const run = async ({ confirm, confirmText, call, needsUser = true }) => {
    if (!reason.trim()) { notify('Add a reason first — it’s recorded with the action.'); return; }
    if (needsUser && !clerkUserId) { notify('Could not identify this traveler.', { tone: 'danger' }); return; }
    if (!(await confirmAction(confirm, { danger: true, confirmText }))) return;
    setSaving(true);
    try {
      const data = await call();
      if (data?.success !== false) {
        if (data?.actionResult?.summary) notify(data.actionResult.summary, { tone: 'success' });
        onUpdated();
      } else {
        notify('Failed: ' + (data?.message || 'Unknown error'), { tone: 'danger' });
      }
    } catch (err) {
      notify(err?.response?.data?.message || 'Network error', { tone: 'danger' });
    }
    setSaving(false);
  };

  const warnUser = () => run({
    confirm: `Warn ${userName}? A 1st warning mutes their reviews for 7 days; a 2nd mutes them for 14 days and suspends the account.`,
    confirmText: 'Warn',
    needsUser: false, // the backend finds the author from the review
    call: () => commentAPI.warnUser(comment._id, reason.trim()),
  });

  // Suspend is 7 days the first time, 14 the second, and the third time the
  // backend bans instead — it decides, not the admin.
  const suspendUser = () => run({
    confirm: `Suspend ${userName}? They can't use their account until it ends. A 1st suspension lasts 7 days and a 2nd lasts 14 days; a 3rd bans them permanently instead.`,
    confirmText: 'Suspend',
    call: () => bannedAccountsAPI.suspend(clerkUserId, reason.trim()),
  });

  const banUser = () => run({
    confirm: `Permanently ban ${userName}? Their account is archived (never deleted), and they have 30 days to appeal.`,
    confirmText: 'Ban permanently',
    call: () => bannedAccountsAPI.ban(clerkUserId, reason.trim()),
  });

  const remove = async () => {
    if (!(await confirmAction('Delete this review permanently?', { danger: true, confirmText: 'Delete review' }))) return;
    setSaving(true);
    try {
      const data = await commentAPI.delete(comment._id);
      if (data?.success !== false) onUpdated();
      else notify('Failed: ' + (data?.message || 'Unknown error'), { tone: 'danger' });
    } catch { notify('Network error', { tone: 'danger' }); }
    setSaving(false);
  };

  return (
    <div style={s.item}>
      <div style={s.itemTop}>
        <Avatar src={comment.userImage} name={userName} size={38} />

        <div style={s.itemMain}>
          <div style={s.itemMeta}>
            <span style={s.itemTitle}>{userName}</span>
            <span style={s.itemDate}>{fmtDateTime(comment.createdAt)}</span>
            <Tag icon="map-pin">{spotName}{spotCity ? ` · ${spotCity}` : ''}</Tag>
            {comment.filtered && <StatusPill tone="warning" icon="eye-off">Filtered</StatusPill>}
          </div>
          <p style={s.itemText}>{comment.comment}</p>
          {comment.filtered && comment.commentOriginal && (
            <p style={orig.box}>
              <span style={orig.label}>What they wrote (only admins see this):</span> {comment.commentOriginal}
            </p>
          )}
          <ReviewPhotos photos={comment.photos} />
          <div style={s.itemFacts}>
            {comment.rating != null && <span style={s.itemFact}><Icon name="star" size={12} /> {comment.rating}/5</span>}
            <span style={s.itemFact}><Icon name="thumbs-up" size={12} /> {comment.likes || 0}</span>
            <span style={s.itemFact}><Icon name="thumbs-down" size={12} /> {comment.dislikes || 0}</span>
          </div>
        </div>

        <div style={s.itemSide}>
          <Button size="sm" icon={expanded ? 'chevron-up' : 'slash'} onClick={onToggle}>
            {expanded ? 'Close' : 'Take action'}
          </Button>
          <Button size="sm" variant="danger" icon="trash" disabled={saving} onClick={remove}>
            Delete
          </Button>
        </div>
      </div>

      {expanded && (
        <div style={s.panel}>
          <p style={s.panelLabel}>Reason (recorded, and shown on the traveler&rsquo;s appeal if they send one)</p>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder={`Why is ${userName} being warned, suspended or banned?`}
            style={s.textarea}
            className="modern-input"
            rows={2}
          />
          <p style={s.panelNote}>
            Warnings: the 1st mutes reviews for 7 days; the 2nd mutes for 14 days and suspends the account.
            Suspensions lock the account until they end: the 1st lasts 7 days, the 2nd 14 days; the 3rd is a permanent ban.
            Ban skips straight to permanent.
          </p>
          <div style={s.buttonRow}>
            <Button variant="warning" icon="alert-triangle" disabled={saving} onClick={warnUser}>
              Warn
            </Button>
            <Button variant="warning" icon="clock" disabled={saving} onClick={suspendUser}>
              Suspend
            </Button>
            <Button variant="dangerSolid" icon="slash" disabled={saving} onClick={banUser}>
              Ban permanently
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// The original of a masked review: muted, set apart, for the admin only.
const orig = {
  box:   { fontSize: 12.5, color: t.textSecondary, lineHeight: 1.5, margin: '8px 0 0', padding: '8px 10px', borderRadius: radius.md, background: t.sidebarBg, border: `1px solid ${t.divider}`, overflowWrap: 'anywhere' },
  label: { fontWeight: 600, color: t.textMuted },
};
