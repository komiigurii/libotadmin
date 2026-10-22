import { useEffect, useState } from 'react';
import { spotAPI, missionAPI } from '../api/api';
import { notify, promptAction } from '../components/AppAlert';
import {
  Page, PageHeader, Toolbar, FilterTabs, List, Button, ApprovalPill, Tag,
  Loading, ErrorBanner, EmptyState, SpotThumb, pageStyles as s,
} from '../components/Layout';
import { ChangeList, ProposalFieldList } from '../components/ChangeDiff';
import { MISSION_FIELD_LABELS } from '../utils/changeDiff';
import { fmtDateTime } from '../utils/format';
import Icon from '../components/Icon';

const KIND_LABELS = {
  spot:               'Spot edit',
  'spot-delete':      'Spot deletion',
  'spot-proposal':    'New spot',
  'mission-location': 'Food spot location',
};

function toArray(data) {
  if (!data) return [];
  if (Array.isArray(data))         return data;
  if (Array.isArray(data.actions)) return data.actions;
  if (Array.isArray(data.data))    return data.data;
  return [];
}

/*
 * The Approval Queue: a tab of Spot Management since the mock defense
 * (2026-10-21: "hindi dapat site management tawag kung walang manage na
 * ginagawa" — everything about spots in one place), so `embedded` drops the
 * page shell. Rejecting asks for the reason, which the moderator reads in My
 * Submissions; approving can carry remarks.
 */
export default function ModRequests({ embedded = false, onCount }) {
  const [requests, setRequests] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  // '' = every type of request.
  const [kindFilter, setKindFilter] = useState('');
  const [acting, setActing] = useState(null);
  const [expandedKey, setExpandedKey] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      // allSettled, NOT all. This queue is assembled from three independent
      // endpoints, and with Promise.all a single one failing rejected the whole
      // thing — the catch below then blanked the list and showed "Failed to
      // load mod requests". A moderator's spot edit could be sitting in the
      // database, correctly saved, and the admin would still see an empty
      // queue because an unrelated call had errored.
      // Now each section fails on its own and the rest still render.
      const [pendingProposalsRes, pendingSpotsRes, missionProposalsRes] =
        await Promise.allSettled([
          spotAPI.getPendingProposals(),  // { success, proposals }
          spotAPI.getPending(),           // { success, items }
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

      const all = [...proposalItems, ...editItems, ...deleteItems, ...missionLocationItems]
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

  const visible = requests.filter(r => !kindFilter || r.kind === kindFilter);
  const pendingCount = requests.filter(r => r.status === 'pending').length;
  useEffect(() => { if (!loading) onCount?.(pendingCount); }, [loading, pendingCount, onCount]);

  // One decision, any kind of request. The note is asked for first: a reason
  // (required) to reject, optional remarks to approve. The dialog is the
  // confirmation too, so nothing is decided by a single stray click.
  const decide = async (r, action) => {
    const name = r.subtitle && r.subtitle !== '—' ? `“${r.subtitle}”` : 'this request';
    const deleting = r.kind === 'spot-delete';
    const note = await promptAction(
      action === 'reject'
        ? `The moderator reads the reason in My Submissions and is told in their bell, so say what to fix.`
        : deleting
          ? `${name} is deleted from the app for good. Any remarks for the moderator?`
          : `${name} goes live in the app. Any remarks or suggestions for the moderator?`,
      action === 'reject'
        ? { title: `Reject ${KIND_LABELS[r.kind].toLowerCase()}?`, label: 'Reason', placeholder: 'e.g. The photo is of a different church.', minLength: 3, maxLength: 500, confirmText: 'Reject', danger: true }
        : { title: deleting ? `Approve and delete ${name}?` : `Approve ${KIND_LABELS[r.kind].toLowerCase()}?`, label: 'Remarks', placeholder: 'e.g. Next time add the parking info too.', required: false, maxLength: 500, confirmText: deleting ? 'Approve & delete' : 'Approve', danger: deleting },
    );
    if (note === null) return;
    setActing(r.id);
    try {
      const call = r.kind === 'spot-proposal' ? spotAPI.reviewProposal
        : r.kind === 'mission-location' ? missionAPI.reviewLocation
          : spotAPI.reviewChange;
      const data = await call(r.id, action, note);
      if (data?.success !== false) {
        notify(action === 'reject' ? 'Rejected. The moderator has your reason.' : 'Approved. It’s live in the app.', { tone: 'success' });
        await load();
      } else notify('Failed: ' + (data?.message || 'Unknown error'), { tone: 'danger' });
    } catch (err) {
      notify(err?.response?.data?.message || 'Couldn’t reach the server. Try again.', { tone: 'danger' });
    }
    setActing(null);
  };

  const count = (kind) => requests.filter((r) => r.kind === kind).length;

  const Shell = embedded ? EmbeddedShell : Page;
  return (
    <Shell>
      {!embedded && (
        <PageHeader
          title="Approval Queue"
          count={pendingCount}
          subtitle="New spots, spot edits and deletions, and food spot locations from moderators — nothing goes live until you approve it."
          actions={<Button icon="refresh-cw" onClick={load} disabled={loading}>Refresh</Button>}
        />
      )}

      <Toolbar>
        {/* Everything here is waiting on a decision, so the tabs split by
            what kind of request it is rather than by status. */}
        <FilterTabs
          label="Filter by request type"
          value={kindFilter}
          onChange={setKindFilter}
          options={[
            { value: '',                 label: 'All',        count: requests.length },
            { value: 'spot-proposal',    label: 'New spots',  count: count('spot-proposal') },
            { value: 'spot',             label: 'Edits',      count: count('spot') },
            { value: 'spot-delete',      label: 'Deletions',  count: count('spot-delete') },
            { value: 'mission-location', label: 'Food spots', count: count('mission-location') },
          ]}
        />
        {embedded && <Button icon="refresh-cw" onClick={load} disabled={loading}>Refresh</Button>}
      </Toolbar>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {loading ? (
        <Loading label="Loading the approval queue…" />
      ) : visible.length === 0 ? (
        <EmptyState
          icon="check"
          title={requests.length === 0 ? 'Nothing waiting for approval' : 'No requests of this type'}
          subtitle={requests.length === 0
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

            const handleApprove = () => decide(r, 'approve');
            const handleReject = () => decide(r, 'reject');

            return (
              <div key={key} style={s.item}>
                <div style={s.itemTop}>
                  {isDeleteRequest ? (
                    <div style={{ ...s.mediaIcon, ...s.mediaIconDanger }}><Icon name="trash" size={16} /></div>
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

                    {isNewProposal && <p style={s.itemText}>A new spot, submitted for review.</p>}
                    {r.kind === 'spot' && <p style={s.itemText}>Changes to this spot&rsquo;s details.</p>}
                    {isDeleteRequest && (
                      <p style={s.itemText}>
                        {r.body.pendingDeleteReason ? `Reason: ${r.body.pendingDeleteReason}` : 'No reason given.'}
                      </p>
                    )}
                    {isMissionLocation && (
                      <p style={s.itemText}>A new location for this spot&rsquo;s recommended food spot.</p>
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
    </Shell>
  );
}

// Inside Spot Management, which brings the page shell and the heading.
const EmbeddedShell = ({ children }) => <>{children}</>;
