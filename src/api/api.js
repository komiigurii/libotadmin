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
  getAll:        ()           => api.get('/api/spots').then(r => r.data.spots),
  getMine:       ()           => api.get('/api/spots/moderator').then(r => r.data.spots),
  create:        (data)       => api.post('/api/spots', data).then(r => r.data),
  update:        (id, data)   => api.put(`/api/spots/${id}`, data).then(r => r.data),
  delete:        (id)         => api.delete(`/api/spots/${id}`).then(r => r.data),
  getPending:    ()           => api.get('/api/spots/pending').then(r => r.data),
  proposeChange: (id, data)   => api.patch(`/api/spots/${id}/propose`, data).then(r => r.data),
  reviewChange:  (id, action) => api.patch(`/api/spots/${id}/review`, { action }).then(r => r.data),
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

export default api;