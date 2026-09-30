import { useEffect, useState } from 'react';
import { inactiveUsersAPI } from '../api/api';
import { notify, confirmAction } from '../components/AppAlert';
import {
  Page, PageHeader, Table, Th, Td, Button, StatusPill, Loading, EmptyState, ErrorBanner, Avatar,
  pageStyles as s,
} from '../components/Layout';
import { fmtDay } from '../utils/format';

// Admin only: moderators work on attractions and their own requests.
export default function InactiveUsers() {

  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [acting,  setActing]  = useState(null);

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

  return (
    <Page>
      <PageHeader
        title="Inactive Accounts"
        count={users.length}
        subtitle='Travelers who haven’t opened the app in 30 days or more. Archiving keeps their record for 30 days, then deletes the account.'
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
                <tr key={u.clerkUserId}>
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
                    {u.status !== 'pending' ? '—' : (
                      <Button size="sm" variant="success" icon="archive" disabled={busy} onClick={() => archive(u.clerkUserId)}>
                        Approve archival
                      </Button>
                    )}
                  </Td>
                </tr>
            );
          })}
        </Table>
      )}
    </Page>
  );
}
