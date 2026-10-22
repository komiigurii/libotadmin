import { useEffect, useMemo, useState } from 'react';
import { moderatorsAPI } from '../api/api';
import {
  Page, PageHeader, Toolbar, SearchInput, Button, StatusPill,
  Loading, EmptyState, ErrorBanner, pageStyles as s,
} from '../components/Layout';
import { AddAccountForm, StaffTable } from '../components/StaffAccounts';
import CredentialSlip from '../components/CredentialSlip';

// Moderators — every moderator account, for the administrator (QA 2026-10-16:
// "makita ni PHACTO yung mga mod accounts (si admin gagawa ng mod accounts)").
// The municipality each looks after, their status, how many requests they have
// sent, and who last changed the account. "Add moderator" makes one and hands
// back a credential slip (mock defense 2026-10-21: no name, a permanent
// username, a temporary password the moderator replaces at the first sign-in).

export default function Moderators() {
  const [mods,    setMods]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [search,  setSearch]  = useState('');
  const [adding,  setAdding]  = useState(false);
  const [slip,    setSlip]    = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setMods(await moderatorsAPI.getAll());
    } catch {
      setError('Couldn’t load the moderator accounts.');
      setMods([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return mods;
    return mods.filter((m) => [m.name, m.username, m.municipality].some((v) => (v || '').toLowerCase().includes(q)));
  }, [mods, search]);

  const towns = new Set(mods.filter((m) => m.active).map((m) => m.municipality).filter(Boolean)).size;
  // A changed row keeps the request counts the list already had.
  const replace = (acc) => setMods((prev) => prev.map((m) => (m.id === acc.id ? { ...m, ...acc } : m)));

  return (
    <Page>
      <PageHeader
        title="Moderators"
        count={mods.length}
        subtitle={`The LGU moderator accounts${towns ? `, covering ${towns} ${towns === 1 ? 'municipality' : 'municipalities'}` : ''}. Each one can only propose changes to spots in their own municipality, and every change waits in the Approval Queue.`}
        actions={<>
          <Button icon="refresh-cw" onClick={load} disabled={loading}>Refresh</Button>
          {!adding && <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>Add moderator</Button>}
        </>}
      />

      {error && <ErrorBanner onDismiss={() => setError('')}>{error}</ErrorBanner>}

      {adding && (
        <AddAccountForm
          roles={['moderator']}
          accounts={mods}
          onCancel={() => setAdding(false)}
          onMade={(data) => { setAdding(false); setSlip(data); load(); }}
        />
      )}

      {mods.length > 0 && (
        <Toolbar>
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by username or municipality…"
          />
        </Toolbar>
      )}

      {loading ? (
        <Loading label="Loading moderator accounts…" />
      ) : mods.length === 0 ? (
        <EmptyState icon="users" title="No moderator accounts" subtitle="Use Add moderator to make the first one." />
      ) : visible.length === 0 ? (
        <EmptyState icon="users" title="No moderators match" subtitle="Try a different username or municipality." />
      ) : (
        <StaffTable
          caption="Moderator accounts"
          // Every row is a moderator, so the town sits under the username
          // instead of in a column of its own (the table fits at 1366px).
          townInName
          accounts={visible}
          canManage={() => true}
          onChanged={replace}
          extra={{
            head: 'Requests',
            cell: (m) => (
              <div style={{ ...s.pillStack, alignItems: 'flex-end' }}>
                <span>{m.requests?.total ?? 0}</span>
                {m.requests?.pending > 0 && <StatusPill tone="warning" icon="clock">{m.requests.pending} waiting</StatusPill>}
              </div>
            ),
          }}
        />
      )}

      {slip && (
        <CredentialSlip kind="new" account={slip.account} tempPassword={slip.tempPassword}
          expiresAt={slip.tempPasswordExpiresAt} onClose={() => setSlip(null)} />
      )}
    </Page>
  );
}
