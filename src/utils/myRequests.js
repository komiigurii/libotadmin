import { spotAPI } from '../api/api';
import { recordFromRequest } from './changeDiff';

/*
 * Every request this moderator has sent, newest first: new spots, edits,
 * deletions and food spot locations. Read by My Submissions, and by the
 * moderator's Spot Management for its Waiting for approval tab and count.
 *
 * Edits and food spot requests come from the backend's change-request
 * history (GET /api/spots/change-requests/mine), which keeps each one after
 * it's decided — before that existed, an edit vanished the moment an admin
 * approved or rejected it.
 *
 * allSettled: one source failing doesn't hide the others; `error` names
 * what didn't load.
 */

function toArray(data, key) {
  if (!data) return [];
  if (Array.isArray(data))       return data;
  if (Array.isArray(data[key]))  return data[key];
  if (Array.isArray(data.data))  return data.data;
  return [];
}

export async function loadMyRequests() {
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
    note: c.reviewNote,
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
    note: p.reviewNote || p.rejectionReason,
    record: p,
  }));

  const deleteItems = (ok(deletesRes) ? toArray(deletesRes.value, 'requests') : []).map((d) => ({
    kind: 'delete',
    id: d._id,
    status: d.status || 'pending',
    subtitle: d.spotName || '—',
    date: d.submittedAt,
    decidedAt: d.reviewedAt,
    note: d.reviewNote,
    reason: d.reason,
  }));

  return {
    requests: [...changeItems, ...legacyEdits, ...proposalItems, ...deleteItems]
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)),
    spotCount: ok(spotsRes) ? mySpots.length : null,
    error: failed.length ? `Couldn’t load ${failed.join(', ')}. Everything else is shown below.` : null,
  };
}
