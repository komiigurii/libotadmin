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
  getAll:       ()           => api.get('/api/spots').then(r => r.data.spots),
  create:       (data)       => api.post('/api/spots', data).then(r => r.data),
  update:       (id, data)   => api.put(`/api/spots/${id}`, data).then(r => r.data),
  delete:       (id)         => api.delete(`/api/spots/${id}`).then(r => r.data),
  getPending:   ()           => api.get('/api/spots/pending').then(r => r.data), 
  reviewChange: (id, action) => api.patch(`/api/spots/pending/${id}`, { action }).then(r => r.data), 
};

export const authAPI = {
  login: (email, password) =>
    api.post('/api/auth/admin-login', { email, password }).then(r => r.data),
};

export default api;