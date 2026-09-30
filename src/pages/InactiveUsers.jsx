import { Fragment, useEffect, useState } from 'react';
import { inactiveUsersAPI, accountActionAPI } from '../api/api';
import { notify, confirmAction } from '../components/AppAlert';
import {
  Page, PageHeader, Table, Th, Td, Button, StatusPill, Loading, EmptyState, ErrorBanner, Avatar,
  pageStyles as s,
} from '../components/Layout';
import { fmtDay } from '../utils/format';

const role = () => localStorage.getItem('role');

export default function InactiveUsers() {
  const isModerator = role() === 'moderator';

  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [acting,  setActing]  = useState(null);
  const [proposingId, setProposingId] = useState(null);
  const [proposeReason, setProposeReason] = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await inactiveUsersAPI.getAll();
      setUsers(data?.users || []);
    } catch {
      setError('Couldn’t load inactive accounts.');
      setUsers([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const archive = async (clerkUserId) => {
    if (!(await confirmAction(
      'Approve archival for this traveler? Their account is permanently deleted after 30 days.',
      { danger: true, confirmText: 'Approve archival' }
    ))) return;
    setActing(clerkUserId);
    try {
      await inactiveUsersAPI.archive(clerkUserId);
      load();
    } catch {
      notify('Failed to archive the account.', { tone: 'danger' });
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
        notify('Suspension request sent to an admin for approval.', { tone: 'success' });
      } else {
        notify('Failed: ' + (data?.message || 'Unknown error'), { tone: 'danger' });
      }
    } catch (err) {
      notify(err?.response?.data?.message || 'Network error', { tone: 'danger' });
    }
    setActing(null);
  };

  return (
    <Page>
      <PageHeader
        title="Inactive Accounts"
        count={users.length}
        subtitle={isModerator
          ? 'Travelers who haven’t opened the app in 30 days or more. Propose a temporary suspension for an admin to review.'
          : 'Travelers who haven’t opened the app in 30 days or more, flagged by the system for archival review.'}
        actions={<Button icon="refresh-cw" onClick={load} disabled={loading}>Refresh</Button>}
      />

      {error && <ErrorBanner onDismiss={() => setError(null)}>{error}</ErrorBanner>}

      {loading ? (
        <Loading label="Loading inactive accounts…" />
      ) : users.length === 0 ? (
        <EmptyState
          icon="check"
          title="No inactive accounts"
          subtitle="Nobody has been away for 30 days or more."
        />
      ) : (
        <Table
          caption="Inactive accounts"
          head={<>
            <Th>Traveler</Th>
            <Th>Last active</Th>
            <Th>Inactive for</Th>
            <Th align="right">Reviews</Th>
            <Th>Status</Th>
            <Th align="right">Action</Th>
          </>}
        >
          {users.map(u => {
            const busy = acting === u.clerkUserId;
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
                  <Td muted>{fmtDay(u.lastActiveAt)}</Td>
                  <Td>
                    {u.daysInactive == null
                      ? <StatusPill tone="neutral" icon="clock">Never active</StatusPill>
                      : <StatusPill tone={u.daysInactive >= 45 ? 'danger' : 'warning'} icon="clock">{u.daysInactive} days</StatusPill>}
                  </Td>
                  <Td align="right">{u.commentCount}</Td>
                  <Td>
                    {u.status === 'archived'
                      ? <StatusPill tone="neutral" icon="archive">Archived</StatusPill>
                      : <StatusPill tone="warning" icon="clock">Pending archival</StatusPill>}
                  </Td>
                  <Td align="right">
                    {u.status !== 'pending' ? '—' : isModerator ? (
                      <Button
                        size="sm"
                        variant="warning"
                        icon="pause"
                        disabled={busy}
                        onClick={() => { setProposingId(proposingId === u.clerkUserId ? null : u.clerkUserId); setProposeReason(''); }}
                      >
                        Propose suspension
                      </Button>
                    ) : (
                      <Button size="sm" variant="success" icon="archive" disabled={busy} onClick={() => archive(u.clerkUserId)}>
                        Approve archival
                      </Button>
                    )}
                  </Td>
                </tr>
                {proposingId === u.clerkUserId && (
                  <tr>
                    <td colSpan={6} style={s.panel}>
                      <p style={s.panelLabel}>Why should {u.name} be temporarily suspended?</p>
                      <textarea
                        value={proposeReason}
                        onChange={e => setProposeReason(e.target.value)}
                        placeholder="e.g. Inactive since signing up with a duplicate account"
                        style={s.textarea}
                        className="modern-input"
                        rows={2}
                      />
                      <div style={s.buttonRow}>
                        <Button variant="primary" icon="send" disabled={busy} onClick={() => submitProposal(u.clerkUserId)}>
                          Send to admin
                        </Button>
                        <Button onClick={() => setProposingId(null)}>Cancel</Button>
                      </div>
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
