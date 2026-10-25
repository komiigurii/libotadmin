import { useEffect, useState } from 'react';
import {
  Page, PageHeader, Toolbar, FilterTabs, List, Button, ApprovalPill, Tag,
  Loading, EmptyState, ErrorBanner, SpotThumb, pageStyles as s,
} from '../components/Layout';
import { ChangeList, ProposalFieldList } from '../components/ChangeDiff';
import { changedFieldLabels, MISSION_FIELD_LABELS } from '../utils/changeDiff';
import { fmtDateTime } from '../utils/format';
import { loadMyRequests } from '../utils/myRequests';
import Icon from '../components/Icon';
import { Paged, usePaged } from '../components/Pagination';
import { useLive } from '../api/live';

// Request Tracking — every request this moderator has sent and where it
// stands: new spots, edits to existing ones, deletions, and food spot
// locations (utils/myRequests.js). The other side of the admin's Approval
// Queue, so it's drawn the same way: same row layout, same status pills, same
// "what changed" viewer.
//
// `pendingOnly` is the Waiting for approval tab of the moderator's Spot
// Management (2026-10-25: "make it like the spot management in admin"): no
// page shell, only the requests still waiting, and `onCount` hears how many.

const KIND_LABELS = {
  spot:     'Spot edit',
  mission:  'Food spot location',
  proposal: 'New spot',
  delete:   'Spot deletion',
};

const DECIDED = { approved: 'Approved', rejected: 'Rejected' };

export default function MyReviewRequests({ pendingOnly = false, onCount }) {
  const [requests, setRequests] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [statusFilter, setStatusFilter] = useState(pendingOnly ? 'pending' : '');
  const [expanded, setExpanded] = useState(null);

  // `quiet`: a live update (an admin decided), without the spinner.
  const load = async ({ quiet = false } = {}) => {
    if (!quiet) {
      setLoading(true);
      setError(null);
    }
    const res = await loadMyRequests();
    setRequests(res.requests);
    setError(res.error);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);
  useLive(['approvals', 'spots', 'missions'], () => load({ quiet: true }));

  const visible = requests.filter((r) => !statusFilter || r.status === statusFilter);
  const paged = usePaged(visible, statusFilter);
  const count = (st) => requests.filter((r) => r.status === st).length;
  const waiting = count('pending');
  useEffect(() => { if (!loading) onCount?.(waiting); }, [loading, waiting, onCount]);

  const Shell = pendingOnly ? EmbeddedShell : Page;

  return (
    <Shell>
      {!pendingOnly && (
        <>
          <PageHeader
            title="My Submissions"
            count={loading ? '…' : requests.length}
          />

          <Toolbar>
            <FilterTabs
              label="Filter by status"
              pending={loading}
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
        </>
      )}

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {loading ? (
        <Loading label="Loading your submissions…" kind="list" />
      ) : visible.length === 0 ? (
        pendingOnly ? (
          <EmptyState
            icon="check-circle"
            title="Nothing waiting for approval"
            subtitle="Spots you add, edit or remove wait here until an admin decides. Every request, decided or not, is in My Submissions."
          />
        ) : (
          <EmptyState
            icon="send"
            title={requests.length === 0 ? 'Nothing submitted yet' : 'No submissions here'}
            subtitle={requests.length === 0
              ? 'Spots you add, edit or remove in Spot Management will appear here with their status.'
              : 'Try another filter.'}
          />
        )
      ) : (
        <Paged {...paged} label="Submission pages">
        <List>
          {paged.rows.map((r) => {
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
                    {/* The admin's reason for a rejection, or remarks on an
                        approval (mock defense 2026-10-21). */}
                    {r.note && DECIDED[r.status] && (
                      <p style={noteStyle}>
                        <strong style={{ color: 'var(--text-primary)' }}>{r.status === 'rejected' ? 'Why it was rejected: ' : 'Admin’s remarks: '}</strong>
                        {r.note}
                      </p>
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
        </Paged>
      )}
    </Shell>
  );
}

const EmbeddedShell = ({ children }) => <>{children}</>;

const noteStyle = {
  fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '8px 0 0', padding: '8px 10px',
  borderRadius: 8, background: 'var(--sidebar-bg)', border: '1px solid var(--divider)', overflowWrap: 'anywhere',
};
