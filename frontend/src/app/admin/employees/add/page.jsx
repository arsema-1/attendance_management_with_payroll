'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter, usePathname } from 'next/navigation';
import { ArrowLeft, Loader2, UserPlus } from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import api from '@/utils/api';

const initialForm = {
  employee_id: '',
  full_name: '',
  email: '',
  phone: '',
  department_id: '',
  designation: '',
  date_of_joining: '',
  base_salary: '',
  password: '',
  bank_name: '',
  bank_code: '',
  account_number: '',
  account_name: '',
};

export default function AddEmployeePage() {
  const router   = useRouter();
  const pathname = usePathname();
  const basePath = pathname.startsWith('/hr') ? '/hr' : '/admin';
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);

  // Fetch Chapa bank list for dropdown
  const { data: banksData } = useQuery({
    queryKey: ['chapa-banks'],
    queryFn: async () => {
      const { data } = await api.get('/payments/banks');
      return data.data || [];
    },
    staleTime: 10 * 60 * 1000,
  });
  const banks = banksData || [];

  function onBankSelect(e) {
    const code = e.target.value;
    const bank = banks.find(b => String(b.id) === code);
    setForm(prev => ({
      ...prev,
      bank_code: code,
      bank_name: bank?.name || prev.bank_name,
    }));
  }


  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);

    try {
      const payload = {
        ...form,
        department_id: form.department_id !== '' ? Number(form.department_id) : null,
        base_salary: form.base_salary !== '' ? Number(form.base_salary) : 0,
      };

      await api.post('/admin/employee/add', payload);
      toast.success('Employee added successfully');
      router.push(`${basePath}/employees`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Unable to add employee.');
    } finally {
      setLoading(false);
    }
  }

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  // Standard departments seeded in the DB
  const DEPARTMENTS = [
    { id: 1, name: 'Management' },
    { id: 2, name: 'Operations' },
    { id: 3, name: 'Finance' },
    { id: 4, name: 'HR' },
    { id: 5, name: 'IT' },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-5 animate-fade-in">
      <div className="flex items-center gap-3">
        <Link href={`${basePath}/employees`} className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
          <ArrowLeft className="w-4 h-4" />
          Back to employees
        </Link>
      </div>

      <div className="card p-6">
        <div className="flex items-center gap-2 mb-6">
          <div className="p-2.5 rounded-xl bg-brand-light text-brand-primary">
            <UserPlus className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900">Add Employee</h1>
            <p className="text-sm text-gray-500">Create a new employee account for attendance access.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Employee ID</label>
            <input name="employee_id" value={form.employee_id} onChange={handleChange} className="input" placeholder="MKA-101" required />
          </div>

          <div>
            <label className="label">Full Name</label>
            <input name="full_name" value={form.full_name} onChange={handleChange} className="input" placeholder="John Doe" required />
          </div>

          <div>
            <label className="label">Email</label>
            <input name="email" type="email" value={form.email} onChange={handleChange} className="input" placeholder="john@company.com" required />
          </div>

          <div>
            <label className="label">Phone</label>
            <input name="phone" value={form.phone} onChange={handleChange} className="input" placeholder="9876543210" required />
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
            <input name="designation" value={form.designation} onChange={handleChange} className="input" placeholder="Field Supervisor" />
          </div>

          <div>
            <label className="label">Date of Joining</label>
            <input name="date_of_joining" type="date" value={form.date_of_joining} onChange={handleChange} className="input" required />
          </div>

          <div>
            <label className="label">Base Salary ($)</label>
            <input name="base_salary" type="number" min="0" value={form.base_salary} onChange={handleChange} className="input" placeholder="25000" />
          </div>

          {/* ── Bank Account Info ── */}
          <div className="md:col-span-2 border-t border-gray-100 pt-4 mt-2">
            <h3 className="text-sm font-bold text-gray-700 mb-3">Bank Account Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">Bank *</label>
                {banks.length > 0 ? (
                  <select value={form.bank_code} onChange={onBankSelect} className="input" required>
                    <option value="">Select bank…</option>
                    {banks.map(b => (
                      <option key={b.id} value={String(b.id)}>{b.name}</option>
                    ))}
                  </select>
                ) : (
                  <input name="bank_code" value={form.bank_code}
                    onChange={handleChange} placeholder="Bank code (e.g. 946)"
                    className="input" required />
                )}
              </div>

              <div>
                <label className="label">Account Number *</label>
                <input name="account_number" value={form.account_number}
                  onChange={handleChange} placeholder="e.g. 1000123456789"
                  className="input" required />
              </div>

              <div className="md:col-span-2">
                <label className="label">Account Name *</label>
                <input name="account_name" value={form.account_name}
                  onChange={handleChange} placeholder="Name as registered in bank"
                  className="input" required />
              </div>
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="label">Password</label>
            <input name="password" type="password" value={form.password} onChange={handleChange} className="input" placeholder="Create a temporary password" required />
          </div>

          <div className="md:col-span-2 pt-2">
            <button type="submit" disabled={loading} className="btn-primary w-full md:w-auto px-6">
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating...
                </span>
              ) : 'Create Employee'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
