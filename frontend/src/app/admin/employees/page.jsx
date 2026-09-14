'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Loader2, Ban, Plus, X, Pencil, Building2 } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import toast from 'react-hot-toast';
import api from '@/utils/api';
import BankInfoModal from '@/components/shared/BankInfoModal';

const DEPARTMENTS = [
  { id: 1, name: 'Management' },
  { id: 2, name: 'Operations' },
  { id: 3, name: 'Finance' },
  { id: 4, name: 'HR' },
  { id: 5, name: 'IT' },
];

const formatDate = (value) => {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('en-US', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch { return value; }
};

/* ─── Edit Modal ─────────────────────────────────────────── */
function EditModal({ employee, onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    full_name:       employee.full_name       || '',
    email:           employee.email           || '',
    phone:           employee.phone           || '',
    department_id:   employee.department_id   ?? '',
    designation:     employee.designation     || '',
    date_of_joining: employee.date_of_joining
      ? employee.date_of_joining.split('T')[0]
      : '',
    base_salary:     employee.base_salary     ?? '',
    password:        '',
  });
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.patch(`/admin/employee/${employee.employee_id}`, {
        ...form,
        department_id: form.department_id !== '' ? Number(form.department_id) : null,
        base_salary:   form.base_salary   !== '' ? Number(form.base_salary)   : 0,
      });
      toast.success(res.data.message || 'Employee updated.');
      qc.invalidateQueries(['admin-employees']);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update employee.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 animate-fade-in"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div>
            <h2 className="font-extrabold text-gray-900">Edit Employee</h2>
            <p className="text-xs text-gray-400">{employee.employee_id}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Full Name</label>
            <input name="full_name" value={form.full_name} onChange={handleChange}
              className="input" placeholder="John Doe" required />
          </div>

          <div>
            <label className="label">Email</label>
            <input name="email" type="email" value={form.email} onChange={handleChange}
              className="input" placeholder="john@company.com" required />
          </div>

          <div>
            <label className="label">Phone</label>
            <input name="phone" value={form.phone} onChange={handleChange}
              className="input" placeholder="9876543210" required />
          </div>

          <div>
            <label className="label">Department</label>
            <select name="department_id" value={form.department_id} onChange={handleChange} className="input">
              <option value="">— None —</option>
              {DEPARTMENTS.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Designation</label>
            <input name="designation" value={form.designation} onChange={handleChange}
              className="input" placeholder="Field Supervisor" />
          </div>

          <div>
            <label className="label">Date of Joining</label>
            <input name="date_of_joining" type="date" value={form.date_of_joining}
              onChange={handleChange} className="input" required />
          </div>

          <div>
            <label className="label">Base Salary ($)</label>
            <input name="base_salary" type="number" min="0" value={form.base_salary}
              onChange={handleChange} className="input" placeholder="25000" />
          </div>

          <div>
            <label className="label">New Password <span className="text-gray-400 font-normal">(leave blank to keep)</span></label>
            <input name="password" type="password" value={form.password}
              onChange={handleChange} className="input" placeholder="••••••••" />
          </div>

          <div className="md:col-span-2 flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary px-5">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary px-6">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Main page ──────────────────────────────────────────── */
export default function EmployeePage() {
  const [search, setSearch]         = useState('');
  const [editEmployee, setEditEmployee] = useState(null);
  const [bankEmployee, setBankEmployee] = useState(null);
  const queryClient = useQueryClient();
  const pathname    = usePathname();
  const basePath    = pathname.startsWith('/hr') ? '/hr' : '/admin';

  // Role detection: only HR (hr_officer, hr_admin) can add/edit/deactivate employees
  // Check both admin_data and hr_data since HR officers may be logged in via either shell
  const [role, setRole] = useState('');
  useEffect(() => {
    const adminD = localStorage.getItem('admin_data');
    const hrD    = localStorage.getItem('hr_data');
    const data   = JSON.parse(adminD || hrD || '{}');
    setRole(data.role || '');
  }, []);
  const isHR = role === 'hr_officer' || role === 'hr_admin';
  const isSuperAdmin = role === 'super_admin';

  const { data = [], isLoading } = useQuery({
    queryKey: ['admin-employees', search],
    queryFn: async () => {
      const url = search
        ? `/admin/employees?active=true&search=${encodeURIComponent(search)}`
        : '/admin/employees?active=true';
      const { data } = await api.get(url);
      return data.data || [];
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (employeeId) => api.patch(`/admin/employee/${employeeId}/deactivate`),
    onSuccess: () => {
      toast.success('Employee deactivated.');
      queryClient.invalidateQueries({ queryKey: ['admin-employees'] });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Unable to deactivate employee.'),
  });

  return (
    <div className="space-y-5 animate-fade-in">
      {editEmployee && (
        <EditModal employee={editEmployee} onClose={() => setEditEmployee(null)} />
      )}
      {bankEmployee && (
        <BankInfoModal employee={bankEmployee} onClose={() => setBankEmployee(null)} />
      )}

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Employees</h1>
          <p className="text-sm text-gray-500">Manage your staff records.</p>
        </div>
        {isHR && (
          <Link href={`${basePath}/employees/add`}
            className="btn-primary text-sm py-2.5 px-4 inline-flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Employee
          </Link>
        )}
        {isSuperAdmin && (
          <span className="text-xs text-gray-400 self-center">Add employee is restricted to HR</span>
        )}
      </div>

      <div className="card p-4">
        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, email, or employee ID"
            className="input pl-9" />
        </div>
      </div>

      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-5 py-3 font-semibold">Employee</th>
                <th className="px-5 py-3 font-semibold">Department</th>
                <th className="px-5 py-3 font-semibold">Designation</th>
                <th className="px-5 py-3 font-semibold">Joined</th>
                <th className="px-5 py-3 font-semibold">Base Salary</th>
                <th className="px-5 py-3 font-semibold">Bank Account</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-gray-400">
                    <div className="inline-flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> Loading employees...
                    </div>
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-gray-400">
                    No employees found.
                  </td>
                </tr>
              ) : (
                data.map(emp => (
                  <tr key={emp.employee_id} className="hover:bg-gray-50/60">
                    <td className="px-5 py-3">
                      <p className="font-semibold text-gray-800">{emp.full_name}</p>
                      <p className="text-xs text-gray-400">{emp.employee_id} · {emp.email}</p>
                    </td>
                    <td className="px-5 py-3 text-gray-600">{emp.department || '—'}</td>
                    <td className="px-5 py-3 text-gray-600">{emp.designation || '—'}</td>
                    <td className="px-5 py-3 text-gray-600">{formatDate(emp.date_of_joining)}</td>
                    <td className="px-5 py-3 text-gray-600">
                      ${parseFloat(emp.base_salary || 0).toLocaleString('en-US')}
                    </td>
                    <td className="px-5 py-3">
                      {emp.account_number ? (
                        <div>
                          <p className="text-xs font-semibold text-gray-700">{emp.account_name}</p>
                          <p className="text-xs text-gray-400">{emp.bank_name || emp.bank_code} · {emp.account_number}</p>
                        </div>
                      ) : (
                        <span className="text-xs text-orange-500 font-semibold">Not set</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold
                        ${emp.is_active ? 'bg-cyan-100 text-cyan-700' : 'bg-red-100 text-red-700'}`}>
                        {emp.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {isHR ? (
                        <div className="inline-flex items-center gap-3">
                          <button onClick={() => setEditEmployee(emp)}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-primary hover:text-brand-dark">
                            <Pencil className="w-3.5 h-3.5" /> Edit
                          </button>
                          <button onClick={() => setBankEmployee(emp)}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700">
                            <Building2 className="w-3.5 h-3.5" /> Bank
                          </button>
                          <button
                            onClick={() => deactivateMutation.mutate(emp.employee_id)}
                            disabled={deactivateMutation.isPending || !emp.is_active}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-40">
                            <Ban className="w-3.5 h-3.5" /> Deactivate
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400 italic">View only — contact HR to make changes</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
