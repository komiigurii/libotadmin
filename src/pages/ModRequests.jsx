import { useEffect, useState } from 'react';
import { spotAPI, accountActionAPI, missionAPI } from '../api/api';
import { notify } from '../components/AppAlert';
import {
  Page, PageHeader, Toolbar, FilterTabs, List, Button, ApprovalPill, Tag,
  Loading, ErrorBanner, EmptyState, Avatar, SpotThumb, pageStyles as s,
} from '../components/Layout';
import { ChangeList, ProposalFieldList } from '../components/ChangeDiff';
import { MISSION_FIELD_LABELS } from '../utils/changeDiff';
import { fmtDateTime } from '../utils/format';
import Icon from '../components/Icon';

const KIND_LABELS = {
  spot:               'Spot edit',
  'spot-delete':      'Spot deletion',
  'spot-proposal':    'New spot',
  account:            'Account action',
  'mission-location': 'Food mission location',
};

function toArray(data) {
  if (!data) return [];
  if (Array.isArray(data))         return data;
  if (Array.isArray(data.actions)) return data.actions;
  if (Array.isArray(data.data))    return data.data;
  return [];
}

export default function ModRequests() {
  const [requests, setRequests] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  // Opens on what's waiting — that's what a queue is for.
  const [statusFilter, setStatusFilter] = useState('pending');
  const [acting, setActing] = useState(null);
  const [expandedKey, setExpandedKey] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      // allSettled, NOT all. This queue is assembled from four independent
      // endpoints, and with Promise.all a single one failing rejected the whole
      // thing — the catch below then blanked the list and showed "Failed to
      // load mod requests". A moderator's spot edit could be sitting in the
      // database, correctly saved, and the admin would still see an empty
      // queue because an unrelated call (account actions, say) had errored.
      // Now each section fails on its own and the rest still render.
      const [pendingProposalsRes, pendingSpotsRes, accountActionsRes, missionProposalsRes] =
        await Promise.allSettled([
          spotAPI.getPendingProposals(),  // { success, proposals }
          spotAPI.getPending(),           // { success, items }
          accountActionAPI.getAll(),
          missionAPI.getProposals(),      // [] of missions with a pendingChange
        ]);

      const failed = [];
      const valueOf = (res, label, fallback) => {
        if (res.status === 'fulfilled') return res.value;
        console.error(`[ModRequests] ${label} failed:`, res.reason);
        failed.push(label);
        return fallback;
      };

      const pendingProposalsData = valueOf(pendingProposalsRes, 'New spot proposals', {});
      const pendingSpotsData     = valueOf(pendingSpotsRes,     'Spot edits',         {});
      const accountActionsData   = valueOf(accountActionsRes,   'Account actions',    []);
      const missionProposalsData = valueOf(missionProposalsRes, 'Food mission locations', []);

      setError(
        failed.length
          ? `Couldn't load: ${failed.join(', ')}. Everything else is shown below.`
          : null
      );

      const pendingProposals = toArray(pendingProposalsData.proposals || pendingProposalsData);
      const pendingSpots     = toArray(pendingSpotsData.items || pendingSpotsData);

      const proposalItems = pendingProposals.map(proposal => ({
        kind: 'spot-proposal',
        id: proposal._id,
        status: proposal.status || 'pending',
        title: 'New Spot Proposal',
        subtitle: proposal.name || '—',
        image: proposal.image || null,
        date: proposal.submittedAt || proposal.createdAt,
        body: proposal,
      }));

      const editItems = pendingSpots
        .filter(spot => spot.pendingChange && !spot.pendingDelete)
        .map(spot => ({
          kind: 'spot',
          id: spot._id,
          status: 'pending',
          title: 'Spot edit request',
          subtitle: spot.name || '—',
          image: spot.image || null,
          date: spot.pendingChange?.submittedAt,
          body: spot,
        }));

      const deleteItems = pendingSpots
        .filter(spot => spot.pendingDelete)
        .map(spot => ({
          kind: 'spot-delete',
          id: spot._id,
          status: 'pending',
          title: 'Spot deletion request',
          subtitle: spot.name || '—',
          image: spot.image || null,
          date: spot.pendingDeleteAt,
          body: spot,
        }));

      const accountItems = toArray(accountActionsData)
        .map(a => ({
          kind: 'account',
          id: a._id,
          status: a.status,
          title: a.proposedByName || 'Moderator',
          // Never the raw Clerk id — the backend resolves this to a real
          // name, and falls back to 'Deleted user' when the account is gone.
          subtitle: a.targetName || 'Deleted user',
          image: a.targetImage || null,
          date: a.proposedAt || a.createdAt,
          body: a,
        }));

      const missionLocationItems = toArray(missionProposalsData)
        .map(mission => ({
          kind: 'mission-location',
          id: mission._id,
          status: 'pending',
          title: 'Food mission location',
          subtitle: mission.spotId?.name || mission.title || '—',
          image: mission.spotId?.image || null,
          date: mission.pendingChange?.submittedAt,
          body: mission,
        }));

      const all = [...proposalItems, ...editItems, ...deleteItems, ...accountItems, ...missionLocationItems]
        .sort((a, b) => new Date(b.date) - new Date(a.date));
      setRequests(all);
    } catch (err) {
      console.error(err);
      setError('Couldn’t load the approval queue.');
      setRequests([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const visible = requests.filter(r => !statusFilter || r.status === statusFilter);
  const pendingCount = requests.filter(r => r.status === 'pending').length;

  // Approve/reject a NEW spot proposal
  const decideProposal = async (id, action) => {
    setActing(id);
    try {
      const data = await spotAPI.reviewProposal(id, action);
      if (data?.success !== false) await load();
      else notify('Failed: ' + (data?.message || 'Unknown error'), { tone: 'danger' });
    } catch (err) {
      console.error(err);
      notify('Network error', { tone: 'danger' });
    }
    setActing(null);
  };

  // Approve/reject an EXISTING spot's edit or deletion request
  const decideSpot = async (id, action) => {
    setActing(id);
    try {
      const data = await spotAPI.reviewChange(id, action);
      if (data?.success !== false) await load();
      else notify('Failed: ' + (data?.message || 'Unknown error'), { tone: 'danger' });
    } catch (err) {
      console.error(err);
      notify('Network error', { tone: 'danger' });
    }
    setActing(null);
  };

  const decideAccount = async (id, decision) => {
    setActing(id);
    try {
      const data = await accountActionAPI.decide(id, decision);
      if (data?.success !== false) load();
      else notify('Failed: ' + (data?.message || 'Unknown error'), { tone: 'danger' });
    } catch { notify('Network error', { tone: 'danger' }); }
    setActing(null);
  };

  // Approve/reject a proposed food-mission location change
  const decideMissionLocation = async (id, action) => {
    setActing(id);
    try {
      const data = await missionAPI.reviewLocation(id, action);
      if (data?.success !== false) await load();
      else notify('Failed: ' + (data?.message || 'Unknown error'), { tone: 'danger' });
    } catch (err) {
      console.error(err);
      notify('Network error', { tone: 'danger' });
    }
    setActing(null);
  };

  const count = (st) => requests.filter((r) => r.status === st).length;

  return (
    <Page>
      <PageHeader
        title="Approval Queue"
        count={pendingCount}
        subtitle="New spots, spot edits and deletions, food mission locations and account actions from moderators — nothing goes live until you approve it."
        actions={<Button icon="refresh-cw" onClick={load} disabled={loading}>Refresh</Button>}
      />

      <Toolbar>
        <FilterTabs
          label="Filter by status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'pending',  label: 'Pending',  count: pendingCount },
            { value: 'approved', label: 'Approved', count: count('approved') },
            { value: 'rejected', label: 'Rejected', count: count('rejected') },
            { value: '',         label: 'All',      count: requests.length },
          ]}
        />
      </Toolbar>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {loading ? (
        <Loading label="Loading the approval queue…" />
      ) : visible.length === 0 ? (
        <EmptyState
          icon="check"
          title={statusFilter === 'pending' ? 'Nothing waiting for approval' : 'No requests here'}
          subtitle={statusFilter === 'pending'
            ? 'Moderator submissions will appear here as they come in.'
            : 'Try another filter.'}
        />
      ) : (
        <List>
          {visible.map((r) => {
            const isPending = r.status === 'pending';
            const isActing = acting === r.id;
            const key = `${r.kind}-${r.id}`;
            const isExpanded = expandedKey === key;
            const isDeleteRequest = r.kind === 'spot-delete';
            const isNewProposal = r.kind === 'spot-proposal';
            const isMissionLocation = r.kind === 'mission-location';
            const hasDetails = r.kind === 'spot' || isNewProposal || isDeleteRequest || isMissionLocation;
            const byLine = r.kind === 'account' ? r.title : null;

            const handleApprove = () => {
              if (r.kind === 'account') decideAccount(r.id, 'approved');
              else if (isNewProposal) decideProposal(r.id, 'approve');
              else if (isMissionLocation) decideMissionLocation(r.id, 'approve');
              else decideSpot(r.id, 'approve');
            };

            const handleReject = () => {
              if (r.kind === 'account') decideAccount(r.id, 'rejected');
              else if (isNewProposal) decideProposal(r.id, 'reject');
              else if (isMissionLocation) decideMissionLocation(r.id, 'reject');
              else decideSpot(r.id, 'reject');
            };

            return (
              <div key={key} style={s.item}>
                <div style={s.itemTop}>
                  {isDeleteRequest ? (
                    <div style={{ ...s.mediaIcon, ...s.mediaIconDanger }}><Icon name="trash" size={16} /></div>
                  ) : r.kind === 'account' ? (
                    <Avatar src={r.image} name={r.subtitle} size={38} />
                  ) : (
                    <SpotThumb src={r.image} size={38} />
                  )}

                  <div style={s.itemMain}>
                    <div style={s.itemMeta}>
                      <span style={s.itemTitle}>{r.subtitle || '—'}</span>
                      <span style={s.itemDate}>{fmtDateTime(r.date)}</span>
                      <Tag tone={isDeleteRequest ? 'danger' : undefined}>{KIND_LABELS[r.kind]}</Tag>
                      <ApprovalPill status={r.status} />
                    </div>

                    {byLine && <p style={s.itemText}>Proposed by <strong>{byLine}</strong></p>}
                    {r.kind === 'account' && <p style={s.itemText}>{r.body.reason}</p>}
                    {isNewProposal && <p style={s.itemText}>A new spot, submitted for review.</p>}
                    {r.kind === 'spot' && <p style={s.itemText}>Changes to this spot&rsquo;s details.</p>}
                    {isDeleteRequest && (
                      <p style={s.itemText}>
                        {r.body.pendingDeleteReason ? `Reason: ${r.body.pendingDeleteReason}` : 'No reason given.'}
                      </p>
                    )}
                    {isMissionLocation && (
                      <p style={s.itemText}>A new location for this spot&rsquo;s food recommendation mission.</p>
                    )}

                    {(r.kind === 'account' || (r.status !== 'pending' && r.body.resultSummary)) && (
                      <div style={s.itemFacts}>
                        {r.kind === 'account' && (
                          <span style={s.itemFact}>
                            <Icon name={r.body.sourceType === 'inactivity' ? 'clock' : 'hand'} size={12} />
                            {r.body.sourceType === 'inactivity' ? 'Account inactivity' : 'Manual'}
                          </span>
                        )}
                        {r.status !== 'pending' && r.body.resultSummary && (
                          <span style={s.itemFact}><Icon name="check-circle" size={12} /> {r.body.resultSummary}</span>
                        )}
                      </div>
                    )}
                  </div>

                  {hasDetails && (
                    <div style={s.itemSide}>
                      <Button size="sm" icon={isExpanded ? 'chevron-up' : 'chevron-down'} onClick={() => setExpandedKey(isExpanded ? null : key)}>
                        {isExpanded ? 'Hide details' : 'View details'}
                      </Button>
                    </div>
                  )}
                </div>

                {isExpanded && r.kind === 'spot' && <ChangeList record={r.body} />}
                {isExpanded && isNewProposal && <ProposalFieldList proposal={r.body} />}
                {isExpanded && isDeleteRequest && (
                  <div style={s.panel}>
                    <p style={{ ...s.itemText, margin: 0 }}>
                      <Icon name="alert-triangle" size={13} /> Approving permanently deletes <strong>{r.body.name}</strong>. This can&rsquo;t be undone.
                    </p>
                  </div>
                )}
                {isExpanded && isMissionLocation && (
                  <ChangeList
                    record={r.body}
                    labelMap={MISSION_FIELD_LABELS}
                    keys={['locationName', 'image', 'locationInfo', 'coordinates', 'radiusMeters']}
                  />
                )}

                {isPending && (
                  <div style={s.panel}>
                    <div style={{ ...s.buttonRow, marginTop: 0 }}>
                      <Button
                        variant={isDeleteRequest ? 'dangerSolid' : 'success'}
                        icon={isDeleteRequest ? 'trash' : 'check'}
                        disabled={isActing}
                        onClick={handleApprove}
                      >
                        {isDeleteRequest ? 'Approve & delete' : 'Approve'}
                      </Button>
                      <Button variant="danger" icon="x" disabled={isActing} onClick={handleReject}>
                        Reject
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </List>
      )}
    </Page>
  );
}
