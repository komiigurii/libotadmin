import { Fragment, useEffect, useState } from 'react';
import { bannedAccountsAPI, appealAPI } from '../api/api';
import { notify, confirmAction } from '../components/AppAlert';
import {
  Page, PageHeader, Toolbar, SearchInput, Table, Th, Td, Button, StatusPill,
  Loading, EmptyState, ErrorBanner, Avatar, pageStyles as s,
} from '../components/Layout';
import { fmtDateTime, fmtDay } from '../utils/format';

function remaining(expiresAt) {
  const ms = new Date(expiresAt) - Date.now();
  if (!(ms > 0)) return 'Expired — lifting soon';
  const days = Math.ceil(ms / 86_400_000);
  return `${days} day${days === 1 ? '' : 's'} left`;
}

const APPEAL_STATUS = {
  submitted: { tone: 'info',    icon: 'message-square', label: 'Appeal waiting' },
  approved:  { tone: 'success', icon: 'check',          label: 'Appeal approved' },
  rejected:  { tone: 'neutral', icon: 'x',              label: 'Appeal rejected' },
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
      setError('Couldn’t load suspended and banned accounts.');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleUnban = async (clerkUserId) => {
    if (!(await confirmAction('Lift the suspension or ban on this account?', { confirmText: 'Unban' }))) return;
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
    const approve = decision === 'approved';
    const question = `${approve ? 'Approve' : 'Reject'} this appeal?` +
      (approve ? ' This unbans the account.' : ' The account stays banned.');
    if (!(await confirmAction(question, { danger: !approve, confirmText: approve ? 'Approve & unban' : 'Reject' }))) return;
    setBusyId(clerkUserId);
    try {
      await appealAPI.decide(clerkUserId, decision);
      setExpandedId(null);
      await load();
    } catch (err) {
      notify(`Failed to ${approve ? 'approve' : 'reject'} the appeal: ` + (err?.response?.data?.message || err.message || 'Unknown error'), { tone: 'danger' });
    }
    setBusyId(null);
  };

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    return (u.name?.toLowerCase() || '').includes(q) || (u.email?.toLowerCase() || '').includes(q);
  });

  return (
    <Page>
      <PageHeader
        title="Suspensions & Bans"
        count={users.length}
        subtitle="Accounts suspended or permanently banned for breaking the rules, and any appeals they’ve sent."
        actions={<Button icon="refresh-cw" onClick={load} disabled={loading}>Refresh</Button>}
      />

      {error && <ErrorBanner onDismiss={() => setError('')}>{error}</ErrorBanner>}

      {users.length > 0 && (
        <Toolbar>
          <SearchInput
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email…"
          />
        </Toolbar>
      )}

      {loading ? (
        <Loading label="Loading suspended and banned accounts…" />
      ) : users.length === 0 ? (
        <EmptyState
          icon="check"
          title="No suspended or banned accounts"
          subtitle="Nobody is currently suspended or banned."
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon="users" title="No accounts match" subtitle="Try a different name or email." />
      ) : (
        <Table
          caption="Suspended and banned accounts"
          head={<>
            <Th>Traveler</Th>
            <Th>Reason</Th>
            <Th align="right">Strikes</Th>
            <Th>Status</Th>
            <Th align="right">Action</Th>
          </>}
        >
          {filtered.map(u => {
            const hasAppeal = !!u.appealStatus && u.appealStatus !== 'none';
            const appeal = APPEAL_STATUS[u.appealStatus];
            const expanded = expandedId === u.clerkUserId;
            const busy = busyId === u.clerkUserId;

            return (
              <Fragment key={u.clerkUserId}>
                <tr>
                  <Td>
                    <div style={s.person}>
                      <Avatar src={u.profileImage} name={u.name} size={32} />
                      <div style={{ minWidth: 0 }}>
                        <div style={s.personName}>{u.name || 'Unknown'}</div>
                        <div style={s.personSub}>{u.email}</div>
                      </div>
                    </div>
                  </Td>
                  <Td><span style={s.clampCell} title={u.banReason}>{u.banReason || '—'}</span></Td>
                  <Td align="right">{u.warningCount || 0}</Td>
                  <Td>
                    <div style={s.pillStack}>
                      {u.isPermanent
                        ? <StatusPill tone="danger" icon="slash">Permanent ban</StatusPill>
                        : <StatusPill tone="warning" icon="clock">{remaining(u.suspendedUntil)}</StatusPill>}
                      {appeal && <StatusPill tone={appeal.tone} icon={appeal.icon}>{appeal.label}</StatusPill>}
                    </div>
                  </Td>
                  <Td align="right">
                    <div style={s.cellActions}>
                      {hasAppeal && (
                        <Button size="sm" icon={expanded ? 'chevron-up' : 'chevron-down'} onClick={() => setExpandedId(expanded ? null : u.clerkUserId)}>
                          {expanded ? 'Hide appeal' : 'View appeal'}
                        </Button>
                      )}
                      <Button size="sm" variant="subtle" disabled={busy} onClick={() => handleUnban(u.clerkUserId)}>
                        Unban
                      </Button>
                    </div>
                  </Td>
                </tr>

                {expanded && (
                  <tr>
                    <td colSpan={5} style={s.panel}>
                      <p style={s.panelLabel}>Appeal sent {fmtDateTime(u.appealedAt)}</p>
                      <p style={{ ...s.itemText, margin: 0, whiteSpace: 'pre-wrap' }}>
                        {u.appealText || '(No appeal text provided.)'}
                      </p>
                      {u.deletionDeadline && (
                        <p style={s.panelNote}>
                          The account is scheduled for permanent deletion on {fmtDay(u.deletionDeadline)} if no decision is made.
                        </p>
                      )}
                      {u.appealStatus === 'submitted' ? (
                        <div style={s.buttonRow}>
                          <Button variant="success" icon="check" disabled={busy} onClick={() => handleAppealDecision(u.clerkUserId, 'approved')}>
                            Approve &amp; unban
                          </Button>
                          <Button variant="danger" icon="x" disabled={busy} onClick={() => handleAppealDecision(u.clerkUserId, 'rejected')}>
                            Reject
                          </Button>
                        </div>
                      ) : (
                        <p style={s.panelNote}>This appeal has already been {u.appealStatus}.</p>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </Table>
      )}
    </Page>
  );
}
