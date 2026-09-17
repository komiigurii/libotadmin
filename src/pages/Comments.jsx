import { useEffect, useState } from 'react';
import { commentAPI, bannedAccountsAPI } from '../api/api';
import { notify, confirmAction } from '../components/AppAlert';
import { theme as t, radius, shadow } from '../theme';
import { pageStyles, Loading, ErrorBanner, EmptyState, Avatar } from '../components/Layout';
import Icon from '../components/Icon';

const role = () => localStorage.getItem('role');

const STATUS_PILL = {
  none:      { background: t.successBg, color: t.success, label: 'ACTIVE' },
  pending:   { background: t.purpleBg,  color: t.purple,  label: 'REVIEW REQUESTED' },
  approved:  { background: t.successBg, color: t.success, label: 'APPROVED' },
  rejected:  { background: t.dangerBg,  color: t.danger,  label: 'REJECTED' },
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

  const [comments, setComments] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [search,   setSearch]   = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = isModerator ? await commentAPI.getMine() : await commentAPI.getAll();
      setComments(toArray(data));
    } catch {
      setError('Failed to load comments.');
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
    <div style={s.page}>
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>All Comments &amp; Feedback</h1>
          <p style={s.pageSub}>
            {isModerator ? 'Viewing comments for your assigned location' : 'Viewing comments across all locations'}
          </p>
        </div>
        <span style={s.totalBadge}>{comments.length} total</span>
      </div>

      <div style={s.filterRow}>
        <input
          placeholder="Search comments, users, or spots…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={s.searchInput}
          className="modern-input"
        />
      </div>

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBanner>{error}</ErrorBanner>
      ) : visible.length === 0 ? (
        <EmptyState
          icon="check"
          title={comments.length === 0 ? 'No comments yet' : 'No comments found'}
          subtitle={comments.length === 0
            ? 'Reviews left in the app will appear here.'
            : 'Nothing matches your search.'}
        />
      ) : (
        visible.map(c => (
          <CommentRow
            key={c._id}
            comment={c}
            isModerator={isModerator}
            expanded={expandedId === c._id}
            onToggle={() => setExpandedId(expandedId === c._id ? null : c._id)}
            onUpdated={() => { setExpandedId(null); load(); }}
          />
        ))
      )}
    </div>
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
  const pill = STATUS_PILL[flagStatus] || STATUS_PILL.none;
  const canRequest = isModerator && flagStatus === 'none';

  // clerkUserId lives directly on the review doc; fall back to a populated
  // userId object just in case the endpoint ever starts populating it.
  const clerkUserId = comment.clerkUserId
    || (comment.userId && typeof comment.userId === 'object' ? comment.userId.clerkUserId : null);

  const requestReview = async () => {
    if (!reason.trim()) { notify('Add a short reason for admin'); return; }
    setSaving(true);
    try {
      const data = await commentAPI.requestReview(comment._id, reason.trim(), proposedAction || null);
      if (data?.success !== false) onUpdated();
      else notify('Failed: ' + (data?.message || 'Unknown error'), { tone: 'danger' });
    } catch { notify('Network error', { tone: 'danger' }); }
    setSaving(false);
  };

  const remove = async () => {
    if (!(await confirmAction('Delete this comment permanently?', { danger: true, confirmText: 'Delete' }))) return;
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
    if (!banReason.trim()) { notify('Add a reason for suspending this user'); return; }
    if (!clerkUserId) { notify('Could not identify this user (missing clerkUserId).', { tone: 'danger' }); return; }
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
    if (!banReason.trim()) { notify('Add a reason for banning this user'); return; }
    if (!clerkUserId) { notify('Could not identify this user (missing clerkUserId).', { tone: 'danger' }); return; }
    if (!(await confirmAction(
      `Permanently ban ${userName}? This archives their account for 30 days before permanent deletion, with a chance to appeal.`,
      { danger: true, confirmText: 'Ban Permanently' }
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
    <div style={s.card} className="modern-card">
      <div style={s.cardTop} onClick={onToggle}>
        <Avatar src={comment.userImage} name={userName} size={38} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={s.metaRow}>
            <span style={s.userName}>{userName}</span>
            <span style={s.dateText}>
              {comment.createdAt ? new Date(comment.createdAt).toLocaleString('en-PH', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
            </span>
            <span style={s.locPill}>{spotName}{spotCity ? ` · ${spotCity}` : ''}</span>
            <span style={{ ...s.statusPill, background: pill.background, color: pill.color }}>{pill.label}</span>
            {flagStatus === 'pending' && comment.proposedAction && (
              <span style={s.suggestPill}>Suggested: {ACTION_LABELS[comment.proposedAction] || comment.proposedAction}</span>
            )}
          </div>
          <p style={s.commentText}>{comment.comment}</p>
          <div style={s.reactRow}>
            <span style={s.react}><Icon name="thumbs-up" size={11} /> {comment.likes || 0}</span>
            <span style={s.react}><Icon name="thumbs-down" size={11} /> {comment.dislikes || 0}</span>
          </div>
        </div>

        {!isModerator && (
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button onClick={(e) => { e.stopPropagation(); onToggle(); }} style={s.btnBanToggle} className="modern-btn">
              <Icon name="slash" size={12} /> Suspend / Ban
            </button>
            <button onClick={(e) => { e.stopPropagation(); remove(); }} disabled={saving} style={s.btnDelete} className="modern-btn">
              <Icon name="trash" size={12} /> Delete
            </button>
          </div>
        )}
      </div>

      {expanded && canRequest && (
        <div style={s.panel}>
          <p style={s.panelLabel}>Reason for admin review</p>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Why should admin look at this comment?"
            style={s.textarea}
            className="modern-input"
            rows={2}
          />
          <p style={{ ...s.panelLabel, marginTop: 10 }}>Suggested action (admin has final say)</p>
          <select
            value={proposedAction}
            onChange={e => setProposedAction(e.target.value)}
            style={s.select}
            className="modern-input"
          >
            <option value="">No account action — just review the comment</option>
            <option value="warn">Warn (mute comments temporarily)</option>
            <option value="suspend">Suspend account</option>
          </select>
          <div style={s.actions}>
            <button disabled={saving} onClick={requestReview} style={{ ...s.btn, ...s.btnPrimary, opacity: saving ? 0.6 : 1 }} className="modern-btn">
              Send to admin
            </button>
          </div>
        </div>
      )}

      {expanded && !isModerator && (
        <div style={s.panel}>
          <p style={s.panelLabel}>Reason (visible on the user's appeal if they submit one)</p>
          <textarea
            value={banReason}
            onChange={e => setBanReason(e.target.value)}
            placeholder={`Why is ${userName} being suspended or banned?`}
            style={s.textarea}
            className="modern-input"
            rows={2}
          />
          <p style={s.escalationNote}>
            Suspend applies the next escalation step automatically — 1st = 7 days, 2nd = 14 days,
            3rd auto-escalates to a permanent ban. Ban skips straight to permanent.
          </p>

          <div style={s.actions}>
            <button disabled={saving} onClick={suspendUser} style={{ ...s.btn, ...s.btnWarn, opacity: saving ? 0.6 : 1 }} className="modern-btn">
              <Icon name="clock" size={12} /> Suspend
            </button>
            <button disabled={saving} onClick={banUser} style={{ ...s.btn, ...s.btnDanger, opacity: saving ? 0.6 : 1 }} className="modern-btn">
              <Icon name="slash" size={12} /> Ban Permanently
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const s = {
  // Page shell, header, toolbar, states and table cells come from
  // components/Layout so every page is spaced identically.
  ...pageStyles,
  // Page-specific: the shared card has no padding, overflow or margin,
  // because those differ by how each page uses a card.
  card: { background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: radius.xl, marginBottom: 12, overflow: 'hidden', boxShadow: shadow.sm },
  totalBadge: { fontSize: 13, color: t.textMuted, fontWeight: 500, paddingTop: 4 },


  cardTop:    { display: 'flex', alignItems: 'flex-start', gap: 14, padding: '16px 18px', cursor: 'pointer' },
  metaRow:    { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 },
  userName:   { fontSize: 14, fontWeight: 700, color: t.textPrimary },
  dateText:   { fontSize: 12, color: t.textMuted },
  locPill:    { padding: '3px 10px', background: t.sidebarBg, border: `1px solid ${t.border}`, borderRadius: 20, fontSize: 11, fontWeight: 500, color: t.textSecondary },
  statusPill: { padding: '3px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700, letterSpacing: '0.03em' },
  suggestPill:{ padding: '3px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700, letterSpacing: '0.02em', background: t.warningBg, color: t.warning },
  commentText:{ fontSize: 14, color: t.textSecondary, lineHeight: 1.5, margin: '2px 0 8px' },
  reactRow:   { display: 'flex', gap: 14 },
  react:      { fontSize: 12, color: t.textMuted },

  btnBanToggle: { padding: '7px 14px', background: t.warningBg, color: t.warning, border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' },
  btnDelete:  { padding: '7px 14px', background: t.dangerBg, color: t.danger, border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' },

  panel:      { borderTop: `1px solid ${t.divider}`, padding: '14px 18px 18px', background: t.sidebarBg },
  panelLabel: { fontSize: 12, fontWeight: 600, color: t.textPrimary, margin: '0 0 6px' },
  textarea:   { width: '100%', padding: '9px 12px', borderRadius: 8, border: `1.5px solid ${t.border}`, fontSize: 13, color: t.textPrimary, background: t.cardBg, resize: 'vertical', outline: 'none', boxSizing: 'border-box' },
  select:     { width: '100%', padding: '9px 12px', borderRadius: 8, border: `1.5px solid ${t.border}`, fontSize: 13, color: t.textPrimary, background: t.cardBg, outline: 'none', boxSizing: 'border-box', cursor: 'pointer' },
  escalationNote: { fontSize: 11.5, color: t.textMuted, lineHeight: 1.5, margin: '10px 0 0' },
  actions:    { display: 'flex', gap: 8, marginTop: 10 },
  btn:        { padding: '8px 18px', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', border: 'none' },
  btnPrimary: { background: t.accent, color: t.onAccent, fontWeight: 700 },
  btnWarn:    { background: t.warningBg, color: t.warning },
  btnDanger:  { background: t.dangerBg, color: t.danger },

};