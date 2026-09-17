import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const spotAPI = {
  getAll:        ()             => api.get('/api/spots').then(r => r.data.spots),
  getMine:       ()             => api.get('/api/spots/moderator').then(r => r.data.spots),
  create:        (data)         => api.post('/api/spots', data).then(r => r.data),
  update:        (id, data)     => api.put(`/api/spots/${id}`, data).then(r => r.data),
  delete:        (id)           => api.delete(`/api/spots/${id}`).then(r => r.data),
  getPending:    ()             => api.get('/api/spots/pending').then(r => r.data),
  proposeChange: (id, data)     => api.patch(`/api/spots/${id}/propose`, data).then(r => r.data),
  proposeCreate: (data)         => api.post('/api/spots/propose', data).then(r => r.data),
  proposeDelete: (id, reason)   => api.patch(`/api/spots/${id}/propose-delete`, { reason }).then(r => r.data),
  reviewChange:  (id, action)   => api.patch(`/api/spots/${id}/review`, { action }).then(r => r.data),
  reviewProposal: (id, action)  => api.patch(`/api/spots/proposals/${id}/review`, { action }).then(r => r.data),
  getPendingProposals: ()       => api.get('/api/spots/proposals').then(r => r.data),
  getMyProposals: () => api.get('/api/spots/proposals/mine').then(r => r.data),
  getMyDeleteRequests: () => api.get('/api/spots/delete-requests/mine').then(r => r.data),
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
  reviewLocation: (missionId, action) =>
    api.patch(`/api/missions/${missionId}/review`, { action }).then(r => r.data),
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
  getMine: ()                  => api.get('/api/reviews/admin/mine').then(r => r.data),
  requestReview: (id, reason, proposedAction) =>
    api.patch(`/api/reviews/${id}/flag`, { reason, proposedAction }).then(r => r.data),
  decide: (id, decision, actionType) =>
    api.patch(`/api/reviews/${id}/flag-decision`, { decision, actionType }).then(r => r.data),
  delete: (id)                 => api.delete(`/api/reviews/admin/${id}`).then(r => r.data),
  banUser: (id, banReason)     =>
    api.patch(`/api/reviews/${id}/ban-user`, { banReason }).then(r => r.data),
};

export const bannedAccountsAPI = {
  getAll: () => api.get('/api/admin/banned-users').then(r => r.data.users),
  // No custom duration — the backend applies the next escalating step
  // itself (1st suspension = 7 days, 2nd = 14 days, 3rd auto-escalates to
  // a permanent ban), so manual and automatic suspensions stay consistent.
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

// Mod-proposed / admin-decided account actions (warnings & suspensions)
// that aren't tied to a specific flagged comment — currently just
// inactivity-based suspension proposals.
export const accountActionAPI = {
  getAll:  ()                          => api.get('/api/account-actions').then(r => r.data),
  getMine: ()                          => api.get('/api/account-actions/mine').then(r => r.data),
  propose: (clerkUserId, reason)       =>
    api.post('/api/account-actions', { clerkUserId, reason }).then(r => r.data),
  decide:  (id, decision)              =>
    api.patch(`/api/account-actions/${id}/decision`, { decision }).then(r => r.data),
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
  login: (email, password) =>
    api.post('/api/auth/admin-login', { email, password }).then(r => r.data),
};

// Spot categories. The list used to be hardcoded in both this panel and the
// mobile app; it now lives in the database so it can be changed without a
// release. GET is public; create/update/delete are admin-only.
export const categoryAPI = {
  getAll: () => api.get('/api/categories').then(r => r.data.categories || []),
  create: (data)     => api.post('/api/categories', data).then(r => r.data),
  update: (id, data) => api.put(`/api/categories/${id}`, data).then(r => r.data),
  remove: (id)       => api.delete(`/api/categories/${id}`).then(r => r.data),
};

// Traveler leaderboard + engagement figures. Read-only, and open to
// moderators as well as admins.
export const userProgressAPI = {
  getAll: () => api.get('/api/user-progress').then(r => r.data),
};

// type: 'image' | 'badge' | 'model'
export const uploadAPI = {
  spotMedia: (file, type = 'image') => {
    const formData = new FormData();
    formData.append('file', file);
    return api
      .post(`/api/upload/spot?type=${type}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then(r => r.data);
  },
};

export const spotProposalAPI = {
  create: async (payload) => {
    const response = await api.post('/spot-proposals', payload);
    return response.data;
  },

  getAll: async () => {
    const response = await api.get('/spot-proposals');
    return response.data;
  },

  getPending: async () => {
    const response = await api.get('/spot-proposals/pending');
    return response.data;
  },

  reviewProposal: async (id, action, rejectionReason = '') => {
    const response = await api.patch(
      `/spot-proposals/${id}/review`,
      {
        action,
        rejectionReason,
      }
    );

    return response.data;
  },
};

export default api;