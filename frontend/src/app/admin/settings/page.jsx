'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Loader2, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/utils/api';

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  hr_admin:    'HR Admin',
  hr_officer:  'HR Officer',
  viewer:      'Viewer',
};

const ROLE_COLORS = {
  super_admin: 'bg-purple-100 text-purple-700',
  hr_admin:    'bg-blue-100   text-blue-700',
  hr_officer:  'bg-cyan-100   text-cyan-700',
  viewer:      'bg-gray-100   text-gray-600',
};

function CreateAdminModal({ onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'hr_officer' });
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/auth/admin/create', form);
      toast.success('Admin account created.');
      qc.invalidateQueries(['admin-accounts']);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create account.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 animate-fade-in"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-extrabold text-gray-900">Create Admin Account</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="label">Full Name</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="input" placeholder="Jane Smith" required />
          </div>
          <div>
            <label className="label">Email</label>
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              className="input" placeholder="jane@company.com" required />
          </div>
          <div>
            <label className="label">Password</label>
            <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              className="input" placeholder="••••••••" required minLength={8} />
          </div>
          <div>
            <label className="label">Role</label>
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} className="input">
              <option value="hr_officer">HR Officer</option>
              <option value="hr_admin">HR Admin</option>
              <option value="viewer">Viewer</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary px-5">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary px-6">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    const d = localStorage.getItem('admin_data');
    if (d) {
      const { role } = JSON.parse(d);
      if (role !== 'super_admin') router.replace('/admin');
      else setIsSuperAdmin(true);
    }
  }, [router]);

  const { data: admins = [], isLoading } = useQuery({
    queryKey: ['admin-accounts'],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const { data } = await api.get('/auth/admin/list');
      return data.admins || [];
    },
  });

  if (!isSuperAdmin) return null;

  return (
    <div className="space-y-5 animate-fade-in">
      {showCreate && <CreateAdminModal onClose={() => setShowCreate(false)} />}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Admin Accounts</h1>
          <p className="text-sm text-gray-500">Manage HR Officer and other admin accounts.</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="btn-primary flex items-center gap-2 text-sm py-2.5 px-4">
          <Plus className="w-4 h-4" /> Create Account
        </button>
      </div>

      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-gray-50 rounded-xl animate-pulse" />)}
          </div>
        ) : !admins.length ? (
          <div className="py-16 text-center">
            <ShieldCheck className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="font-semibold text-gray-600">No admin accounts found</p>
          </div>
        ) : (
          <table className="min-w-full text-sm text-left">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                {['Name', 'Email', 'Role', 'Status', 'Last Login'].map(h => (
                  <th key={h} className="px-5 py-3 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {admins.map(a => (
                <tr key={a.id} className="hover:bg-gray-50/60">
                  <td className="px-5 py-3 font-semibold text-gray-800">{a.name}</td>
                  <td className="px-5 py-3 text-gray-500">{a.email}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${ROLE_COLORS[a.role] || 'bg-gray-100 text-gray-600'}`}>
                      {ROLE_LABELS[a.role] || a.role}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${a.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {a.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-400 text-xs">
                    {a.last_login_at ? new Date(a.last_login_at).toLocaleString() : 'Never'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
