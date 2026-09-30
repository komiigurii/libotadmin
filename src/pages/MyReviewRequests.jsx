import { useEffect, useState } from 'react';
import { spotAPI, accountActionAPI } from '../api/api';
import {
  Page, PageHeader, Toolbar, FilterTabs, List, Button, ApprovalPill, Tag,
  Loading, EmptyState, ErrorBanner, Avatar, SpotThumb, pageStyles as s,
} from '../components/Layout';
import { ChangeList, ProposalFieldList } from '../components/ChangeDiff';
import { changedFieldLabels } from '../utils/changeDiff';
import { fmtDateTime } from '../utils/format';
import Icon from '../components/Icon';

// A moderator's own submissions — the other side of the admin's Approval
// Queue, so it's drawn the same way: same row layout, same status pills, same
// "what changed" viewer.

const ACTION_LABELS = { warn: 'Warn (mute)', suspend: 'Suspend' };

const KIND_LABELS = {
  spot:     'Spot edit',
  proposal: 'New spot',
  delete:   'Spot deletion',
  account:  'Account action',
};

function toArray(data) {
  if (!data) return [];
  if (Array.isArray(data))         return data;
  if (Array.isArray(data.spots))   return data.spots;
  if (Array.isArray(data.actions)) return data.actions;
  if (Array.isArray(data.data))    return data.data;
  return [];
}

export default function MyReviewRequests() {
  const [requests, setRequests] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [expanded, setExpanded] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [mySpotsData, myProposalsData, myAccountActionsData, myDeleteRequestsData] = await Promise.all([
        spotAPI.getMine(),
        spotAPI.getMyProposals(),
        accountActionAPI.getMine(),
        spotAPI.getMyDeleteRequests(),
      ]);

      const spotItems = toArray(mySpotsData)
        .filter(spot => spot.pendingChange)
        .map(spot => ({
          kind: 'spot',
          id: spot._id,
          status: spot.pendingChange.status || 'pending',
          subtitle: spot.name || '—',
          date: spot.pendingChange.submittedAt,
          body: spot,
        }));

      const proposalItems = toArray(myProposalsData.proposals || myProposalsData)
        .map(p => ({
          kind: 'proposal',
          id: p._id,
          status: p.status || 'pending',
          subtitle: p.name || '—',
          date: p.submittedAt || p.createdAt,
          body: p,
        }));

      const accountItems = toArray(myAccountActionsData)
        .map(a => ({
          kind: 'account',
          id: a._id,
          status: a.status,
          // Never the raw Clerk id — the backend resolves this to a real
          // name, falling back to 'Deleted user' when the account is gone.
          subtitle: a.targetName || 'Deleted user',
          image: a.targetImage || null,
          date: a.proposedAt || a.createdAt,
          body: a,
        }));

      const deleteItems = toArray(myDeleteRequestsData.requests || myDeleteRequestsData)
        .map(d => ({
          kind: 'delete',
          id: d._id,
          status: d.status || 'pending',
          subtitle: d.spotName || '—',
          date: d.submittedAt,
          body: d,
        }));

      const all = [...spotItems, ...proposalItems, ...accountItems, ...deleteItems]
        .sort((a, b) => new Date(b.date) - new Date(a.date));
      setRequests(all);
    } catch (err) {
      console.error(err);
      setError('Couldn’t load your submissions.');
      setRequests([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const visible = requests.filter(r => !statusFilter || r.status === statusFilter);
  const pendingCount = requests.filter(r => r.status === 'pending').length;

  const count = (st) => requests.filter((r) => r.status === st).length;

  return (
    <Page>
      <PageHeader
        title="My Submissions"
        count={requests.length}
        subtitle="Spot changes and account actions you’ve sent for admin approval, and where each one stands."
        actions={<Button icon="refresh-cw" onClick={load} disabled={loading}>Refresh</Button>}
      />

      <Toolbar>
        <FilterTabs
          label="Filter by status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: '',         label: 'All',      count: requests.length },
            { value: 'pending',  label: 'Pending',  count: pendingCount },
            { value: 'approved', label: 'Approved', count: count('approved') },
            { value: 'rejected', label: 'Rejected', count: count('rejected') },
          ]}
        />
      </Toolbar>

      {loading ? (
        <Loading label="Loading your submissions…" />
      ) : error ? (
        <ErrorBanner>{error}</ErrorBanner>
      ) : visible.length === 0 ? (
        <EmptyState
          icon="send"
          title={requests.length === 0 ? 'Nothing submitted yet' : 'No submissions here'}
          subtitle={requests.length === 0
            ? 'Spot changes and account actions you send for approval will appear here.'
            : 'Try another filter.'}
        />
      ) : (
        <List>
          {visible.map((r) => {
            const key = `${r.kind}-${r.id}`;
            const isOpen = expanded === key;
            const changed = r.kind === 'spot' ? changedFieldLabels(r.body) : [];
            const hasDetails = r.kind === 'spot' || r.kind === 'proposal';

            return (
              <div key={key} style={s.item}>
                <div style={s.itemTop}>
                  {r.kind === 'delete' ? (
                    <div style={{ ...s.mediaIcon, ...s.mediaIconDanger }}><Icon name="trash" size={16} /></div>
                  ) : r.kind === 'account' ? (
                    <Avatar src={r.image} name={r.subtitle} size={38} />
                  ) : (
                    <SpotThumb src={r.body?.image} size={38} />
                  )}

                  <div style={s.itemMain}>
                    <div style={s.itemMeta}>
                      <span style={s.itemTitle}>{r.subtitle || '—'}</span>
                      <span style={s.itemDate}>{fmtDateTime(r.date)}</span>
                      <Tag tone={r.kind === 'delete' ? 'danger' : undefined}>{KIND_LABELS[r.kind]}</Tag>
                      <ApprovalPill status={r.status} />
                    </div>

                    {r.kind === 'account' && (
                      <p style={s.itemText}>{ACTION_LABELS[r.body.actionType] || r.body.actionType}: {r.body.reason}</p>
                    )}
                    {r.kind === 'spot' && (
                      <p style={s.itemText}>{changed.length ? `Changed: ${changed.join(', ')}.` : 'No field changes.'}</p>
                    )}
                    {r.kind === 'proposal' && (
                      <p style={s.itemText}>
                        {r.status === 'pending' ? 'Waiting for an admin to review it.' : r.status === 'approved' ? 'Approved — it’s live in the app.' : 'Not approved.'}
                      </p>
                    )}
                    {r.kind === 'delete' && (
                      <p style={s.itemText}>{r.body.reason ? `Reason: ${r.body.reason}` : 'No reason given.'}</p>
                    )}

                    {r.kind === 'account' && r.status !== 'pending' && r.body.resultSummary && (
                      <div style={s.itemFacts}>
                        <span style={s.itemFact}><Icon name="check-circle" size={12} /> {r.body.resultSummary}</span>
                      </div>
                    )}
                  </div>

                  {hasDetails && (
                    <div style={s.itemSide}>
                      <Button size="sm" icon={isOpen ? 'chevron-up' : 'chevron-down'} onClick={() => setExpanded(isOpen ? null : key)}>
                        {isOpen ? 'Hide details' : 'View details'}
                      </Button>
                    </div>
                  )}
                </div>

                {isOpen && r.kind === 'spot' && <ChangeList record={r.body} />}
                {isOpen && r.kind === 'proposal' && <ProposalFieldList proposal={r.body} />}
              </div>
            );
          })}
        </List>
      )}
    </Page>
  );
}
