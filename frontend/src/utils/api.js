import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 15_000,
});

// ─── Attach JWT automatically ─────────────────────────────────
// If an admin is logged in, always send the admin token (covers /payroll, /admin, etc.).
// Otherwise send the employee token.
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const adminToken    = localStorage.getItem('admin_token');
    const hrToken       = localStorage.getItem('hr_token');
    const employeeToken = localStorage.getItem('employee_token');
    const token = adminToken || hrToken || employeeToken;
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── Handle 401 globally ──────────────────────────────────────
api.interceptors.response.use(
  (res) => res,
  (error) => {
    const isLoginRequest = error.config?.url?.startsWith('/auth/');
    if (error.response?.status === 401 && !isLoginRequest && typeof window !== 'undefined') {
      localStorage.removeItem('employee_token');
      localStorage.removeItem('admin_token');
      localStorage.removeItem('hr_token');
      localStorage.removeItem('employee_data');
      localStorage.removeItem('admin_data');
      localStorage.removeItem('hr_data');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
