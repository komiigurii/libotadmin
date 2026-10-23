import axios from 'axios';
import { getToken, isExpired, endSession, SESSION_CHECK_EVENT } from '../auth/session';

// A time limit, so a dead connection ends in an error instead of a page that
// says "Loading…" forever. 60 s outlasts the sleeping server waking up (30–60 s).
// Media uploads set their own, longer one.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'https://libotbackend.onrender.com',
  headers: { 'Content-Type': 'application/json' },
  timeout: 60_000,
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    // Don't send a request the server will reject; end the session instead.
    if (isExpired(token)) {
      endSession('expired');
      return Promise.reject(new axios.Cancel('Session expired'));
    }
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// A 401 on any call made with a token means the server no longer accepts it
// (expired, signed in somewhere else, password reset, deactivated, or
// JWT_SECRET was rotated); the server's `code` says which, for the sign-in
// page. Sign-in is excluded: a 401 there is just a wrong password. So is
// sign-out, which clears the session itself.
//
// A 403 `mustChangePassword` means the account still has its temporary
// password: everything waits until its holder chooses their own.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const url = err?.config?.url || '';
    const isSignInOrOut = url.includes('/api/auth/admin-login') || url.includes('/api/auth/admin-logout');
    const status = err?.response?.status;
    const code = err?.response?.data?.code;
    if (status === 401 && getToken() && !isSignInOrOut) {
      endSession(code || 'expired');
    } else if (status === 403 && code === 'mustChangePassword' && window.location.pathname !== '/set-password') {
      localStorage.setItem('mustChangePassword', '1');
      window.location.assign('/set-password');
    } else if (status === 503 && (code === 'maintenance' || code === 'restricted')) {
      // Maintenance started, or this role was paused: the session check
      // brings the banner up now instead of at the next heartbeat.
      window.dispatchEvent(new Event(SESSION_CHECK_EVENT));
    }
    return Promise.reject(err);
  },
);

// There is no create or update here: every spot change is proposed, then
// approved. The backend's direct-write routes were removed for that reason.
export const spotAPI = {
  // The public list — what the app shows. It leaves out pending edits and
  // deletions, so it suits counts and maps, not the approval status of a spot.
  getAll:        ()             => api.get('/api/spots').then(r => r.data.spots),
  // Every spot with its pending edit / deletion. Admins only.
  getAllAdmin:   ()             => api.get('/api/spots/admin').then(r => r.data.spots),
  getMine:       ()             => api.get('/api/spots/moderator').then(r => r.data.spots),
  getPending:    ()             => api.get('/api/spots/pending').then(r => r.data),
  proposeChange: (id, data)     => api.patch(`/api/spots/${id}/propose`, data).then(r => r.data),
  proposeCreate: (data)         => api.post('/api/spots/propose', data).then(r => r.data),
  proposeDelete: (id, reason)   => api.patch(`/api/spots/${id}/propose-delete`, { reason }).then(r => r.data),
  // A reject needs its reason in `note`; an approve may carry remarks.
  reviewChange:  (id, action, note)   => api.patch(`/api/spots/${id}/review`, { action, note }).then(r => r.data),
  reviewProposal: (id, action, note)  => api.patch(`/api/spots/proposals/${id}/review`, { action, note }).then(r => r.data),
  getPendingProposals: ()       => api.get('/api/spots/proposals').then(r => r.data),
  getMyProposals: () => api.get('/api/spots/proposals/mine').then(r => r.data),
  getMyDeleteRequests: () => api.get('/api/spots/delete-requests/mine').then(r => r.data),
  // Edits to existing attractions + food-spot location requests, kept after
  // review with their status and before/after values.
  getMyChangeRequests: () => api.get('/api/spots/change-requests/mine').then(r => r.data.requests || []),
};

// Missions — currently only used for the 2nd ("location") mission's geofence
// (a food recommendation near the spot the user must physically visit).
// GET is public (no auth needed). Setting the location is propose-then-review,
// same as spot edits: proposeLocation submits it (any admin/moderator can),
// nothing changes live until an admin approves it via reviewLocation.
export const missionAPI = {
  getForSpot: (spotId) => api.get(`/api/missions/${spotId}`).then(r => r.data.missions),
  proposeLocation: (missionId, { lat, lng, locationName, image, locationInfo, radiusMeters }) =>
    api.patch(`/api/missions/${missionId}/location`, { lat, lng, locationName, image, locationInfo, radiusMeters }).then(r => r.data),
  getProposals: () => api.get('/api/missions/proposals').then(r => r.data.proposals),
  reviewLocation: (missionId, action, note) =>
    api.patch(`/api/missions/${missionId}/review`, { action, note }).then(r => r.data),
  // Missions are now created automatically when a spot itself is created —
  // this only matters for older spots that predate that (or where it
  // failed), so an admin/mod isn't stuck with no way to add them from here.
  createDefaults: (spotId) => api.post(`/api/missions/spot/${spotId}/create-defaults`).then(r => r.data),
};

