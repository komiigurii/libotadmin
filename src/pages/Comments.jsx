import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { commentAPI, bannedAccountsAPI } from '../api/api';
import { notify, confirmAction } from '../components/AppAlert';
import {
  Page, PageHeader, Toolbar, SearchInput, FilterTabs, List, Button, StatusPill, Tag,
  Loading, ErrorBanner, EmptyState, Avatar, pageStyles as s,
} from '../components/Layout';
import { fmtDateTime } from '../utils/format';
import Icon from '../components/Icon';

const role = () => localStorage.getItem('role');

// Only a review someone has flagged gets a status — an ordinary review used
// to carry an "ACTIVE" pill, which said nothing on every single row.
const FLAG_STATUS = {
  pending:  { tone: 'warning', icon: 'flag',  label: 'Flagged' },
  approved: { tone: 'success', icon: 'check', label: 'Flag upheld' },
  rejected: { tone: 'neutral', icon: 'x',     label: 'Flag declined' },
};

const ACTION_LABELS = { warn: 'Warn (mute)', suspend: 'Suspend' };

function toArray(data) {
  if (!data) return [];
  if (Array.isArray(data))         return data;
  if (Array.isArray(data.reviews)) return data.reviews;
  if (Array.isArray(data.data))    return data.data;
  return [];
}

