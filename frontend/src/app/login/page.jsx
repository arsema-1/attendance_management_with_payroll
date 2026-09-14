'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Eye, EyeOff } from 'lucide-react';
import api from '@/utils/api';
import { saveTokenToIDB } from '@/utils/offlineDB';

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState('employee');
  const TABS = [
    { id: 'employee', label: 'Employee' },
    { id: 'hr',       label: 'HR Officer' },
    { id: 'admin',    label: 'Admin' },
  ];
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    if (!identifier || !password) return toast.error('All fields required.');

    setLoading(true);
    try {
      if (tab === 'employee') {
        const { data } = await api.post('/auth/login', { identifier, password });
        // A stale admin token would otherwise take priority in the API client.
        localStorage.removeItem('admin_token');
        localStorage.removeItem('admin_data');
        localStorage.removeItem('hr_token');
        localStorage.removeItem('hr_data');
        localStorage.setItem('employee_token', data.token);
        localStorage.setItem('employee_data', JSON.stringify(data.employee));
        await saveTokenToIDB(data.token).catch(() => {});
        toast.success(`Welcome, ${data.employee.full_name}!`);
        router.push('/employee');
      } else if (tab === 'hr') {
        const { data } = await api.post('/auth/admin/login', { email: identifier, password });
        if (data.admin.role !== 'hr_officer') {
          toast.error('This login is for HR Officers only.');
          return;
        }
        localStorage.removeItem('employee_token');
        localStorage.removeItem('employee_data');
        localStorage.removeItem('admin_token');
        localStorage.removeItem('admin_data');
        localStorage.setItem('hr_token', data.token);
        localStorage.setItem('hr_data', JSON.stringify(data.admin));
        toast.success(`Welcome, ${data.admin.name}!`);
        router.push('/hr');
      } else {
        const { data } = await api.post('/auth/admin/login', { email: identifier, password });
        localStorage.removeItem('employee_token');
        localStorage.removeItem('employee_data');
        localStorage.removeItem('hr_token');
        localStorage.removeItem('hr_data');
        localStorage.setItem('admin_token', data.token);
        localStorage.setItem('admin_data', JSON.stringify(data.admin));
        toast.success(`Welcome, ${data.admin.name}!`);
        router.push('/admin');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">
        <div className="bg-gradient-to-r from-cyan-700 to-cyan-500 px-6 py-8 text-center text-white">
          <img src="/worklog_logo.png" alt="Work Log" className="mx-auto mb-3 h-16 w-16 rounded-full border-2 border-white/70 object-cover" />
          <h1 className="text-2xl font-bold">Work Log</h1>
          <p className="mt-1 text-xs uppercase tracking-[0.2em] text-cyan-100">Attendance System</p>
        </div>

        <div className="px-6 pt-5">
          <div className="flex rounded-xl bg-gray-100 p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTab(t.id);
                  setIdentifier('');
                  setPassword('');
                }}
                className={`flex-1 rounded-lg px-2 py-2 text-sm font-semibold transition ${
                  tab === t.id ? 'bg-white text-cyan-700 shadow-sm' : 'text-gray-500'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleLogin} className="space-y-4 p-6">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              {tab === 'employee' ? 'Employee ID / Phone / Email' : 'Email'}
            </label>
            <input
              className="input"
              type={tab === 'employee' ? 'text' : 'email'}
              placeholder={tab === 'employee' ? 'MKA-001 or phone...' : 'you@company.com'}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Password</label>
            <div className="relative">
              <input
                className="input pr-10"
                type={showPass ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Signing In...' : `Sign In as ${tab === 'employee' ? 'Employee' : tab === 'hr' ? 'HR Officer' : 'Admin'}`}
          </button>

          <div className="pt-1 text-center text-xs text-gray-500">
            Need to mark attendance?{' '}
            <a href="/attend" className="font-semibold text-cyan-700 hover:underline">
              Scan QR Code
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}
