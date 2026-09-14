'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CreditCard, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import api from '@/utils/api';
import Link from 'next/link';

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function fmt(n) {
  return `${parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

const TX_STYLES = {
  pending:    { cls: 'bg-yellow-100 text-yellow-700', Icon: Clock },
  successful: { cls: 'bg-green-100  text-green-700',  Icon: CheckCircle },
  failed:     { cls: 'bg-red-100    text-red-600',    Icon: AlertCircle },
};

export default function TransactionsPage() {
  const now = new Date();
  const [month,  setMonth]  = useState('');
  const [year,   setYear]   = useState(String(now.getFullYear()));
  const [status, setStatus] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['payment-transactions', month, year, status],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (month)  params.set('month',  month);
      if (year)   params.set('year',   year);
      if (status) params.set('status', status);
      const { data } = await api.get(`/payments/transactions?${params}`);
      return data;
    },
  });

  const transactions = data?.data || [];
  const total        = data?.total || 0;

  const totalPaid = transactions
    .filter(t => t.status === 'successful')
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/admin/payroll" className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Payment Transactions</h1>
          <p className="text-sm text-gray-500">All Chapa bank transfer records.</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3 items-center">
        <select value={month} onChange={e => setMonth(e.target.value)} className="input py-2 w-auto">
          <option value="">All months</option>
          {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
        </select>
        <select value={year} onChange={e => setYear(e.target.value)} className="input py-2 w-auto">
          {[now.getFullYear() - 1, now.getFullYear()].map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <select value={status} onChange={e => setStatus(e.target.value)} className="input py-2 w-auto">
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="successful">Successful</option>
          <option value="failed">Failed</option>
        </select>
        <div className="ml-auto text-sm text-gray-500">
          {total} transaction{total !== 1 ? 's' : ''}
          {totalPaid > 0 && (
            <span className="ml-2 font-semibold text-green-700">
              · {fmt(totalPaid)} ETB paid
            </span>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-10 bg-gray-50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <div className="py-16 text-center">
            <CreditCard className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="font-semibold text-gray-600">No transactions found</p>
            <p className="text-sm text-gray-400 mt-1">Transactions appear here after payments are initiated.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  {['Employee','Period','Amount (ETB)','Bank · Account','Reference','Status','Date','Initiated By'].map(h => (
                    <th key={h} className="px-4 py-3 font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {transactions.map(tx => {
                  const { cls, Icon } = TX_STYLES[tx.status] || TX_STYLES.pending;
                  return (
                    <tr key={tx.id} className="hover:bg-gray-50/60">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-800">{tx.full_name}</p>
                        <p className="text-xs text-gray-400">{tx.employee_id}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {tx.month ? `${MONTHS[tx.month - 1]} ${tx.year}` : '—'}
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-900">
                        {fmt(tx.amount)}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        <p>{tx.bank_name || tx.bank_code}</p>
                        <p className="text-xs text-gray-400 font-mono">{tx.account_number}</p>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">
                        {tx.tx_ref}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
                          <Icon className="w-3 h-3" />
                          {tx.status}
                        </span>
                        {tx.failure_reason && (
                          <p className="text-xs text-red-500 mt-0.5 max-w-[160px] truncate" title={tx.failure_reason}>
                            {tx.failure_reason}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {tx.initiated_at ? new Date(tx.initiated_at).toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {tx.initiated_by_name || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
