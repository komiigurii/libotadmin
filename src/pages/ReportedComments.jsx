import { useEffect, useState } from 'react';
import { reportAPI, commentAPI } from '../api/api';
import { notify, confirmAction } from '../components/AppAlert';
import {
  Page, PageHeader, Toolbar, FilterTabs, List, Button, StatusPill, Tag,
  Loading, ErrorBanner, EmptyState, Avatar, pageStyles as s,
} from '../components/Layout';
import { fmtDateTime } from '../utils/format';
import Icon from '../components/Icon';

// A report's life: pending → resolved (upheld) or dismissed. Dismissed is
// neutral, not red — throwing out a report isn't an error.
const REPORT_STATUS = {
  pending:   { tone: 'warning', icon: 'clock', label: 'Pending' },
  reviewed:  { tone: 'info',    icon: 'check', label: 'Reviewed' },
  resolved:  { tone: 'success', icon: 'check', label: 'Upheld' },
  dismissed: { tone: 'neutral', icon: 'x',     label: 'Dismissed' },
};

const REASON_LABELS = {
  inappropriate:      'Inappropriate content',
  spam:               'Spam',
  offensive_language: 'Offensive language',
  fake_review:        'Fake review',
  harassment:         'Harassment',
  other:              'Other',
};

function toArray(data) {
  if (!data) return [];
  if (Array.isArray(data))         return data;
  if (Array.isArray(data.reports)) return data.reports;
  if (Array.isArray(data.data))    return data.data;
  return [];
}

export default function ReportedComments() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  // Opens on what's waiting, like the Approval Queue.
  const [statusFilter, setStatusFilter] = useState('pending');
  const [expandedId, setExpandedId] = useState(null);
  const [acting, setActing] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await reportAPI.getAll({ type: 'review' });
      setReports(toArray(data));
    } catch {
      setError('Couldn’t load reported reviews.');
      setReports([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const visible = reports.filter(r => !statusFilter || r.status === statusFilter);
  const count = (st) => reports.filter((r) => r.status === st).length;
  const pendingCount = count('pending');

  return (
    <Page>
      <PageHeader
        title="Reported Reviews"
        count={pendingCount}
        subtitle="Reviews that travelers reported from the app, waiting for your decision."
        actions={<Button icon="refresh-cw" onClick={load} disabled={loading}>Refresh</Button>}
      />

      <Toolbar>
        <FilterTabs
          label="Filter by status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'pending',   label: 'Pending',   count: pendingCount },
            { value: 'resolved',  label: 'Upheld',    count: count('resolved') },
            { value: 'dismissed', label: 'Dismissed', count: count('dismissed') },
            { value: '',          label: 'All',       count: reports.length },
          ]}
        />
      </Toolbar>

      {loading ? (
        <Loading label="Loading reported reviews…" />
      ) : error ? (
        <ErrorBanner>{error}</ErrorBanner>
      ) : visible.length === 0 ? (
        <EmptyState
          icon="check"
          title={statusFilter === 'pending' ? 'No reports waiting' : 'No reports here'}
          subtitle={statusFilter === 'pending'
            ? 'Reviews travelers report from the app will appear here.'
            : 'Try another filter.'}
        />
      ) : (
        <List>
          {visible.map(r => (
            <ReportRow
              key={r._id}
              report={r}
              expanded={expandedId === r._id}
              acting={acting === r._id}
              setActing={setActing}
              onToggle={() => setExpandedId(expandedId === r._id ? null : r._id)}
              onUpdated={() => { setExpandedId(null); load(); }}
            />
          ))}
        </List>
      )}
    </Page>
  );
}

