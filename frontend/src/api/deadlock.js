import axios from 'axios';

const api = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL || '/api' });

export const getPresets = () => api.get('/presets');
export const loadPreset = (name) => api.post(`/init/preset/${name}`);
export const initSystem = (data) => api.post('/init', data);
export const getState = () => api.get('/state');
export const checkSafety = () => api.post('/check-safety');
export const detectDeadlock = () => api.post('/detect-deadlock');
export const recoverDeadlock = () => api.post('/recover');
export const requestResources = (processId, request) =>
  api.post('/request', { process_id: processId, request });
export const resetSystem = () => api.post('/reset');
export const assignFreeResource = () => api.post('/assign-free-resource');
