import { useEffect, useState } from 'react';
import { inactiveUsersAPI, accountActionAPI } from '../api/api';
import { notify, confirmAction } from '../components/AppAlert';
import { theme as t, radius, shadow } from '../theme';

const role = () => localStorage.getItem('role');

export default function InactiveUsers() {
  const isModerator = role() === 'moderator';

  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [acting,  setActing]  = useState(null);
  const [proposingId, setProposingId] = useState(null);
  const [proposeReason, setProposeReason] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const data = await inactiveUsersAPI.getAll();
      setUsers(data?.users || []);
    } catch {
      setUsers([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const pendingCount = users.filter(u => u.status === 'pending').length;

  const archive = async (clerkUserId) => {
    if (!(await confirmAction(
      'Approve archival for this user? They will be permanently deleted after 30 days.',
      { danger: true, confirmText: 'Approve Archival' }
    ))) return;
    setActing(clerkUserId);
    try {
      await inactiveUsersAPI.archive(clerkUserId);
      load();
    } catch {
      notify('Failed to archive user.', { tone: 'danger' });
    }
    setActing(null);
  };

  const submitProposal = async (clerkUserId) => {
    if (!proposeReason.trim()) { notify('Add a reason for the suspension request'); return; }
    setActing(clerkUserId);
    try {
      const data = await accountActionAPI.propose(clerkUserId, proposeReason.trim());
      if (data?.success !== false) {
        setProposingId(null);
        setProposeReason('');
        notify('Suspension request sent to admin for approval.', { tone: 'success' });
      } else {
        notify('Failed: ' + (data?.message || 'Unknown error'), { tone: 'danger' });
      }
    } catch (err) {
      notify(err?.response?.data?.message || 'Network error', { tone: 'danger' });
    }
    setActing(null);
  };

  return (
    <div style={s.page}>
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>Inactive Users</h1>
          <p style={s.pageSub}>
            {isModerator
              ? 'Users with 30+ days of inactivity — propose a temporary suspension for admin review'
              : 'Users with 30+ days of inactivity — system-flagged for archival review'}
          </p>
        </div>
        {pendingCount > 0 && (
          <span style={s.alertBadge}>🔔 {pendingCount} pending archival</span>
        )}
      </div>

      <div style={s.card}>
        {loading ? (
          <div style={s.empty}>Loading…</div>
        ) : users.length === 0 ? (
          <div style={s.empty}>No inactive users found.</div>
        ) : (
          <div style={s.tblWrap}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>User</th>
                  <th style={s.th}>Email</th>
                  <th style={s.th}>Last Active</th>
                  <th style={s.th}>Days Inactive</th>
                  <th style={s.th}>Comments</th>
                  <th style={s.th}>Status</th>
                  <th style={s.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <>
                    <tr key={u.clerkUserId} style={s.tr}>
                      <td style={s.td}><span style={s.name}>{u.name}</span></td>
                      <td style={{ ...s.td, color: t.textSecondary }}>{u.email}</td>
                      <td style={s.td}>{u.lastActiveAt ? new Date(u.lastActiveAt).toISOString().slice(0, 10) : '—'}</td>
                      <td style={s.td}>
                        <span style={{ ...s.daysPill, ...(u.daysInactive >= 45 ? s.daysUrgent : {}) }}>
                          ⏱ {u.daysInactive}d
                        </span>
                      </td>
                      <td style={s.td}>{u.commentCount}</td>
                      <td style={s.td}>
                        <span style={{ ...s.statusPill, ...(u.status === 'archived' ? s.statusArchived : s.statusPending) }}>
                          {u.status === 'archived' ? 'ARCHIVED' : 'PENDING'}
                        </span>
                      </td>
                      <td style={s.td}>
                        {u.status !== 'pending' ? '—' : isModerator ? (
                          <button
                            disabled={acting === u.clerkUserId}
                            onClick={() => { setProposingId(proposingId === u.clerkUserId ? null : u.clerkUserId); setProposeReason(''); }}
                            style={{ ...s.btnPropose, opacity: acting === u.clerkUserId ? 0.6 : 1 }}
                            className="modern-btn"
                          >
                            ⏸ Propose Suspension
                          </button>
                        ) : (
                          <button
                            disabled={acting === u.clerkUserId}
                            onClick={() => archive(u.clerkUserId)}
                            style={{ ...s.btnArchive, opacity: acting === u.clerkUserId ? 0.6 : 1 }}
                            className="modern-btn"
                          >
                            🗂 Approve Archival
                          </button>
                        )}
                      </td>
                    </tr>
                    {proposingId === u.clerkUserId && (
                      <tr key={`${u.clerkUserId}-propose`}>
                        <td colSpan={7} style={s.proposeRow}>
                          <textarea
                            value={proposeReason}
                            onChange={e => setProposeReason(e.target.value)}
                            placeholder={`Why should ${u.name} be temporarily suspended?`}
                            style={s.textarea}
                            className="modern-input"
                            rows={2}
                          />
                          <div style={s.proposeActions}>
                            <button
                              disabled={acting === u.clerkUserId}
                              onClick={() => submitProposal(u.clerkUserId)}
                              style={{ ...s.btn, ...s.btnPrimary, opacity: acting === u.clerkUserId ? 0.6 : 1 }}
                              className="modern-btn"
                            >
                              Send to admin
                            </button>
                            <button onClick={() => setProposingId(null)} style={{ ...s.btn, ...s.btnCancel }} className="modern-btn">
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const s = {
  page:       { padding: '28px 32px', maxWidth: 1200, margin: '0 auto' },
  pageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 },
  pageTitle:  { fontSize: 22, fontWeight: 600, color: t.textPrimary, marginBottom: 4 },
  pageSub:    { fontSize: 13, color: t.textSecondary },
  alertBadge: { padding: '7px 14px', background: t.warningBg, color: t.warning, borderRadius: 8, fontSize: 12, fontWeight: 700 },

  card:       { background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: radius.xl, overflow: 'hidden', boxShadow: shadow.sm },
  tblWrap:    { overflowX: 'auto' },
  table:      { width: '100%', borderCollapse: 'collapse' },
  th:         { padding: '11px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '.06em', borderBottom: `1px solid ${t.border}` },
  tr:         { borderTop: `1px solid ${t.divider}` },
  td:         { padding: '13px 16px', fontSize: 13, color: t.textPrimary },
  name:       { fontWeight: 600 },

  daysPill:      { padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: t.warningBg, color: t.warning },
  daysUrgent:    { background: t.dangerBg, color: t.danger },
  statusPill:    { padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 },
  statusPending: { background: t.warningBg, color: t.warning },
  statusArchived:{ background: t.brandSoft, color: t.brand },

  btnArchive: { padding: '6px 14px', background: t.successBg, color: t.success, border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 12, cursor: 'pointer' },
  btnPropose: { padding: '6px 14px', background: t.warningBg, color: t.warning, border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 12, cursor: 'pointer' },
  empty:      { padding: 60, textAlign: 'center', color: t.textSecondary },

  proposeRow:     { padding: '12px 16px 16px', background: t.sidebarBg, borderTop: `1px solid ${t.divider}` },
  textarea:       { width: '100%', padding: '9px 12px', borderRadius: 8, border: `1.5px solid ${t.border}`, fontSize: 13, color: t.textPrimary, background: t.cardBg, resize: 'vertical', outline: 'none', boxSizing: 'border-box' },
  proposeActions: { display: 'flex', gap: 8, marginTop: 8 },
  btn:            { padding: '7px 16px', borderRadius: 8, fontWeight: 600, fontSize: 12.5, cursor: 'pointer', border: 'none' },
  btnPrimary:     { background: t.brandSolid, color: '#fff' },
  btnCancel:      { background: 'transparent', color: t.textMuted, border: `1px solid ${t.border}` },
};