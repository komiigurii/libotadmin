import { useEffect, useMemo, useState } from 'react';
import { moderatorsAPI } from '../api/api';
import {
  Page, PageHeader, Toolbar, SearchInput, Table, Th, Td, Button, StatusPill,
  Loading, EmptyState, ErrorBanner, Avatar, pageStyles as s,
} from '../components/Layout';
import { fmtDay } from '../utils/format';

// Moderators — every moderator account, for the administrator (QA 2026-10-16:
// "makita ni admin yung mga mod accounts"). Read-only: who they are, the
// municipality each looks after, and how many requests they have sent. Accounts
// are still made with the backend's createModerator script.

export default function Moderators() {
  const [mods,    setMods]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [search,  setSearch]  = useState('');

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
    return mods.filter((m) => [m.name, m.username, m.email, m.municipality].some((v) => (v || '').toLowerCase().includes(q)));
  }, [mods, search]);

  const towns = new Set(mods.map((m) => m.municipality).filter(Boolean)).size;

  return (
    <Page>
      <PageHeader
        title="Moderators"
        count={mods.length}
        subtitle={`The LGU moderator accounts${towns ? `, covering ${towns} ${towns === 1 ? 'municipality' : 'municipalities'}` : ''}. Each one can only propose changes to spots in their own municipality, and every change waits in the Approval Queue.`}
        actions={<Button icon="refresh-cw" onClick={load} disabled={loading}>Refresh</Button>}
      />

      {error && <ErrorBanner onDismiss={() => setError('')}>{error}</ErrorBanner>}

      {mods.length > 0 && (
        <Toolbar>
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, username or municipality…"
          />
        </Toolbar>
      )}

      {loading ? (
        <Loading label="Loading moderator accounts…" />
      ) : mods.length === 0 ? (
        <EmptyState icon="users" title="No moderator accounts" subtitle="Moderator accounts appear here once they are created." />
      ) : visible.length === 0 ? (
        <EmptyState icon="users" title="No moderators match" subtitle="Try a different name or municipality." />
      ) : (
        <Table
          caption="Moderator accounts"
          head={<>
            <Th>Moderator</Th>
            <Th>Username</Th>
            <Th>Municipality</Th>
            <Th align="right">Requests sent</Th>
            <Th align="right">Account made</Th>
          </>}
        >
          {visible.map((m) => (
            <tr key={m.id}>
              <Td>
                <div style={s.person}>
                  <Avatar name={m.name} size={32} />
                  <div style={{ minWidth: 0 }}>
                    <div style={s.personName}>{m.name}</div>
                    <div style={s.personSub}>{m.email}</div>
                  </div>
                </div>
              </Td>
              <Td>{m.username || '—'}</Td>
              <Td muted={!m.municipality}>{m.municipality || 'None assigned'}</Td>
              <Td align="right">
                <div style={s.pillStack}>
                  <span>{m.requests.total}</span>
                  {m.requests.pending > 0 && (
                    <StatusPill tone="warning" icon="clock">{m.requests.pending} waiting</StatusPill>
                  )}
                </div>
              </Td>
              <Td align="right" muted>{m.createdAt ? fmtDay(m.createdAt) : '—'}</Td>
            </tr>
          ))}
        </Table>
      )}
    </Page>
  );
}
