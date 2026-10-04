import axios from 'axios';

/**
 * Pre-configured Axios instance for all API calls.
 * - Base URL points to /api/v1/ which is proxied to the backend at port 3001
 *   in development via the Vite dev server proxy config.
 * - Authorization header is injected from localStorage on every request via
 *   the request interceptor below.
 */
const apiClient = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Inject the JWT Authorization header on every outgoing request.
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Global response error handling — callers can still catch errors themselves.
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear stale token and let the router redirect to /login.
      localStorage.removeItem('auth_token');
    }
    return Promise.reject(error);
  },
);

export default apiClient;