export const commentAPI = {
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return api.get(`/api/reviews/admin/all${query ? '?' + query : ''}`).then(r => r.data);
  },
  // Applies the next warning step to the review's author (the backend decides
  // the mute length, and the 2nd warning also suspends the account).
  warnUser: (id, warnReason)   =>
    api.patch(`/api/reviews/${id}/warn-user`, { warnReason }).then(r => r.data),
  delete: (id)                 => api.delete(`/api/reviews/admin/${id}`).then(r => r.data),
};

export const bannedAccountsAPI = {
  getAll: () => api.get('/api/admin/banned-users').then(r => r.data.users),
  // No custom duration — the backend decides: 7 days, then 14, and the
  // 3rd suspension is a permanent ban instead, so manual and automatic
  // suspensions stay consistent.
  suspend: (clerkUserId, reason) =>
    api.patch(`/api/admin/users/${clerkUserId}/suspend`, { reason }).then(r => r.data),
  ban:    (clerkUserId, reason) =>
    api.patch(`/api/admin/users/${clerkUserId}/ban`, { reason }).then(r => r.data),
  unban:  (clerkUserId) =>
    api.patch(`/api/admin/users/${clerkUserId}/unban`).then(r => r.data),
};

// Ban appeals submitted by archived/banned users. The backend route already
// existed (GET/PATCH /api/admin/appeals) but nothing in this app called it —
// admins could only see an "Appeal pending" badge with no way to read or
// act on the appeal itself.
export const appealAPI = {
  getAll: (status) => api.get(`/api/admin/appeals${status ? `?status=${status}` : ''}`).then(r => r.data.appeals),
  decide: (clerkUserId, decision, adminNote) =>
    api.patch(`/api/admin/appeals/${clerkUserId}`, { decision, adminNote }).then(r => r.data),
};

export const inactiveUsersAPI = {
  getAll:  ()             => api.get('/api/admin/inactive-users').then(r => r.data),
  archive: (clerkUserId)  => api.patch(`/api/admin/inactive-users/${clerkUserId}/archive`).then(r => r.data),
};

// User-submitted reports (mobile app users flagging a spot or a comment).
// Admin-only — moderators have no access to this queue.
export const reportAPI = {
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return api.get(`/api/reports${query ? '?' + query : ''}`).then(r => r.data.reports);
  },
  update: (id, data) => api.patch(`/api/reports/${id}`, data).then(r => r.data),
  // Skips the warning ladder — permanently bans the reported user immediately.
  ban: (id, banReason) =>
    api.patch(`/api/reports/${id}`, { decision: 'ban', banReason }).then(r => r.data),
};

export const authAPI = {
  // Sign-in is by assigned username (the backend still accepts an email), for
  // all three roles.
  login: (username, password) =>
    api.post('/api/auth/admin-login', { username, password }).then(r => r.data),
  // Ends the session on the server too, so the stored token is useless after.
  // Takes the token because the caller clears its stored copy straight away.
  logout: (token) =>
    api.post('/api/auth/admin-logout', null, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.data),
  // Is this session still live? Brings role and town up to date too.
  session: () => api.get('/api/auth/admin-session').then(r => r.data),
  // → { token, role, city }: the change ends every other session, and this one
  // carries on with the fresh token.
  changePassword: (currentPassword, newPassword, confirmPassword) =>
    api.post('/api/auth/change-password', { currentPassword, newPassword, confirmPassword }).then(r => r.data),
  // From the sign-in page: a request to the super admin for a new slip. The
  // answer is the same whether or not the username exists.
  forgotPassword: (username, note) =>
    api.post('/api/auth/forgot-password', { username, note }).then(r => r.data),
};

// Staff accounts (mock defense 2026-10-21). The super admin sees and manages
// every admin and moderator; an admin, the moderators. Making an account or
// resetting a password returns { tempPassword, tempPasswordExpiresAt } once,
// for the credential slip.
export const accountsAPI = {
  getStaff:      (params = {}) => api.get('/api/admin/accounts', { params }).then(r => r.data),
  create:        (data)        => api.post('/api/admin/accounts', data).then(r => r.data),
  resetPassword: (id)          => api.post(`/api/admin/accounts/${id}/reset-password`).then(r => r.data),
  setActive:     (id, active)  => api.patch(`/api/admin/accounts/${id}`, { active }).then(r => r.data.account),
  move:          (id, municipality) => api.patch(`/api/admin/accounts/${id}`, { municipality }).then(r => r.data.account),
  history:       (id)          => api.get(`/api/admin/accounts/${id}/history`).then(r => r.data.entries || []),
  // Super admin only.
  getTravelers:  (params = {}) => api.get('/api/admin/accounts/travelers', { params }).then(r => r.data),
  getTraveler:   (id)          => api.get(`/api/admin/accounts/travelers/${encodeURIComponent(id)}`).then(r => r.data),
};

// The activity log (super admin): who did what, newest first.
export const activityAPI = {
  get: (params = {}) => api.get('/api/admin/activity', { params }).then(r => r.data),
};

