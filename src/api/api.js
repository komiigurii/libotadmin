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
  ban:    (clerkUserId, reason, durationDays) =>
    api.patch(`/api/admin/users/${clerkUserId}/ban`, { reason, durationDays }).then(r => r.data),
  unban:  (clerkUserId) =>
    api.patch(`/api/admin/users/${clerkUserId}/unban`).then(r => r.data),
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