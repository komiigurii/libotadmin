import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Page, PageHeader } from '../components/Layout';
import { publishHeartbeat, useHeartbeat } from '../auth/heartbeat';
import { spotAPI } from '../api/api';
import { fmtNum } from '../utils/format';
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
 *
 * The band's strip is the switch between the two (2026-10-23, the consoles'
 * look): each cell counts its side and opens it, like the strip filters on
 * the super admin's Tickets.
 */

export default function SpotManagement() {
  const { pathname } = useLocation();
  const onApprovals = pathname.startsWith('/spots/approvals');
  const [waiting, setWaiting] = useState(null);
  const [spotCount, setSpotCount] = useState(null);
  const beat = useHeartbeat();
  // The queue reports its count; the rail's badge follows it at once.
  const onCount = useCallback((n) => { setWaiting(n); publishHeartbeat({ pendingApprovals: n }); }, []);

  // The Spots tab reports its own count; on the queue, ask for it.
  useEffect(() => {
    if (!onApprovals) return undefined;
    let live = true;
    spotAPI.getAllAdmin().then((d) => { if (live) setSpotCount((d || []).length); }).catch(() => {});
    return () => { live = false; };
  }, [onApprovals]);

  const pending = waiting ?? beat?.pendingApprovals ?? null;
  const stats = [
    { label: 'Spots', to: '/spots', current: !onApprovals, value: spotCount == null ? '…' : fmtNum(spotCount),
      hint: 'every spot in the app; yours go live at once' },
    { label: 'Approval Queue', to: '/spots/approvals', current: onApprovals, value: pending == null ? '…' : fmtNum(pending),
      tone: pending ? 'warn' : pending === 0 ? 'good' : undefined,
      hint: pending ? 'moderators’ requests waiting for you' : 'nothing waiting for you' },
  ];

  return (
    <Page>
      <PageHeader
        title="Spot Management"
        statsLabel="Spot Management"
      />
      {onApprovals ? <ModRequests embedded onCount={onCount} /> : <Spots embedded onCount={setSpotCount} />}
    </Page>
  );
}