function ReportRow({ report, expanded, acting, setActing, onToggle, onUpdated }) {
  const review = report.reviewId && typeof report.reviewId === 'object' ? report.reviewId : null;
  const [adminNote, setAdminNote] = useState(report.adminNote || '');

  const st = REPORT_STATUS[report.status] || REPORT_STATUS.pending;
  const isPending = report.status === 'pending';
  const reviewerName = review?.userName || 'Unknown traveler';

  const decide = async (decision) => {
    setActing(report._id);
    try {
      const data = await reportAPI.update(report._id, { decision, adminNote });
      if (data?.success !== false) onUpdated();
      else notify('Failed: ' + (data?.message || 'Unknown error'), { tone: 'danger' });
    } catch (err) {
      notify(err?.response?.data?.message || 'Network error', { tone: 'danger' });
    }
    setActing(null);
  };

  const uphold = async () => {
    if (!report.reportedClerkUserId) { notify('No reported traveler on this report.', { tone: 'danger' }); return; }
    if (!(await confirmAction(
      `Uphold this report? This applies the next warning/suspension step for ${reviewerName} automatically.`,
      { danger: true, confirmText: 'Uphold report' }
    ))) return;
    await decide('agree');
  };

  const dismiss = () => decide('disagree');

  const deleteReview = async () => {
    if (!review?._id) { notify('This review no longer exists.', { tone: 'danger' }); return; }
    if (!(await confirmAction('Delete this review permanently?', { danger: true, confirmText: 'Delete review' }))) return;
    setActing(report._id);
    try {
      const data = await commentAPI.delete(review._id);
      if (data?.success === false) notify('Failed: ' + (data?.message || 'Unknown error'), { tone: 'danger' });
      else onUpdated();
    } catch { notify('Network error', { tone: 'danger' }); }
    setActing(null);
  };

  // Manual override — skips the 3-warning ladder and bans the reported
  // traveler immediately. Separate from "Uphold" (which only ever issues the
  // next warning/suspension step).
  const banUser = async () => {
    if (!report.reportedClerkUserId) { notify('No reported traveler on this report.', { tone: 'danger' }); return; }
    if (!(await confirmAction(
      `Permanently ban ${reviewerName}? This is immediate — it does not go through the usual warning/suspension steps.`,
      { danger: true, confirmText: 'Ban permanently' }
    ))) return;
    setActing(report._id);
    try {
      const data = await reportAPI.ban(report._id, adminNote);
      if (data?.success === false) notify('Failed: ' + (data?.message || 'Unknown error'), { tone: 'danger' });
      else onUpdated();
    } catch (err) {
      notify(err?.response?.data?.message || 'Network error', { tone: 'danger' });
    }
    setActing(null);
  };

  return (
    <div style={s.item}>
      <div style={s.itemTop}>
        <Avatar src={review?.userImage || report.reportedUser?.profileImage} name={reviewerName} size={38} />

        <div style={s.itemMain}>
          <div style={s.itemMeta}>
            <span style={s.itemTitle}>{reviewerName}</span>
            <span style={s.itemDate}>{fmtDateTime(report.createdAt)}</span>
            <Tag>{REASON_LABELS[report.reason] || report.reason}</Tag>
            <StatusPill tone={st.tone} icon={st.icon}>{st.label}</StatusPill>
            {report.banApproved && <StatusPill tone="danger" icon="slash">Banned</StatusPill>}
          </div>

          <p style={s.itemText}>
            {review ? `“${review.comment}”` : 'This review has been deleted.'}
          </p>

          <div style={s.itemFacts}>
            {review?.rating != null && <span style={s.itemFact}><Icon name="star" size={12} /> {review.rating}/5</span>}
            <span style={s.itemFact}><Icon name="flag" size={12} /> Reported by {report.reporter?.name || 'a traveler'}</span>
          </div>

          {report.details && (
            <p style={s.itemText}><strong>Reporter&rsquo;s note:</strong> {report.details}</p>
          )}
          {report.resultSummary && (
            <p style={s.itemText}><strong>Action taken:</strong> {report.resultSummary}</p>
          )}
        </div>

        <div style={s.itemSide}>
          <Button size="sm" icon={expanded ? 'chevron-up' : 'chevron-down'} onClick={onToggle}>
            {expanded ? 'Close' : 'Take action'}
          </Button>
        </div>
      </div>

      {expanded && (
        <div style={s.panel}>
          <p style={s.panelLabel}>Admin note</p>
          <textarea
            value={adminNote}
            onChange={e => setAdminNote(e.target.value)}
            placeholder="Internal note about this report…"
            style={s.textarea}
            className="modern-input"
            rows={2}
          />

          {isPending && (
            <p style={s.panelNote}>
              Upholding issues the next escalation step automatically: the 1st warning mutes reviews
              for 1 week, the 2nd mutes for 2 weeks and suspends the account, and a 3rd suspension
              bans the account permanently.
            </p>
          )}

          <div style={s.buttonRow}>
            {isPending && (
              <>
                <Button variant="success" icon="check" disabled={acting || !report.reportedClerkUserId} onClick={uphold}>
                  Uphold report
                </Button>
                <Button icon="x" disabled={acting} onClick={dismiss}>
                  Dismiss report
                </Button>
              </>
            )}
            <Button variant="danger" icon="trash" disabled={acting || !review} onClick={deleteReview}>
              Delete review
            </Button>
            {!report.banApproved && (
              <Button
                variant="dangerSolid"
                icon="slash"
                disabled={acting || !report.reportedClerkUserId}
                onClick={banUser}
                title="Skips the warning steps — bans the traveler immediately"
              >
                Ban permanently
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
