'use client';

import { useState } from 'react';
import { X, Building2, Save } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/utils/api';
import toast from 'react-hot-toast';

export default function BankInfoModal({ employee, onClose }) {
  const qc = useQueryClient();

  const [form, setForm] = useState({
    bank_name:      employee.bank_name      || '',
    bank_code:      employee.bank_code      || '',
    account_number: employee.account_number || '',
    account_name:   employee.account_name   || employee.full_name || '',
  });

  // Fetch Chapa bank list
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
    const bank = banks.find(b => b.id === code || b.acct_no === code || String(b.id) === code);
    setForm(f => ({
      ...f,
      bank_code: code,
      bank_name: bank?.name || f.bank_name,
    }));
  }

  const save = useMutation({
    mutationFn: () => api.patch(`/admin/employee/${employee.employee_id}/bank`, form),
    onSuccess: () => {
      toast.success('Bank info saved.');
      qc.invalidateQueries(['employees']);
      qc.invalidateQueries(['payroll-list']);
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to save.'),
  });

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.bank_code || !form.account_number || !form.account_name)
      return toast.error('Fill all required fields.');
    save.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-brand-primary" />
            <h2 className="font-bold text-gray-900">Bank Account — {employee.full_name}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Bank *</label>
            {banks.length > 0 ? (
              <select
                value={form.bank_code}
                onChange={onBankSelect}
                className="input w-full"
                required
              >
                <option value="">Select bank…</option>
                {banks.map(b => (
                  <option key={b.id} value={String(b.id)}>
                    {b.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={form.bank_code}
                onChange={e => setForm(f => ({ ...f, bank_code: e.target.value }))}
                placeholder="Bank code (e.g. 946)"
                className="input w-full"
                required
              />
            )}
          </div>

          {banks.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Bank Name</label>
              <input
                value={form.bank_name}
                onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))}
                placeholder="Auto-filled from bank selection"
                className="input w-full bg-gray-50"
                readOnly={!!form.bank_code && banks.find(b => String(b.id) === form.bank_code)}
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Account Number *</label>
            <input
              value={form.account_number}
              onChange={e => setForm(f => ({ ...f, account_number: e.target.value }))}
              placeholder="e.g. 1000123456789"
              className="input w-full"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Account Name *</label>
            <input
              value={form.account_name}
              onChange={e => setForm(f => ({ ...f, account_name: e.target.value }))}
              placeholder="Name as registered in bank"
              className="input w-full"
              required
            />
          </div>

          <button
            type="submit"
            disabled={save.isPending}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            {save.isPending ? 'Saving…' : 'Save Bank Info'}
          </button>
        </form>
      </div>
    </div>
  );
}
