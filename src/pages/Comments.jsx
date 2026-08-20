import { useEffect, useState } from 'react';
import { commentAPI, bannedAccountsAPI } from '../api/api';
import { theme as t } from '../theme';

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

const initialsOf = (name) =>
  (name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('');

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
        />
      </div>

      {loading ? (
        <div style={s.empty}>Loading…</div>
      ) : error ? (
        <div style={{ ...s.empty, color: t.danger }}>{error}</div>
      ) : visible.length === 0 ? (
        <div style={s.emptyState}>
          <div style={s.emptyIcon}>✓</div>
          <div style={s.emptyText}>No comments found</div>
          <div style={s.emptySub}>Nothing matches your search.</div>
        </div>
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
  const [banDuration,    setBanDuration]    = useState('permanent'); // '7' | '30' | 'permanent'
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
    if (!reason.trim()) { alert('Add a short reason for admin'); return; }
    setSaving(true);
    try {
      const data = await commentAPI.requestReview(comment._id, reason.trim(), proposedAction || null);
      if (data?.success !== false) onUpdated();
      else alert('Failed: ' + (data?.message || 'Unknown error'));
    } catch { alert('Network error'); }
    setSaving(false);
  };

  const remove = async () => {
    if (!confirm('Delete this comment permanently?')) return;
    setSaving(true);
    try {
      const data = await commentAPI.delete(comment._id);
      if (data?.success !== false) onUpdated();
      else alert('Failed: ' + (data?.message || 'Unknown error'));
    } catch { alert('Network error'); }
    setSaving(false);
  };

  const banUser = async () => {
    if (!banReason.trim()) { alert('Add a reason for banning this user'); return; }
    if (!clerkUserId) { alert('Could not identify this user (missing clerkUserId).'); return; }

    const durationDays = banDuration === 'permanent' ? undefined : Number(banDuration);
    const confirmMsg = durationDays
      ? `Suspend ${userName} for ${durationDays} day${durationDays === 1 ? '' : 's'}?`
      : `Permanently ban ${userName}? This archives their account for 30 days before permanent deletion, with a chance to appeal.`;

    if (!confirm(confirmMsg)) return;

    setSaving(true);
    try {
      const data = await bannedAccountsAPI.ban(clerkUserId, banReason.trim(), durationDays);
      if (data?.success !== false) onUpdated();
      else alert('Failed: ' + (data?.message || 'Unknown error'));
    } catch (err) {
      alert(err?.response?.data?.message || 'Network error');
    }
    setSaving(false);
  };

  return (
    <div style={s.card}>
      <div style={s.cardTop} onClick={onToggle}>
        <div style={s.avatar}>{initialsOf(userName)}</div>

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
            <span style={s.react}>👍 {comment.likes || 0}</span>
            <span style={s.react}>👎 {comment.dislikes || 0}</span>
          </div>
        </div>

        {!isModerator && (
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button onClick={(e) => { e.stopPropagation(); onToggle(); }} style={s.btnBanToggle}>
              🚫 Ban User
            </button>
            <button onClick={(e) => { e.stopPropagation(); remove(); }} disabled={saving} style={s.btnDelete}>
              🗑 Delete
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
            rows={2}
          />
          <p style={{ ...s.panelLabel, marginTop: 10 }}>Suggested action (admin has final say)</p>
          <select
            value={proposedAction}
            onChange={e => setProposedAction(e.target.value)}
            style={s.select}
          >
            <option value="">No account action — just review the comment</option>
            <option value="warn">Warn (mute comments temporarily)</option>
            <option value="suspend">Suspend account</option>
          </select>
          <div style={s.actions}>
            <button disabled={saving} onClick={requestReview} style={{ ...s.btn, ...s.btnPrimary, opacity: saving ? 0.6 : 1 }}>
              Send to admin
            </button>
          </div>
        </div>
      )}

      {expanded && !isModerator && (
        <div style={s.panel}>
          <p style={s.panelLabel}>Ban reason (visible on the user's appeal if they submit one)</p>
          <textarea
            value={banReason}
            onChange={e => setBanReason(e.target.value)}
            placeholder={`Why should ${userName} be banned?`}
            style={s.textarea}
            rows={2}
          />

          <p style={{ ...s.panelLabel, marginTop: 10 }}>Duration</p>
          <select
            value={banDuration}
            onChange={e => setBanDuration(e.target.value)}
            style={s.select}
          >
            <option value="7">7 days (Comment Suspension)</option>
            <option value="14">14 days (Comment Suspension)</option>
            <option value="30">30 days (Account Ban)</option>
            <option value="permanent">Permanent (archive + appeal window)</option>
          </select>

          <div style={s.actions}>
            <button disabled={saving} onClick={banUser} style={{ ...s.btn, ...s.btnDanger, opacity: saving ? 0.6 : 1 }}>
              🚫 Confirm Ban
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const s = {
  page:       { padding: '28px 32px', maxWidth: 1100, margin: '0 auto' },
  pageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  pageTitle:  { fontSize: 22, fontWeight: 600, color: t.textPrimary, marginBottom: 4 },
  pageSub:    { fontSize: 13, color: t.textSecondary },
  totalBadge: { fontSize: 13, color: t.textMuted, fontWeight: 500, paddingTop: 4 },

  filterRow:   { marginBottom: 18 },
  searchInput: { width: '100%', padding: '10px 14px', borderRadius: 10, border: `1px solid ${t.border}`, fontSize: 14, background: t.cardBg, outline: 'none', color: t.textPrimary, boxSizing: 'border-box' },

  card:       { background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 14, marginBottom: 10, overflow: 'hidden' },
  cardTop:    { display: 'flex', alignItems: 'flex-start', gap: 14, padding: '16px 18px', cursor: 'pointer' },
  avatar:     { width: 38, height: 38, borderRadius: '50%', background: t.brandSoft, color: t.brand, fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
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
  actions:    { display: 'flex', gap: 8, marginTop: 10 },
  btn:        { padding: '8px 18px', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', border: 'none' },
  btnPrimary: { background: t.brandSolid, color: '#fff' },
  btnDanger:  { background: t.dangerBg, color: t.danger },

  empty:      { padding: 60, textAlign: 'center', color: t.textSecondary },
  emptyState: { textAlign: 'center', padding: '70px 20px' },
  emptyIcon:  { width: 52, height: 52, borderRadius: '50%', background: t.brandSoft, color: t.brand, fontSize: 22, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' },
  emptyText:  { fontSize: 16, fontWeight: 600, color: t.textPrimary, marginBottom: 6 },
  emptySub:   { fontSize: 13, color: t.textSecondary },
};