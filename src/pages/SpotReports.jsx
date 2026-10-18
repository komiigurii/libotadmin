import { useEffect, useState } from 'react';
import { reportAPI } from '../api/api';
import { notify } from '../components/AppAlert';
import {
  Page, PageHeader, Toolbar, FilterTabs, List, Button, StatusPill, Tag,
  Loading, ErrorBanner, EmptyState, Avatar, pageStyles as s,
} from '../components/Layout';
import { fmtDateTime } from '../utils/format';
import Icon from '../components/Icon';

// Travelers' "Report wrong info" from a spot's page in the app. The admin
// can't edit a spot (Spot Management is read-only for admins): the town's
// moderator sends the fix, the admin approves it in the Approval Queue, and
// then marks the report fixed here.
const REPORT_STATUS = {
  pending:   { tone: 'warning', icon: 'clock', label: 'Pending' },
  reviewed:  { tone: 'info',    icon: 'check', label: 'Reviewed' },
  resolved:  { tone: 'success', icon: 'check', label: 'Fixed' },
  dismissed: { tone: 'neutral', icon: 'x',     label: 'Dismissed' },
};

// Same keys and wording as the app's report sheet (Screens/InformationScreen.js).
const REASON_LABELS = {
  wrong_info:     'Wrong details',
  wrong_location: 'Wrong map pin',
  closed:         'Closed or gone',
  inappropriate:  'Inappropriate content',
  other:          'Other',
};

function toArray(data) {
  if (!data) return [];
  if (Array.isArray(data))         return data;
  if (Array.isArray(data.reports)) return data.reports;
  if (Array.isArray(data.data))    return data.data;
  return [];
}

export default function SpotReports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [expandedId, setExpandedId] = useState(null);
  const [acting, setActing] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await reportAPI.getAll({ type: 'spot' });
      setReports(toArray(data));
    } catch {
      setError('Couldn’t load spot reports.');
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
        title="Spot Reports"
        count={pendingCount}
        subtitle="Wrong details about a spot, reported by travelers from the spot’s page in the app."
        actions={<Button icon="refresh-cw" onClick={load} disabled={loading}>Refresh</Button>}
      />

      <Toolbar>
        <FilterTabs
          label="Filter by status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'pending',   label: 'Pending',   count: pendingCount },
            { value: 'resolved',  label: 'Fixed',     count: count('resolved') },
            { value: 'dismissed', label: 'Dismissed', count: count('dismissed') },
            { value: '',          label: 'All',       count: reports.length },
          ]}
        />
      </Toolbar>

      {loading ? (
        <Loading label="Loading spot reports…" />
      ) : error ? (
        <ErrorBanner>{error}</ErrorBanner>
      ) : visible.length === 0 ? (
        <EmptyState
          icon="check"
          title={statusFilter === 'pending' ? 'No reports waiting' : 'No reports here'}
          subtitle={statusFilter === 'pending'
            ? 'When a traveler taps Report wrong info on a spot, it appears here.'
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
  const spot = report.spotId && typeof report.spotId === 'object' ? report.spotId : null;
  const [adminNote, setAdminNote] = useState(report.adminNote || '');

  const st = REPORT_STATUS[report.status] || REPORT_STATUS.pending;
  const isPending = report.status === 'pending';
  const spotName = spot?.name || 'A deleted spot';

  const setStatus = async (status) => {
    setActing(report._id);
    try {
      const data = await reportAPI.update(report._id, { status, adminNote });
      if (data?.success !== false) onUpdated();
      else notify('Failed: ' + (data?.message || 'Unknown error'), { tone: 'danger' });
    } catch (err) {
      notify(err?.response?.data?.message || 'Network error', { tone: 'danger' });
    }
    setActing(null);
  };

  return (
    <div style={s.item}>
      <div style={s.itemTop}>
        <Avatar src={spot?.image} name={spotName} size={38} rounded="8px" />

        <div style={s.itemMain}>
          <div style={s.itemMeta}>
            <span style={s.itemTitle}>{spotName}</span>
            <span style={s.itemDate}>{fmtDateTime(report.createdAt)}</span>
            <Tag>{REASON_LABELS[report.reason] || report.reason}</Tag>
            <StatusPill tone={st.tone} icon={st.icon}>{st.label}</StatusPill>
          </div>

          <p style={s.itemText}>
            {report.details ? `“${report.details}”` : 'The traveler didn’t add any details.'}
          </p>

          <div style={s.itemFacts}>
            {spot?.city && <span style={s.itemFact}><Icon name="map-pin" size={12} /> {spot.city}</span>}
            <span style={s.itemFact}><Icon name="flag" size={12} /> Reported by {report.reporter?.name || 'a traveler'}</span>
          </div>

          {report.adminNote && !expanded && (
            <p style={s.itemText}><strong>Admin note:</strong> {report.adminNote}</p>
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
            placeholder="What was checked or changed…"
            style={s.textarea}
            className="modern-input"
            rows={2}
          />

          {isPending && (
            <p style={s.panelNote}>
              Spot details are changed by {spot?.city ? `the ${spot.city} moderator` : 'the town’s moderator'}.
              Ask them to send the correction from Spot Management, approve it in the Approval Queue,
              then mark this report fixed.
            </p>
          )}

          <div style={s.buttonRow}>
            {report.status !== 'resolved' && (
              <Button variant="success" icon="check" disabled={acting} onClick={() => setStatus('resolved')}>
                Mark fixed
              </Button>
            )}
            {report.status !== 'dismissed' && (
              <Button icon="x" disabled={acting} onClick={() => setStatus('dismissed')}>
                Dismiss
              </Button>
            )}
            {!isPending && (
              <Button variant="subtle" icon="clock" disabled={acting} onClick={() => setStatus('pending')}>
                Reopen
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
