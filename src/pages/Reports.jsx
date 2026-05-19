import { useEffect, useState } from 'react';

const API = 'https://libotbackend.onrender.com/api';

// Read JWT from localStorage (same pattern as your Login page)
const getToken = () => localStorage.getItem('adminToken');
const getRole  = () => {
  try {
    const token = getToken();
    if (!token) return null;
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.role || null;
  } catch {
    return null;
  }
};

const REASON_LABELS = {
  spam:               'Spam',
  offensive_language: 'Offensive language',
  fake_review:        'Fake review',
  harassment:         'Harassment',
  wrong_info:         'Wrong info',
  wrong_location:     'Wrong location',
  inappropriate:      'Inappropriate',
  closed:             'Closed',
  other:              'Other',
};

const STATUS_COLORS = {
  pending:   { bg: '#FEF3C7', color: '#92400E' },
  reviewed:  { bg: '#DBEAFE', color: '#1E40AF' },
  resolved:  { bg: '#D1FAE5', color: '#065F46' },
  dismissed: { bg: '#F3F4F6', color: '#6B7280' },
};

export default function Reports() {
  const role = getRole();

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <h1 style={s.title}>Reports</h1>
          <p style={s.subtitle}>
            {role === 'admin' ? 'Manage ban requests and all reports' : 'Review reported comments'}
          </p>
        </div>
      </div>

      {role === 'moderator' && <ModeratorView />}
      {role === 'admin'     && <AdminView />}
      {role !== 'moderator' && role !== 'admin' && (
        <p style={{ color: '#9a7a78', padding: 40, textAlign: 'center' }}>
          Access denied.
        </p>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   MODERATOR VIEW
   Shows pending review reports; moderator submits verdict + optional ban request
───────────────────────────────────────────── */
function ModeratorView() {
  const [reports,  setReports]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [tab,      setTab]      = useState('pending'); // pending | reviewed

  const load = async () => {
    setLoading(true);
    try {
      const res  = await fetch(`${API}/reports/moderator?status=${tab}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      setReports(data.success ? data.reports : []);
    } catch {
      setReports([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [tab]);

  return (
    <>
      <div style={s.tabs}>
        {['pending', 'reviewed'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ ...s.tab, ...(tab === t ? s.tabActive : {}) }}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={s.empty}>Loading...</div>
      ) : reports.length === 0 ? (
        <div style={s.empty}>No {tab} reports.</div>
      ) : (
        reports.map(r => (
          <ModeratorReportCard key={r._id} report={r} onUpdated={load} />
        ))
      )}
    </>
  );
}

function ModeratorReportCard({ report, onUpdated }) {
  const [open,      setOpen]      = useState(false);
  const [verdict,   setVerdict]   = useState('');
  const [note,      setNote]      = useState('');
  const [requestBan, setRequestBan] = useState(false);
  const [saving,    setSaving]    = useState(false);

  const review = report.reviewId;
  const statusStyle = STATUS_COLORS[report.status] || STATUS_COLORS.pending;

  const handleVerdict = async () => {
    if (!verdict) { alert('Select a verdict first.'); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API}/reports/${report._id}/verdict`, {
        method:  'PATCH',
        headers: {
          'Content-Type':  'application/json',
          Authorization:   `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ verdict, moderatorNote: note, requestBan }),
      });
      const data = await res.json();
      if (data.success) {
        setOpen(false);
        onUpdated();
      } else {
        alert('Failed: ' + data.message);
      }
    } catch {
      alert('Network error');
    }
    setSaving(false);
  };

  return (
    <div style={s.card}>
      <div style={s.cardRow}>
        {/* Left: review excerpt */}
        <div style={{ flex: 1 }}>
          <div style={s.metaRow}>
            <span style={{ ...s.badge, background: statusStyle.bg, color: statusStyle.color }}>
              {report.status}
            </span>
            <span style={s.meta}>
              {REASON_LABELS[report.reason] || report.reason}
            </span>
            <span style={s.meta}>
              {new Date(report.createdAt).toLocaleDateString()}
            </span>
          </div>

          {review ? (
            <blockquote style={s.quote}>
              "{review.comment?.slice(0, 160)}{review.comment?.length > 160 ? '…' : ''}"
            </blockquote>
          ) : (
            <p style={s.meta}>Review no longer available</p>
          )}

          {report.details && (
            <p style={s.detailsText}>Reporter note: {report.details}</p>
          )}

          {report.moderatorVerdict && (
            <p style={s.verdictBadge}>
              Verdict: <strong>{report.moderatorVerdict}</strong>
              {report.banRequested && ' · Ban requested'}
            </p>
          )}
        </div>

        {/* Actions */}
        {report.status === 'pending' && (
          <button onClick={() => setOpen(o => !o)} style={s.reviewBtn}>
            {open ? 'Cancel' : 'Review'}
          </button>
        )}
      </div>

      {/* Verdict form */}
      {open && (
        <div style={s.verdictForm}>
          <p style={s.formLabel}>Your verdict</p>
          <div style={s.verdictOptions}>
            {['guilty', 'not_guilty'].map(v => (
              <button
                key={v}
                onClick={() => setVerdict(v)}
                style={{
                  ...s.verdictBtn,
                  ...(verdict === v
                    ? v === 'guilty' ? s.verdictGuilty : s.verdictNotGuilty
                    : {}),
                }}
              >
                {v === 'guilty' ? '⚠ Guilty' : '✓ Not guilty'}
              </button>
            ))}
          </div>

          {verdict === 'guilty' && (
            <label style={s.checkRow}>
              <input
                type="checkbox"
                checked={requestBan}
                onChange={e => setRequestBan(e.target.checked)}
                style={{ marginRight: 8 }}
              />
              Request ban for this user
            </label>
          )}

          <textarea
            placeholder="Moderator note (optional)..."
            value={note}
            onChange={e => setNote(e.target.value)}
            style={s.textarea}
            rows={3}
          />

          <button
            onClick={handleVerdict}
            disabled={saving}
            style={{ ...s.submitBtn, opacity: saving ? 0.6 : 1 }}
          >
            {saving ? 'Submitting…' : 'Submit verdict'}
          </button>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   ADMIN VIEW
   Two sub-tabs: Ban Requests (actionable) | All Reports (read-only)
───────────────────────────────────────────── */
function AdminView() {
  const [tab, setTab] = useState('ban_requests');

  return (
    <>
      <div style={s.tabs}>
        {[
          { key: 'ban_requests', label: 'Ban requests' },
          { key: 'all',          label: 'All reports' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ ...s.tab, ...(tab === t.key ? s.tabActive : {}) }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'ban_requests' && <BanRequestsTab />}
      {tab === 'all'          && <AllReportsTab />}
    </>
  );
}

function BanRequestsTab() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res  = await fetch(`${API}/reports/ban-requests`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      setReports(data.success ? data.reports : []);
    } catch {
      setReports([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div style={s.empty}>Loading...</div>;
  if (!reports.length) return <div style={s.empty}>No pending ban requests.</div>;

  return reports.map(r => <BanRequestCard key={r._id} report={r} onUpdated={load} />);
}

function BanRequestCard({ report, onUpdated }) {
  const [adminNote, setAdminNote] = useState('');
  const [saving,    setSaving]    = useState(false);
  const review = report.reviewId;

  const handleBan = async (approved) => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/reports/${report._id}/ban`, {
        method:  'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ approved, adminNote }),
      });
      const data = await res.json();
      if (data.success) {
        onUpdated();
      } else {
        alert('Failed: ' + data.message);
      }
    } catch {
      alert('Network error');
    }
    setSaving(false);
  };

  return (
    <div style={{ ...s.card, borderLeft: '4px solid #D85A30' }}>
      <div style={s.metaRow}>
        <span style={{ ...s.badge, background: '#FEE2E2', color: '#991B1B' }}>
          Ban requested
        </span>
        <span style={s.meta}>{REASON_LABELS[report.reason] || report.reason}</span>
        <span style={s.meta}>{new Date(report.updatedAt).toLocaleDateString()}</span>
      </div>

      {review && (
        <blockquote style={s.quote}>
          "{review.comment?.slice(0, 200)}{review.comment?.length > 200 ? '…' : ''}"
        </blockquote>
      )}

      <p style={s.detailsText}>
        Reported user ID: <code style={s.code}>{report.reportedClerkUserId}</code>
      </p>

      {report.moderatorNote && (
        <p style={s.detailsText}>Moderator note: {report.moderatorNote}</p>
      )}

      <textarea
        placeholder="Admin note (optional)..."
        value={adminNote}
        onChange={e => setAdminNote(e.target.value)}
        style={{ ...s.textarea, marginTop: 12 }}
        rows={2}
      />

      <div style={s.banActions}>
        <button
          onClick={() => handleBan(true)}
          disabled={saving}
          style={{ ...s.submitBtn, background: '#991B1B', opacity: saving ? 0.6 : 1 }}
        >
          Approve ban
        </button>
        <button
          onClick={() => handleBan(false)}
          disabled={saving}
          style={{ ...s.dismissBtn, opacity: saving ? 0.6 : 1 }}
        >
          Reject & dismiss
        </button>
      </div>
    </div>
  );
}

function AllReportsTab() {
  const [reports,    setReports]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter,   setTypeFilter]   = useState('');

  const load = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (typeFilter)   params.set('type', typeFilter);
    try {
      const res  = await fetch(`${API}/reports?${params.toString()}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      setReports(data.success ? data.reports : []);
    } catch {
      setReports([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [statusFilter, typeFilter]);

  return (
    <>
      <div style={s.filters}>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={s.select}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="reviewed">Reviewed</option>
          <option value="resolved">Resolved</option>
          <option value="dismissed">Dismissed</option>
        </select>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={s.select}>
          <option value="">All types</option>
          <option value="spot">Spot</option>
          <option value="review">Review</option>
        </select>
      </div>

      {loading ? (
        <div style={s.empty}>Loading...</div>
      ) : reports.length === 0 ? (
        <div style={s.empty}>No reports found.</div>
      ) : (
        <div style={s.table}>
          <div style={s.thead}>
            <span style={{ flex: 2 }}>Report</span>
            <span style={{ flex: 1 }}>Type</span>
            <span style={{ flex: 1 }}>Reason</span>
            <span style={{ flex: 1 }}>Status</span>
            <span style={{ flex: 1 }}>Date</span>
          </div>
          {reports.map(r => {
            const ss = STATUS_COLORS[r.status] || STATUS_COLORS.pending;
            return (
              <div key={r._id} style={s.trow}>
                <span style={{ flex: 2, fontSize: 13, color: '#2d1f1e' }}>
                  {r.reportType === 'review'
                    ? (r.reviewId?.comment?.slice(0, 60) + (r.reviewId?.comment?.length > 60 ? '…' : '') || 'Review deleted')
                    : (r.spotId?.name || 'Spot deleted')}
                </span>
                <span style={{ flex: 1 }}>
                  <span style={{ ...s.badge, background: r.reportType === 'review' ? '#EDE9FE' : '#E0F2FE', color: r.reportType === 'review' ? '#5B21B6' : '#0369A1' }}>
                    {r.reportType}
                  </span>
                </span>
                <span style={{ flex: 1, fontSize: 13, color: '#4a2e2c' }}>
                  {REASON_LABELS[r.reason] || r.reason}
                </span>
                <span style={{ flex: 1 }}>
                  <span style={{ ...s.badge, background: ss.bg, color: ss.color }}>
                    {r.status}
                  </span>
                </span>
                <span style={{ flex: 1, fontSize: 12, color: '#9a7a78' }}>
                  {new Date(r.createdAt).toLocaleDateString()}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ─────────────────────────────────────────────
   Styles
───────────────────────────────────────────── */
const s = {
  page:       { padding: '32px 40px', maxWidth: 1100, margin: '0 auto' },
  header:     { marginBottom: 24 },
  title:      { fontSize: 26, fontWeight: 700, color: '#2d1f1e', marginBottom: 4 },
  subtitle:   { fontSize: 14, color: '#9a7a78' },

  tabs:       { display: 'flex', gap: 8, marginBottom: 20 },
  tab:        { padding: '8px 18px', borderRadius: 8, border: '1px solid #f0e0de', background: '#fff', color: '#9a7a78', fontWeight: 600, fontSize: 14, cursor: 'pointer' },
  tabActive:  { background: '#6b4b45', color: '#fff', border: '1px solid #6b4b45' },

  card:       { background: '#fff', borderRadius: 14, border: '1px solid #f0e0de', padding: '18px 20px', marginBottom: 12, boxShadow: '0 1px 4px rgba(74,46,44,0.06)' },
  cardRow:    { display: 'flex', gap: 16, alignItems: 'flex-start' },

  metaRow:    { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' },
  badge:      { padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, display: 'inline-block' },
  meta:       { fontSize: 13, color: '#9a7a78' },

  quote:      { margin: '0 0 8px', padding: '10px 14px', background: '#faf5f4', borderLeft: '3px solid #e8d0ce', borderRadius: '0 8px 8px 0', fontSize: 14, color: '#4a2e2c', lineHeight: 1.5, fontStyle: 'italic' },
  detailsText:{ fontSize: 12, color: '#9a7a78', marginTop: 6 },
  verdictBadge:{ fontSize: 13, color: '#6b4b45', marginTop: 6, fontWeight: 500 },
  code:       { background: '#faf0ee', padding: '2px 6px', borderRadius: 4, fontSize: 11, fontFamily: 'monospace' },

  reviewBtn:  { padding: '8px 16px', background: '#6b4b45', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', flexShrink: 0 },

  verdictForm:    { marginTop: 16, paddingTop: 16, borderTop: '1px solid #f0e0de' },
  formLabel:      { fontSize: 14, fontWeight: 600, color: '#4a2e2c', marginBottom: 10 },
  verdictOptions: { display: 'flex', gap: 10, marginBottom: 12 },
  verdictBtn:     { padding: '9px 20px', borderRadius: 8, border: '1.5px solid #e8d0ce', background: '#fff', color: '#9a7a78', fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  verdictGuilty:  { borderColor: '#991B1B', background: '#FEE2E2', color: '#991B1B' },
  verdictNotGuilty:{ borderColor: '#065F46', background: '#D1FAE5', color: '#065F46' },

  checkRow:   { display: 'flex', alignItems: 'center', fontSize: 13, color: '#4a2e2c', marginBottom: 12, cursor: 'pointer' },
  textarea:   { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #e8d0ce', fontSize: 13, color: '#2d1f1e', background: '#fff', resize: 'vertical', outline: 'none', boxSizing: 'border-box' },
  submitBtn:  { padding: '10px 24px', background: '#6b4b45', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer', marginTop: 10 },
  dismissBtn: { padding: '10px 24px', background: '#faf0ee', color: '#4a2e2c', border: '1px solid #e8d0ce', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer', marginTop: 10 },
  banActions: { display: 'flex', gap: 10, marginTop: 4 },

  filters:    { display: 'flex', gap: 10, marginBottom: 16 },
  select:     { padding: '8px 12px', borderRadius: 8, border: '1px solid #f0e0de', fontSize: 13, color: '#4a2e2c', background: '#fff', outline: 'none', cursor: 'pointer' },

  table:      { background: '#fff', borderRadius: 14, border: '1px solid #f0e0de', overflow: 'hidden' },
  thead:      { display: 'flex', padding: '10px 16px', background: '#faf5f4', fontSize: 12, fontWeight: 600, color: '#9a7a78', textTransform: 'uppercase', letterSpacing: '0.05em', gap: 10 },
  trow:       { display: 'flex', padding: '12px 16px', borderTop: '1px solid #faf0ee', alignItems: 'center', gap: 10 },

  empty:      { padding: 60, textAlign: 'center', color: '#9a7a78' },
};