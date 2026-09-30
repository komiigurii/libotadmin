import { useEffect, useState } from 'react';
import { spotAPI } from '../api/api';
import {
  Page, PageHeader, Toolbar, FilterTabs, List, Button, ApprovalPill, Tag,
  Loading, EmptyState, ErrorBanner, SpotThumb, pageStyles as s,
} from '../components/Layout';
import { ChangeList, ProposalFieldList } from '../components/ChangeDiff';
import { changedFieldLabels, recordFromRequest, MISSION_FIELD_LABELS } from '../utils/changeDiff';
import { fmtDateTime } from '../utils/format';
import Icon from '../components/Icon';

// Request Tracking — every request this moderator has sent and where it
// stands: new spots, edits to existing ones, deletions, and food spot
// locations. The other side of the admin's Approval Queue, so it's drawn the
// same way: same row layout, same status pills, same "what changed" viewer.
//
// Edits and food spot requests come from the backend's change-request
// history (GET /api/spots/change-requests/mine), which keeps each one after
// it's decided — before that existed, an edit vanished from here the moment
// an admin approved or rejected it.

const KIND_LABELS = {
  spot:     'Spot edit',
  mission:  'Food spot location',
  proposal: 'New spot',
  delete:   'Spot deletion',
};

const DECIDED = { approved: 'Approved', rejected: 'Rejected' };

