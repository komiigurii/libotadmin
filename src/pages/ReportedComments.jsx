import { useEffect, useState } from 'react';
import { reportAPI, commentAPI } from '../api/api';
import { notify, confirmAction } from '../components/AppAlert';
import { theme as t, radius, shadow } from '../theme';

const STATUS_PILL = {
  pending:   { background: t.purpleBg,  color: t.purple,  label: 'PENDING' },
  reviewed:  { background: t.infoBg,    color: t.info,    label: 'REVIEWED' },
  resolved:  { background: t.successBg, color: t.success, label: 'RESOLVED' },
  dismissed: { background: t.dangerBg,  color: t.danger,  label: 'DISMISSED' },
};

const REASON_LABELS = {
  inappropriate:      'Inappropriate content',
  spam:                'Spam',
  offensive_language:  'Offensive language',
  fake_review:         'Fake review',
  harassment:          'Harassment',
  other:               'Other',
};

function toArray(data) {
  if (!data) return [];
  if (Array.isArray(data))         return data;
  if (Array.isArray(data.reports)) return data.reports;
  if (Array.isArray(data.data))    return data.data;
  return [];
}

const initialsOf = (name) =>
  (name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('');

const shortId = (id) => (id ? `${id.slice(0, 6)}…${id.slice(-4)}` : '—');

export default function ReportedComments() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [acting, setActing] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await reportAPI.getAll({ type: 'review' });
      setReports(toArray(data));
    } catch {
      setError('Failed to load reported comments.');
      setReports([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const visible = reports.filter(r => !statusFilter || r.status === statusFilter);
  const pendingCount = reports.filter(r => r.status === 'pending').length;

  return (
    <div style={s.page}>
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>Reported Comments</h1>
          <p style={s.pageSub}>Comments flagged by app users, awaiting admin review</p>
        </div>
        <span style={s.totalBadge}>{reports.length} total</span>
      </div>

      <div style={s.filterRow}>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={s.filterSelect} className="modern-input">
          <option value="">All ({reports.length})</option>
          <option value="pending">Pending ({pendingCount})</option>
          <option value="resolved">Resolved</option>
          <option value="dismissed">Dismissed</option>
        </select>
      </div>

      {loading ? (
        <div style={s.empty}>Loading…</div>
      ) : error ? (
        <div style={{ ...s.empty, color: t.danger }}>{error}</div>
      ) : visible.length === 0 ? (
        <div style={s.emptyState}>
          <div style={s.emptyIcon}>✓</div>
          <div style={s.emptyText}>No reported comments</div>
          <div style={s.emptySub}>Nothing matches your search.</div>
        </div>
      ) : (
        visible.map(r => (
          <ReportRow
            key={r._id}
            report={r}
            expanded={expandedId === r._id}
            acting={acting === r._id}
            setActing={setActing}
            onToggle={() => setExpandedId(expandedId === r._id ? null : r._id)}
            onUpdated={() => { setExpandedId(null); load(); }}
          />
        ))
      )}
    </div>
  );
}

function ReportRow({ report, expanded, acting, setActing, onToggle, onUpdated }) {
  const review = report.reviewId && typeof report.reviewId === 'object' ? report.reviewId : null;
  const [adminNote, setAdminNote] = useState(report.adminNote || '');

  const pill = STATUS_PILL[report.status] || STATUS_PILL.pending;
  const isPending = report.status === 'pending';
  const commentUserName = review?.userName || 'Unknown user';

  const decide = async (decision) => {
    setActing(report._id);
    try {
      const data = await reportAPI.update(report._id, { decision, adminNote });
      if (data?.success !== false) onUpdated();
      else notify('Failed: ' + (data?.message || 'Unknown error'), { tone: 'danger' });
    } catch (err) {
      notify(err?.response?.data?.message || 'Network error', { tone: 'danger' });
    }
    setActing(null);
  };

  const agree = async () => {
    if (!report.reportedClerkUserId) { notify('No reported user on this report.', { tone: 'danger' }); return; }
    if (!(await confirmAction(
      `Agree with this report? This applies the next warning/suspension step for ${commentUserName} automatically.`,
      { danger: true, confirmText: 'Agree' }
    ))) return;
    await decide('agree');
  };

  const disagree = () => decide('disagree');

  const deleteComment = async () => {
    if (!review?._id) { notify('This comment no longer exists.', { tone: 'danger' }); return; }
    if (!(await confirmAction('Delete this comment permanently?', { danger: true, confirmText: 'Delete' }))) return;
    setActing(report._id);
    try {
      const data = await commentAPI.delete(review._id);
      if (data?.success === false) notify('Failed: ' + (data?.message || 'Unknown error'), { tone: 'danger' });
      else onUpdated();
    } catch { notify('Network error', { tone: 'danger' }); }
    setActing(null);
  };

  // Manual override — skips the 3-warning ladder and bans the reported user
  // immediately. Separate from "Agree" (which only ever issues the next
  // warning/suspension step).
  const banUser = async () => {
    if (!report.reportedClerkUserId) { notify('No reported user on this report.', { tone: 'danger' }); return; }
    if (!(await confirmAction(
      `Permanently ban ${commentUserName}? This is immediate — it does not go through the usual warning/suspension steps.`,
      { danger: true, confirmText: 'Ban Permanently' }
    ))) return;
    setActing(report._id);
    try {
      const data = await reportAPI.ban(report._id, adminNote);
      if (data?.success === false) notify('Failed: ' + (data?.message || 'Unknown error'), { tone: 'danger' });
      else onUpdated();
    } catch (err) {
      notify(err?.response?.data?.message || 'Network error', { tone: 'danger' });
    }
    setActing(null);
  };

  return (
    <div style={s.card} className="modern-card">
      <div style={s.cardTop} onClick={onToggle}>
        <div style={s.avatar}>{initialsOf(commentUserName)}</div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={s.metaRow}>
            <span style={s.userName}>{commentUserName}</span>
            <span style={s.dateText}>
              {report.createdAt ? new Date(report.createdAt).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
            </span>
            <span style={s.reasonPill}>{REASON_LABELS[report.reason] || report.reason}</span>
            <span style={{ ...s.statusPill, background: pill.background, color: pill.color }}>{pill.label}</span>
            {report.banApproved && <span style={s.banPill}>PERMANENTLY BANNED</span>}
          </div>

          <p style={s.commentText}>
            {review ? `"${review.comment}"` : 'This comment has been deleted.'}
          </p>

          <div style={s.reactRow}>
            {review?.rating != null && <span style={s.react}>⭐ {review.rating}/5</span>}
            <span style={s.react}>🚩 Reported by user {shortId(report.clerkUserId)}</span>
          </div>

          {report.details && (
            <p style={s.detailsText}><span style={s.detailsLabel}>Reporter's note: </span>{report.details}</p>
          )}

          {report.resultSummary && (
            <p style={s.resultText}><span style={s.detailsLabel}>Action taken: </span>{report.resultSummary}</p>
          )}
        </div>
      </div>

      {expanded && (
        <div style={s.panel}>
          <p style={s.panelLabel}>Admin note</p>
          <textarea
            value={adminNote}
            onChange={e => setAdminNote(e.target.value)}
            placeholder="Internal note about this report…"
            style={s.textarea}
            className="modern-input"
            rows={2}
          />

          {isPending && (
            <p style={s.policyNote}>
              Agreeing issues the next escalation step automatically: 1st warning mutes comments
              for 1 week, 2nd mutes for 2 weeks and auto-suspends the account, and a 3rd
              suspension permanently bans the account.
            </p>
          )}

          <div style={s.actions}>
            {isPending && (
              <>
                <button disabled={acting || !report.reportedClerkUserId} onClick={agree} style={{ ...s.btn, ...s.btnAgree, opacity: (acting || !report.reportedClerkUserId) ? 0.6 : 1 }} className="modern-btn">
                  ✓ Agree
                </button>
                <button disabled={acting} onClick={disagree} style={{ ...s.btn, ...s.btnDisagree, opacity: acting ? 0.6 : 1 }} className="modern-btn">
                  ✕ Disagree
                </button>
              </>
            )}
            <button disabled={acting || !review} onClick={deleteComment} style={{ ...s.btn, ...s.btnDelete, opacity: (acting || !review) ? 0.6 : 1 }} className="modern-btn">
              🗑 Delete Comment
            </button>
            {!report.banApproved && (
              <button
                disabled={acting || !report.reportedClerkUserId}
                onClick={banUser}
                style={{ ...s.btn, ...s.btnBan, opacity: (acting || !report.reportedClerkUserId) ? 0.6 : 1 }}
                className="modern-btn"
                title="Skips the warning ladder — bans the user immediately"
              >
                🔨 Ban Permanently
              </button>
            )}
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

  filterRow:    { marginBottom: 18 },
  filterSelect: { padding: '10px 14px', borderRadius: 10, border: `1px solid ${t.border}`, fontSize: 13, color: t.textPrimary, background: t.cardBg, outline: 'none', cursor: 'pointer' },

  card:       { background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: radius.xl, marginBottom: 12, overflow: 'hidden', boxShadow: shadow.sm },
  cardTop:    { display: 'flex', alignItems: 'flex-start', gap: 14, padding: '16px 18px', cursor: 'pointer' },
  avatar:     { width: 38, height: 38, borderRadius: '50%', background: t.brandSoft, color: t.brand, fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  metaRow:    { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 },
  userName:   { fontSize: 14, fontWeight: 700, color: t.textPrimary },
  dateText:   { fontSize: 12, color: t.textMuted },
  reasonPill: { padding: '3px 10px', background: t.sidebarBg, border: `1px solid ${t.border}`, borderRadius: 20, fontSize: 11, fontWeight: 500, color: t.textSecondary },
  statusPill: { padding: '3px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700, letterSpacing: '0.03em' },
  banPill:    { padding: '3px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700, letterSpacing: '0.02em', background: t.dangerBg, color: t.danger },

  commentText:  { fontSize: 14, color: t.textSecondary, lineHeight: 1.5, margin: '2px 0 8px' },
  reactRow:     { display: 'flex', gap: 14, flexWrap: 'wrap' },
  react:        { fontSize: 12, color: t.textMuted },
  detailsText:  { fontSize: 12.5, color: t.textSecondary, marginTop: 8, lineHeight: 1.5 },
  detailsLabel: { fontWeight: 600, color: t.textPrimary },
  resultText:   { fontSize: 12.5, color: t.success, marginTop: 6, lineHeight: 1.5, fontWeight: 500 },

  panel:      { borderTop: `1px solid ${t.divider}`, padding: '14px 18px 18px', background: t.sidebarBg },
  panelLabel: { fontSize: 12, fontWeight: 600, color: t.textPrimary, margin: '0 0 6px' },
  textarea:   { width: '100%', padding: '9px 12px', borderRadius: 8, border: `1.5px solid ${t.border}`, fontSize: 13, color: t.textPrimary, background: t.cardBg, resize: 'vertical', outline: 'none', boxSizing: 'border-box' },
  policyNote: { fontSize: 11.5, color: t.textMuted, lineHeight: 1.5, margin: '10px 0 0' },

  actions:      { display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  btn:          { padding: '8px 16px', borderRadius: 8, fontWeight: 600, fontSize: 12.5, cursor: 'pointer', border: 'none' },
  btnAgree:     { background: t.successBg, color: t.success },
  btnDisagree:  { background: t.sidebarBg, color: t.textSecondary, border: `1px solid ${t.border}` },
  btnDelete:    { background: t.dangerBg, color: t.danger },
  btnBan:       { background: t.danger, color: '#fff' },

  empty:      { padding: 60, textAlign: 'center', color: t.textSecondary },
  emptyState: { textAlign: 'center', padding: '70px 20px' },
  emptyIcon:  { width: 52, height: 52, borderRadius: '50%', background: t.brandSoft, color: t.brand, fontSize: 22, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' },
  emptyText:  { fontSize: 16, fontWeight: 600, color: t.textPrimary, marginBottom: 6 },
  emptySub:   { fontSize: 13, color: t.textSecondary },
};