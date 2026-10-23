import Drawer from './Drawer';
import { StatusPill } from './Layout';
import { Facts, DetailSection, DetailText, detailStyles as d } from './Details';
import { fmtDateTime } from '../utils/format';

/*
 * One maintenance window from the System page's log (2026-10-23: a row opens
 * its details): when it started, was expected to end and ended, who started
 * and ended it, the message in the staff's pop-up, and the summary of the work.
 * `length`: how long it ran, worded by the page; null while it goes on.
 */
export default function MaintenanceDrawer({ log: l, length, onClose }) {
  return (
    <Drawer title="Maintenance" subtitle={`Started ${fmtDateTime(l.startedAt)}`} onClose={onClose}>
      <div style={d.stack}>
        <div>
          {l.endedAt
            ? <StatusPill tone="success" icon="check">Ended</StatusPill>
            : <StatusPill tone="warning" icon="clock">Going on</StatusPill>}
        </div>
        <Facts items={[
          ['Started', fmtDateTime(l.startedAt)],
          ['Started by', l.startedBy?.username || '—'],
          ['Expected to end', l.expectedEndAt ? fmtDateTime(l.expectedEndAt) : null],
          ['Ended', l.endedAt ? fmtDateTime(l.endedAt) : 'Not yet'],
          ['Ended by', l.endedBy?.username || null],
          ['Length', length],
        ]} />
        <DetailSection title="Message in the pop-up">
          <DetailText>{l.message || 'No message was written.'}</DetailText>
        </DetailSection>
        <DetailSection title="What was done">
          <DetailText>{l.summary || (l.endedAt ? 'No summary was written.' : 'Written when the maintenance ends.')}</DetailText>
        </DetailSection>
      </div>
    </Drawer>
  );
}