// Spot categories. The list used to be hardcoded in both this panel and the
// mobile app; it now lives in the database so it can be changed without a
// release. The panel only reads it; the backend's admin-only create / update /
// delete routes have no screen here.
export const categoryAPI = {
  getAll: () => api.get('/api/categories').then(r => r.data.categories || []),
};

// Traveler leaderboard + engagement figures. Read-only, admins only.
export const userProgressAPI = {
  getAll: () => api.get('/api/user-progress').then(r => r.data),
};

// Town badges: earned by finishing every spot in a town. Admins set each
// town's image, name and description; '' puts a field back to its default.
export const townBadgeAPI = {
  getAdmin: () => api.get('/api/municipality-badges/admin').then(r => r.data.towns || []),
  save: (municipality, data) =>
    api.put(`/api/municipality-badges/${encodeURIComponent(municipality)}`, data).then(r => r.data.badge),
};

// The moderator accounts, for admins (QA 2026-10-16), with their request
// counts. Making and changing them goes through accountsAPI.
export const moderatorsAPI = {
  getAll: () => api.get('/api/admin/moderators').then(r => r.data.moderators || []),
};

// A moderator's travelers: those who visited the spots in the moderator's
// municipality. Read-only (QA 2026-10-16, decided with the team).
export const myTravelersAPI = {
  getAll: () => api.get('/api/moderator/travelers').then(r => r.data),
};

// type: 'image' | 'badge' | 'model'
export const uploadAPI = {
  spotMedia: (file, type = 'image') => {
    const formData = new FormData();
    formData.append('file', file);
    return api
      .post(`/api/upload/spot?type=${type}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        // A 3D model can be up to 20 MB; on a slow uplink that is minutes.
        timeout: 5 * 60_000,
      })
      .then(r => r.data);
  },
};

// A town's outline, for the moderator's map (pins stay inside their town).
export const municipalityAPI = {
  boundary: (name) => api.get(`/api/municipalities/${encodeURIComponent(name)}/boundary`).then(r => r.data),
};

// Day-by-day usage for the dashboards' charts (admin and super admin).
export const statsAPI = {
  usage: (days = 30) => api.get('/api/admin/stats/usage', { params: { days } }).then(r => r.data),
};

// The bell (every role): newest first, with the unread count.
export const notificationsAPI = {
  get:     (params = {}) => api.get('/api/admin/notifications', { params }).then(r => r.data),
  read:    (id) => api.post(`/api/admin/notifications/${id}/read`).then(r => r.data),
  readAll: () => api.post('/api/admin/notifications/read-all').then(r => r.data),
};

// Staff tickets (mock defense 2026-10-21): admins and moderators report a
// problem; the super admin answers, sets the status, and turns a forgotten
// password into a new credential slip.
export const ticketsAPI = {
  list:   (params = {}) => api.get('/api/admin/tickets', { params }).then(r => r.data),
  get:    (id) => api.get(`/api/admin/tickets/${id}`).then(r => r.data.ticket),
  create: (data) => api.post('/api/admin/tickets', data).then(r => r.data.ticket),
  reply:  (id, message) => api.post(`/api/admin/tickets/${id}/replies`, { message }).then(r => r.data.ticket),
  setStatus: (id, status) => api.patch(`/api/admin/tickets/${id}`, { status }).then(r => r.data.ticket),
  // → { ticket, account, tempPassword, tempPasswordExpiresAt } for the slip.
  resetPassword: (id) => api.post(`/api/admin/tickets/${id}/reset-password`).then(r => r.data),
};

/*
 * The super admin's System page (routes/system.js): maintenance, who is let
 * in, the maintenance log, update notices and the tools. Started from the
 * System Console screen a teammate drew (Charles, 2026-10-22); the routes
 * are real now and live under /api/system.
 */
export const systemAPI = {
  // Public: what the app and the sign-in page show.
  status:       () => api.get('/api/system/status').then(r => r.data),
  // Super admin: everything on the page.
  get:          () => api.get('/api/system').then(r => r.data),
  startMaintenance: (data) => api.post('/api/system/maintenance/start', data).then(r => r.data),
  updateMaintenance: (data) => api.put('/api/system/maintenance', data).then(r => r.data),
  endMaintenance: (summary) => api.post('/api/system/maintenance/end', { summary }).then(r => r.data),
  logs:         (params = {}) => api.get('/api/system/maintenance/logs', { params }).then(r => r.data),
  setRestricted: (roles) => api.put('/api/system/restrictions', { roles }).then(r => r.data),
  notices:      (params = {}) => api.get('/api/system/notices', { params }).then(r => r.data),
  publishNotice: (data) => api.post('/api/system/notices', data).then(r => r.data),
  hideNotice:   (id) => api.post(`/api/system/notices/${id}/hide`).then(r => r.data),
  clearCache:   () => api.post('/api/system/tools/clear-cache').then(r => r.data),
  health:       () => api.get('/api/system/tools/health').then(r => r.data),
  locked:       () => api.get('/api/system/tools/locked').then(r => r.data.accounts || []),
  unlock:       (id) => api.post(`/api/system/tools/unlock/${id}`).then(r => r.data),
};

export default api;