export default function Comments() {
  const isModerator = role() === 'moderator';
  // ?show=flagged — the dashboard's "Flagged by moderators" row lands here.
  const [params] = useSearchParams();

  const [comments, setComments] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [search,   setSearch]   = useState('');
  const [show,     setShow]     = useState(params.get('show') === 'flagged' ? 'flagged' : '');
  const [expandedId, setExpandedId] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = isModerator ? await commentAPI.getMine() : await commentAPI.getAll();
      setComments(toArray(data));
    } catch {
      setError('Couldn’t load reviews.');
      setComments([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const flaggedCount = comments.filter((c) => c.flagStatus === 'pending').length;

  const visible = comments.filter(c => {
    if (!c?._id) return false;
    if (show === 'flagged' && c.flagStatus !== 'pending') return false;
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
        subtitle={isModerator
          ? 'Reviews travelers left on spots in your area. Flag one and an admin decides what happens to it.'
          : 'Every review travelers have left, across all spots — including the ones moderators flagged for you.'}
        actions={<Button icon="refresh-cw" onClick={load} disabled={loading}>Refresh</Button>}
      />

      <Toolbar>
        <FilterTabs
          label="Show"
          value={show}
          onChange={setShow}
          options={[
            { value: '',        label: 'All',     count: comments.length },
            { value: 'flagged', label: 'Flagged', count: flaggedCount },
          ]}
        />
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
          icon={show === 'flagged' ? 'check' : 'message-square'}
          title={comments.length === 0 ? 'No reviews yet' : show === 'flagged' && !search ? 'Nothing flagged' : 'No reviews match'}
          subtitle={comments.length === 0
            ? 'Reviews travelers leave in the app will appear here.'
            : show === 'flagged' && !search ? 'No review is waiting on a flag decision.' : 'Try a different search.'}
        />
      ) : (
        <List>
          {visible.map(c => (
            <CommentRow
              key={c._id}
              comment={c}
              isModerator={isModerator}
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

function CommentRow({ comment, isModerator, expanded, onToggle, onUpdated }) {
  const [reason,         setReason]         = useState('');
  const [proposedAction, setProposedAction] = useState('');
  const [banReason,      setBanReason]      = useState('');
  const [saving,         setSaving]         = useState(false);

  const userName  = (comment.userId && typeof comment.userId === 'object' ? comment.userId.name : comment.userName) || 'Anonymous';
  const spotName  = (comment.spotId && typeof comment.spotId === 'object' ? comment.spotId.name : '') || '—';
  const spotCity  = (comment.spotId && typeof comment.spotId === 'object' ? comment.spotId.City : '') || '';
  const flagStatus = comment.flagStatus || 'none';
  const flag = FLAG_STATUS[flagStatus];
  const canRequest = isModerator && flagStatus === 'none';

  // clerkUserId lives directly on the review doc; fall back to a populated
  // userId object just in case the endpoint ever starts populating it.
  const clerkUserId = comment.clerkUserId
    || (comment.userId && typeof comment.userId === 'object' ? comment.userId.clerkUserId : null);

  const requestReview = async () => {
    if (!reason.trim()) { notify('Add a short reason for the admin'); return; }
    setSaving(true);
    try {
      const data = await commentAPI.requestReview(comment._id, reason.trim(), proposedAction || null);
      if (data?.success !== false) onUpdated();
      else notify('Failed: ' + (data?.message || 'Unknown error'), { tone: 'danger' });
    } catch { notify('Network error', { tone: 'danger' }); }
    setSaving(false);
  };

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

  // Suspend applies whatever the *next* escalation step is (7d -> 14d ->
  // auto-ban on the 3rd) — the backend decides the duration, not the admin.
  const suspendUser = async () => {
    if (!banReason.trim()) { notify('Add a reason for suspending this traveler'); return; }
    if (!clerkUserId) { notify('Could not identify this traveler (missing clerkUserId).', { tone: 'danger' }); return; }
    if (!(await confirmAction(
      `Suspend ${userName}? This applies the next escalation step automatically (1st = 7 days, 2nd = 14 days, 3rd = permanent ban).`,
      { danger: true, confirmText: 'Suspend' }
    ))) return;

    setSaving(true);
    try {
      const data = await bannedAccountsAPI.suspend(clerkUserId, banReason.trim());
      if (data?.success !== false) onUpdated();
      else notify('Failed: ' + (data?.message || 'Unknown error'), { tone: 'danger' });
    } catch (err) {
      notify(err?.response?.data?.message || 'Network error', { tone: 'danger' });
    }
    setSaving(false);
  };

  const banUser = async () => {
    if (!banReason.trim()) { notify('Add a reason for banning this traveler'); return; }
    if (!clerkUserId) { notify('Could not identify this traveler (missing clerkUserId).', { tone: 'danger' }); return; }
    if (!(await confirmAction(
      `Permanently ban ${userName}? This archives their account for 30 days before permanent deletion, with a chance to appeal.`,
      { danger: true, confirmText: 'Ban permanently' }
    ))) return;

    setSaving(true);
    try {
      const data = await bannedAccountsAPI.ban(clerkUserId, banReason.trim());
      if (data?.success !== false) onUpdated();
      else notify('Failed: ' + (data?.message || 'Unknown error'), { tone: 'danger' });
    } catch (err) {
      notify(err?.response?.data?.message || 'Network error', { tone: 'danger' });
    }
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
            {flag && <StatusPill tone={flag.tone} icon={flag.icon}>{flag.label}</StatusPill>}
            {flagStatus === 'pending' && comment.proposedAction && (
              <Tag>Suggested: {ACTION_LABELS[comment.proposedAction] || comment.proposedAction}</Tag>
            )}
          </div>
          <p style={s.itemText}>{comment.comment}</p>
          <div style={s.itemFacts}>
            <span style={s.itemFact}><Icon name="thumbs-up" size={12} /> {comment.likes || 0}</span>
            <span style={s.itemFact}><Icon name="thumbs-down" size={12} /> {comment.dislikes || 0}</span>
          </div>
        </div>

        {isModerator ? (
          canRequest && (
            <div style={s.itemSide}>
              <Button size="sm" icon={expanded ? 'chevron-up' : 'flag'} onClick={onToggle}>
                {expanded ? 'Close' : 'Flag for admin'}
              </Button>
            </div>
          )
        ) : (
          <div style={s.itemSide}>
            <Button size="sm" icon={expanded ? 'chevron-up' : 'slash'} onClick={onToggle}>
              {expanded ? 'Close' : 'Suspend / ban'}
            </Button>
            <Button size="sm" variant="danger" icon="trash" disabled={saving} onClick={remove}>
              Delete
            </Button>
          </div>
        )}
      </div>

      {expanded && canRequest && (
        <div style={s.panel}>
          <p style={s.panelLabel}>Why should an admin look at this review?</p>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="e.g. Insults another traveler by name"
            style={s.textarea}
            className="modern-input"
            rows={2}
          />
          <p style={{ ...s.panelLabel, marginTop: 12 }}>Suggested action (the admin has the final say)</p>
          <select
            value={proposedAction}
            onChange={e => setProposedAction(e.target.value)}
            style={s.select}
            className="modern-input"
          >
            <option value="">No account action — just look at the review</option>
            <option value="warn">Warn (mute reviews temporarily)</option>
            <option value="suspend">Suspend account</option>
          </select>
          <div style={s.buttonRow}>
            <Button variant="primary" icon="send" disabled={saving} onClick={requestReview}>
              Send to admin
            </Button>
          </div>
        </div>
      )}

      {expanded && !isModerator && (
        <div style={s.panel}>
          <p style={s.panelLabel}>Reason (shown on the traveler&rsquo;s appeal if they send one)</p>
          <textarea
            value={banReason}
            onChange={e => setBanReason(e.target.value)}
            placeholder={`Why is ${userName} being suspended or banned?`}
            style={s.textarea}
            className="modern-input"
            rows={2}
          />
          <p style={s.panelNote}>
            Suspend applies the next escalation step automatically — 1st = 7 days, 2nd = 14 days,
            3rd becomes a permanent ban. Ban skips straight to permanent.
          </p>
          <div style={s.buttonRow}>
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
