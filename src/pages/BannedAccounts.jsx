import { useEffect, useState } from 'react';
import { bannedAccountsAPI, appealAPI } from '../api/api';
import { notify, confirmAction } from '../components/AppAlert';
import { theme as t, radius, shadow } from '../theme';
import { pageStyles, Loading, EmptyState, Avatar } from '../components/Layout';
import Icon from '../components/Icon';

function formatRemaining(expiresAt) {
  if (!expiresAt) return 'Permanent';
  const ms = new Date(expiresAt) - Date.now();
  if (ms <= 0) return 'Expired (pending auto-lift)';
  const days = Math.ceil(ms / 86_400_000);
  return `${days} day${days === 1 ? '' : 's'} left`;
}

const APPEAL_BADGE = {
  submitted: { background: t.infoBg,    color: t.info,    label: 'Appeal pending' },
  approved:  { background: t.successBg, color: t.success, label: 'Appeal approved' },
  rejected:  { background: t.dangerBg,  color: t.danger,  label: 'Appeal rejected' },
};

export default function BannedAccounts() {
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [error,   setError]   = useState('');
  const [busyId,  setBusyId]  = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await bannedAccountsAPI.getAll();
      setUsers(data || []);
    } catch (err) {
      console.error('Failed to load banned accounts:', err);
      setError(err.message || 'Failed to load banned accounts');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleUnban = async (clerkUserId) => {
    if (!(await confirmAction('Unban this account?', { confirmText: 'Unban' }))) return;
    setBusyId(clerkUserId);
    try {
      await bannedAccountsAPI.unban(clerkUserId);
      setUsers(prev => prev.filter(u => u.clerkUserId !== clerkUserId));
    } catch (err) {
      notify('Failed to unban: ' + (err.message || 'Unknown error'), { tone: 'danger' });
    }
    setBusyId(null);
  };

  const handleAppealDecision = async (clerkUserId, decision) => {
    const verb = decision === 'approved' ? 'approve' : 'reject';
    const question = `${verb === 'approve' ? 'Approve' : 'Reject'} this appeal?` +
      (decision === 'approved' ? ' This unbans the account.' : ' The account stays banned.');
    if (!(await confirmAction(question, { danger: verb === 'reject', confirmText: verb === 'approve' ? 'Approve' : 'Reject' }))) return;
    setBusyId(clerkUserId);
    try {
      await appealAPI.decide(clerkUserId, decision);
      setExpandedId(null);
      await load();
    } catch (err) {
      notify(`Failed to ${verb} appeal: ` + (err?.response?.data?.message || err.message || 'Unknown error'), { tone: 'danger' });
    }
    setBusyId(null);
  };

  const filtered = users.filter(u => {
    const name  = u.name?.toLowerCase()  || '';
    const email = u.email?.toLowerCase() || '';
    const q = search.toLowerCase();
    return name.includes(q) || email.includes(q);
  });

  return (
    <div style={s.page}>
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>Banned Accounts</h1>
          <p style={s.pageSub}>Accounts suspended or permanently banned for policy violations</p>
        </div>
      </div>

      {error && (
        <div style={s.errorBanner}>
          <Icon name="alert-triangle" size={13} /> {error}
          <button onClick={() => setError('')} style={s.errorClose} aria-label="Dismiss error"><Icon name="x" size={12} /></button>
        </div>
      )}

      {users.length > 0 && (
        <div style={s.filterRow}>
          <input
            placeholder="Search by name or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={s.searchInput}
            className="modern-input"
          />
        </div>
      )}

      {loading ? (
        <Loading label="Loading banned accounts…" />
      ) : users.length === 0 ? (
        <EmptyState
          icon="check"
          title="No banned accounts"
          subtitle="Nobody is currently suspended or banned."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="users"
          title="No accounts match your search"
          subtitle="Try a different name or email."
        />
      ) : (
        <div style={s.list}>
          <div style={s.listHead}>
            <span style={s.colUser}>User</span>
            <span style={s.colReason}>Reason</span>
            <span style={s.colStrikes}>Strikes</span>
            <span style={s.colStatus}>Status</span>
            <span style={s.colActions}></span>
          </div>

          {filtered.map(u => {
            const hasAppeal = !!u.appealStatus && u.appealStatus !== 'none';
            const expanded = expandedId === u.clerkUserId;
            const appealPill = APPEAL_BADGE[u.appealStatus];
            const busy = busyId === u.clerkUserId;

            return (
              <div key={u.clerkUserId} style={s.rowWrap}>
                <div
                  style={{ ...s.row, cursor: hasAppeal ? 'pointer' : 'default' }}
                  className="modern-row"
                  onClick={() => hasAppeal && setExpandedId(expanded ? null : u.clerkUserId)}
                >
                  <div style={s.colUser}>
                    <Avatar src={u.profileImage} name={u.name} size={34} />
                    <div>
                      <div style={s.userName}>{u.name || 'Unknown'}</div>
                      <div style={s.userEmail}>{u.email}</div>
                    </div>
                  </div>

                  <div style={s.colReason} title={u.banReason}>
                    {u.banReason || '—'}
                  </div>

                  <div style={s.colStrikes}>
                    {u.warningCount || 0}
                  </div>

                  <div style={s.colStatus}>
                    <span style={u.isPermanent ? s.badgePermanent : s.badgeTemp}>
                      {u.isPermanent ? 'Permanent' : formatRemaining(u.suspendedUntil)}
                    </span>
                    {appealPill && (
                      <span style={{ ...s.badgeAppeal, background: appealPill.background, color: appealPill.color }}>
                        {appealPill.label} {hasAppeal ? <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={11} /> : null}
                      </span>
                    )}
                  </div>

                  <div style={s.colActions} onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => handleUnban(u.clerkUserId)}
                      style={s.btnUnban}
                      className="modern-btn"
                      disabled={busy}
                    >
                      {busy ? '…' : 'Unban'}
                    </button>
                  </div>
                </div>

                {expanded && (
                  <div style={s.panel}>
                    <p style={s.panelLabel}>
                      Appeal submitted {u.appealedAt ? new Date(u.appealedAt).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                    </p>
                    <p style={s.appealText}>
                      {u.appealText || '(No appeal text provided.)'}
                    </p>
                    {u.deletionDeadline && (
                      <p style={s.deadlineNote}>
                        Account is scheduled for permanent deletion on{' '}
                        {new Date(u.deletionDeadline).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                        {' '}if no decision is made.
                      </p>
                    )}
                    {u.appealStatus === 'submitted' ? (
                      <div style={s.appealActions}>
                        <button
                          disabled={busy}
                          onClick={() => handleAppealDecision(u.clerkUserId, 'approved')}
                          style={{ ...s.btn, ...s.btnApprove, opacity: busy ? 0.6 : 1 }}
                          className="modern-btn"
                        >
                          <Icon name="check" size={12} /> Approve &amp; Unban
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => handleAppealDecision(u.clerkUserId, 'rejected')}
                          style={{ ...s.btn, ...s.btnReject, opacity: busy ? 0.6 : 1 }}
                          className="modern-btn"
                        >
                          <Icon name="x" size={12} /> Reject
                        </button>
                      </div>
                    ) : (
                      <p style={s.decidedNote}>This appeal has already been {u.appealStatus}.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const s = {
  // Page shell, header, toolbar, states and table cells come from
  // components/Layout so every page is spaced identically.
  ...pageStyles,
  // Page shell, header, toolbar, states and table cells come from
  // components/Layout so every page is spaced identically.
  ...pageStyles,
  list:        { background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: radius.xl, overflow: 'hidden', boxShadow: shadow.sm },
  listHead:    { display: 'grid', gridTemplateColumns: '2fr 2fr 0.7fr 1.3fr 100px', gap: 12, alignItems: 'center', padding: '10px 18px', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: t.textMuted, borderBottom: `1px solid ${t.border}` },
  rowWrap:     { borderBottom: `1px solid ${t.divider}` },
  row:         { display: 'grid', gridTemplateColumns: '2fr 2fr 0.7fr 1.3fr 100px', gap: 12, alignItems: 'center', padding: '14px 18px' },

  colUser:     { display: 'flex', alignItems: 'center', gap: 10 },
  colReason:   { fontSize: 13, color: t.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  colStrikes:  { fontSize: 13, fontWeight: 600, color: t.textPrimary },
  colStatus:   { fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' },
  colActions:  { display: 'flex', justifyContent: 'flex-end' },

  userName:    { fontWeight: 600, fontSize: 13.5, color: t.textPrimary },
  userEmail:   { fontSize: 12, color: t.textMuted },

  badgePermanent: { padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: t.dangerBg, color: t.danger },
  badgeTemp:      { padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: t.warningBg, color: t.warning },
  badgeAppeal:    { padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600 },

  btnUnban:    { padding: '6px 14px', background: t.brandSoft, color: t.brand, border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 12, cursor: 'pointer' },

  panel:        { padding: '4px 18px 16px 62px', background: t.sidebarBg },
  panelLabel:   { fontSize: 11.5, fontWeight: 600, color: t.textMuted, margin: '8px 0 6px' },
  appealText:   { fontSize: 13.5, color: t.textPrimary, lineHeight: 1.5, margin: '0 0 8px', whiteSpace: 'pre-wrap' },
  deadlineNote: { fontSize: 12, color: t.warning, margin: '0 0 10px' },
  decidedNote:  { fontSize: 12.5, color: t.textMuted, fontStyle: 'italic', margin: 0 },

  appealActions: { display: 'flex', gap: 8, marginTop: 4 },
  btn:           { padding: '8px 16px', borderRadius: 8, fontWeight: 600, fontSize: 12.5, cursor: 'pointer', border: 'none' },
  btnApprove:    { background: t.successBg, color: t.success },
  btnReject:     { background: t.dangerBg, color: t.danger },

};
