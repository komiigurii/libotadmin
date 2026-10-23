import { useCallback, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Page, PageHeader } from '../components/Layout';
import { publishHeartbeat, useHeartbeat } from '../auth/heartbeat';
import { theme as t, radius } from '../theme';
import Spots from './Spots';
import ModRequests from './ModRequests';

/*
 * Spot Management for admins: everything about spots on one page (mock
 * defense 2026-10-21: "hindi dapat site management tawag kung walang manage
 * na ginagawa"). The spots themselves, which an admin adds, edits and deletes
 * directly, and the moderators' requests waiting for a decision.
 *   /spots            the spots
 *   /spots/approvals  the Approval Queue (was its own page, /mod-requests)
 * Moderators have the spots of their town only, at /spots (pages/Spots.jsx).
 */

const TABS = [
  { path: '/spots', label: 'Spots' },
  { path: '/spots/approvals', label: 'Approval Queue' },
];

export default function SpotManagement() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const onApprovals = pathname.startsWith('/spots/approvals');
  const [waiting, setWaiting] = useState(null);
  const beat = useHeartbeat();
  // The queue reports its count; the rail's badge follows it at once.
  const onCount = useCallback((n) => { setWaiting(n); publishHeartbeat({ pendingApprovals: n }); }, []);

  return (
    <Page>
      <PageHeader
        title="Spot Management"
        subtitle={onApprovals
          ? 'New spots, edits, deletions and food spots from moderators. Nothing of theirs goes live until you approve it; a rejection needs its reason.'
          : 'Every spot in the app. What you add, edit or delete goes live at once; moderators’ changes wait in the Approval Queue.'}
      />
      <nav aria-label="Spot Management" style={x.tabs}>
        {TABS.map((tab) => {
          const on = tab.path === '/spots' ? !onApprovals : onApprovals;
          const count = tab.path === '/spots/approvals' ? (waiting ?? beat?.pendingApprovals) : null;
          return (
            <button key={tab.path} type="button" onClick={() => navigate(tab.path)}
              aria-current={on ? 'page' : undefined} style={{ ...x.tab, ...(on ? x.tabOn : null) }}>
              {tab.label}
              {count > 0 && <span style={x.count}>{count}</span>}
            </button>
          );
        })}
      </nav>
      {onApprovals ? <ModRequests embedded onCount={onCount} /> : <Spots embedded />}
    </Page>
  );
}

const x = {
  // Underlined tabs, longhand borders so the active one swaps cleanly.
  tabs: { display: 'flex', gap: 4, borderBottom: `1px solid ${t.divider}`, overflowX: 'auto' },
  tab: {
    display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 12px 9px', marginBottom: -1,
    background: 'none', borderWidth: '0 0 2px 0', borderStyle: 'solid', borderColor: 'transparent', borderRadius: 0,
    color: t.textSecondary, fontFamily: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
  },
  tabOn: { color: t.textPrimary, borderColor: t.brand },
  count: { fontSize: 11, fontWeight: 700, lineHeight: '18px', padding: '0 7px', borderRadius: radius.pill, background: t.accentBg, color: t.textPrimary, border: `1px solid ${t.accent}` },
};