function toArray(data, key) {
  if (!data) return [];
  if (Array.isArray(data))       return data;
  if (Array.isArray(data[key]))  return data[key];
  if (Array.isArray(data.data))  return data.data;
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
    // allSettled: one source failing shouldn't hide the others.
    const [spotsRes, proposalsRes, deletesRes, changesRes] = await Promise.allSettled([
      spotAPI.getMine(),
      spotAPI.getMyProposals(),
      spotAPI.getMyDeleteRequests(),
      spotAPI.getMyChangeRequests(),
    ]);
    const ok = (r) => r.status === 'fulfilled';
    const failed = [
      !ok(proposalsRes) && 'new spots',
      !ok(deletesRes) && 'deletions',
      !ok(changesRes) && 'edits and food spot requests',
    ].filter(Boolean);

    const mySpots = ok(spotsRes) ? toArray(spotsRes.value, 'spots') : [];
    const imageOf = new Map(mySpots.map((sp) => [String(sp._id), sp.image]));
    const history = ok(changesRes) ? changesRes.value : [];

    const changeItems = history.map((c) => ({
      kind: c.kind === 'mission-location' ? 'mission' : 'spot',
      id: c._id,
      status: c.status,
      subtitle: c.targetName || '—',
      image: imageOf.get(String(c.spotId)) || null,
      date: c.submittedAt,
      decidedAt: c.reviewedAt,
      record: recordFromRequest(c),
      locationName: c.changes?.locationName,
    }));

    // Edits sent before the history existed have no row in it yet; while
    // they're still pending, show them from the spot itself.
    const tracked = new Set(history.filter((c) => c.kind === 'spot-edit' && c.status === 'pending').map((c) => String(c.spotId)));
    const legacyEdits = mySpots
      .filter((sp) => sp.pendingChange && !tracked.has(String(sp._id)))
      .map((sp) => ({
        kind: 'spot',
        id: sp._id,
        status: 'pending',
        subtitle: sp.name || '—',
        image: sp.image || null,
        date: sp.pendingChange.submittedAt,
        record: sp,
      }));

    const proposalItems = (ok(proposalsRes) ? toArray(proposalsRes.value, 'proposals') : []).map((p) => ({
      kind: 'proposal',
      id: p._id,
      status: p.status || 'pending',
      subtitle: p.name || '—',
      image: p.image || null,
      date: p.submittedAt || p.createdAt,
      decidedAt: p.reviewedAt,
      record: p,
    }));

    const deleteItems = (ok(deletesRes) ? toArray(deletesRes.value, 'requests') : []).map((d) => ({
      kind: 'delete',
      id: d._id,
      status: d.status || 'pending',
      subtitle: d.spotName || '—',
      date: d.submittedAt,
      decidedAt: d.reviewedAt,
      reason: d.reason,
    }));

    setRequests(
      [...changeItems, ...legacyEdits, ...proposalItems, ...deleteItems]
        .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)),
    );
    setError(failed.length ? `Couldn’t load ${failed.join(', ')}. Everything else is shown below.` : null);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const visible = requests.filter((r) => !statusFilter || r.status === statusFilter);
  const count = (st) => requests.filter((r) => r.status === st).length;

  return (
    <Page>
      <PageHeader
        title="My Submissions"
        count={requests.length}
        subtitle="Every request you’ve sent — new spots, edits, deletions and food spot locations — where each one stands, and exactly what changed."
        actions={<Button icon="refresh-cw" onClick={load} disabled={loading}>Refresh</Button>}
      />

      <Toolbar>
        <FilterTabs
          label="Filter by status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: '',         label: 'All',      count: requests.length },
            { value: 'pending',  label: 'Pending',  count: count('pending') },
            { value: 'approved', label: 'Approved', count: count('approved') },
            { value: 'rejected', label: 'Rejected', count: count('rejected') },
          ]}
        />
      </Toolbar>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {loading ? (
        <Loading label="Loading your submissions…" />
      ) : visible.length === 0 ? (
        <EmptyState
          icon="send"
          title={requests.length === 0 ? 'Nothing submitted yet' : 'No submissions here'}
          subtitle={requests.length === 0
            ? 'Spots you add, edit or remove in Spot Management will appear here with their status.'
            : 'Try another filter.'}
        />
      ) : (
        <List>
          {visible.map((r) => {
            const key = `${r.kind}-${r.id}`;
            const isOpen = expanded === key;
            const labels = r.kind === 'mission' ? MISSION_FIELD_LABELS : undefined;
            const changed = r.kind === 'spot' || r.kind === 'mission' ? changedFieldLabels(r.record, labels) : [];
            const hasDetails = r.kind === 'spot' || r.kind === 'mission' || r.kind === 'proposal';

            return (
              <div key={key} style={s.item}>
                <div style={s.itemTop}>
                  {r.kind === 'delete'
                    ? <div style={{ ...s.mediaIcon, ...s.mediaIconDanger }}><Icon name="trash" size={16} /></div>
                    : <SpotThumb src={r.image} size={38} />}

                  <div style={s.itemMain}>
                    <div style={s.itemMeta}>
                      <span style={s.itemTitle}>{r.subtitle}</span>
                      <span style={s.itemDate}>{fmtDateTime(r.date)}</span>
                      <Tag tone={r.kind === 'delete' ? 'danger' : undefined}>{KIND_LABELS[r.kind]}</Tag>
                      <ApprovalPill status={r.status} />
                    </div>

                    {r.kind === 'spot' && (
                      <p style={s.itemText}>{changed.length ? `Changed: ${changed.join(', ')}.` : 'No field changes.'}</p>
                    )}
                    {r.kind === 'mission' && (
                      <p style={s.itemText}>
                        {r.locationName ? <><strong>{r.locationName}</strong> — </> : null}
                        {changed.length ? `changed: ${changed.join(', ')}.` : 'no field changes.'}
                      </p>
                    )}
                    {r.kind === 'proposal' && (
                      <p style={s.itemText}>
                        {r.status === 'pending' ? 'Waiting for an admin to review it.' : r.status === 'approved' ? 'Approved — it’s live in the app.' : 'Not approved.'}
                      </p>
                    )}
                    {r.kind === 'delete' && (
                      <p style={s.itemText}>{r.reason ? `Reason: ${r.reason}` : 'No reason given.'}</p>
                    )}

                    {DECIDED[r.status] && r.decidedAt && (
                      <div style={s.itemFacts}>
                        <span style={s.itemFact}>
                          <Icon name={r.status === 'approved' ? 'check-circle' : 'x'} size={12} />
                          {DECIDED[r.status]} {fmtDateTime(r.decidedAt)}
                        </span>
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

                {isOpen && (r.kind === 'spot' || r.kind === 'mission') && <ChangeList record={r.record} labelMap={labels} />}
                {isOpen && r.kind === 'proposal' && <ProposalFieldList proposal={r.record} />}
              </div>
            );
          })}
        </List>
      )}
    </Page>
  );
}
