import { useEffect, useState } from 'react';
import { commentAPI, bannedAccountsAPI } from '../api/api';
import { notify, confirmAction } from '../components/AppAlert';
import {
  Page, PageHeader, Toolbar, SearchInput, List, Button, Tag,
  Loading, ErrorBanner, EmptyState, Avatar, pageStyles as s,
} from '../components/Layout';
import { fmtDateTime } from '../utils/format';
import Icon from '../components/Icon';

// Reviews & Feedback — admin only. Every review travelers have left, and the
// spec's user-management actions on its author: warn, suspend, ban
// permanently, or delete the review itself.

function toArray(data) {
  if (!data) return [];
  if (Array.isArray(data))         return data;
  if (Array.isArray(data.reviews)) return data.reviews;
  if (Array.isArray(data.data))    return data.data;
  return [];
}

export default function Comments() {
  const [comments, setComments] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [search,   setSearch]   = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setComments(toArray(await commentAPI.getAll()));
    } catch {
      setError('Couldn’t load reviews.');
      setComments([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const visible = comments.filter(c => {
    if (!c?._id) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    const spotName = (c.spotId && typeof c.spotId === 'object' ? c.spotId.name : '') || '';
    const userName = (c.userId && typeof c.userId === 'object' ? c.userId.name : c.userName) || '';
    return (c.comment || '').toLowerCase().includes(q)
      || spotName.toLowerCase().includes(q)
      || userName.toLowerCase().includes(q);
  });

  return (
    <Page>
      <PageHeader
        title="Reviews & Feedback"
        count={comments.length}
        subtitle="Every review travelers have left, across all spots. Warn, suspend or ban the author, or delete the review."
        actions={<Button icon="refresh-cw" onClick={load} disabled={loading}>Refresh</Button>}
      />

      <Toolbar>
        <SearchInput
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search reviews, travelers or spots…"
        />
      </Toolbar>

      {loading ? (
        <Loading label="Loading reviews…" />
      ) : error ? (
        <ErrorBanner>{error}</ErrorBanner>
      ) : visible.length === 0 ? (
        <EmptyState
          icon="message-square"
          title={comments.length === 0 ? 'No reviews yet' : 'No reviews match'}
          subtitle={comments.length === 0 ? 'Reviews travelers leave in the app will appear here.' : 'Try a different search.'}
        />
      ) : (
        <List>
          {visible.map(c => (
            <CommentRow
              key={c._id}
              comment={c}
              expanded={expandedId === c._id}
              onToggle={() => setExpandedId(expandedId === c._id ? null : c._id)}
              onUpdated={() => { setExpandedId(null); load(); }}
            />
          ))}
        </List>
      )}
    </Page>
  );
}

function CommentRow({ comment, expanded, onToggle, onUpdated }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const userName = (comment.userId && typeof comment.userId === 'object' ? comment.userId.name : comment.userName) || 'Anonymous';
  const spotName = (comment.spotId && typeof comment.spotId === 'object' ? comment.spotId.name : '') || '—';
  const spotCity = (comment.spotId && typeof comment.spotId === 'object' ? comment.spotId.City : '') || '';

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

  // Suspend applies whatever the *next* suspension step is (7 days, then 14,
  // then a permanent ban) — the backend decides the length, not the admin.
  const suspendUser = () => run({
    confirm: `Suspend ${userName}? This applies the next step automatically: 1st = 7 days, 2nd = 14 days, 3rd = permanent ban.`,
    confirmText: 'Suspend',
    call: () => bannedAccountsAPI.suspend(clerkUserId, reason.trim()),
  });

  const banUser = () => run({
    confirm: `Permanently ban ${userName}? Their account is archived for 30 days before deletion, and they can appeal.`,
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
          </div>
          <p style={s.itemText}>{comment.comment}</p>
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
            Suspensions: the 1st lasts 7 days, the 2nd 14 days, and the 3rd is a permanent ban.
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
