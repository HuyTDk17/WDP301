import axios from 'axios';
import { normalizeError } from '../utils/normalizeError.js';

const TOKEN_KEY = 'sfbms_access_token';

export const tokenStorage = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn;
};

const axiosClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 15000,
});

axiosClient.interceptors.request.use((config) => {
  const token = tokenStorage.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (config.data instanceof FormData) delete config.headers['Content-Type'];
  return config;
});

// Trả thẳng body của response ({ data, message, ... }); lỗi được chuẩn hoá.
axiosClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const isLoginCall = error.config?.url?.includes('/auth/login');
    if (error.response?.status === 401 && !isLoginCall && tokenStorage.get()) {
      onUnauthorized();
    }
    return Promise.reject(normalizeError(error));
  },
);

export default axiosClient;
