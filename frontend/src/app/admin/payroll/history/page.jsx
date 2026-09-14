'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Eye } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import api from '@/utils/api';
import PayslipModal from '../PayslipModal';

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const STATUS_STYLES = {
  draft:     'bg-yellow-100 text-yellow-700',
  processed: 'bg-blue-100  text-blue-700',
  paid:      'bg-green-100 text-green-700',
};

function fmt(n) {
  return `₹${parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0 })}`;
}

export default function PayrollHistoryPage() {
  const now  = new Date();
  const pathname = usePathname();
  const basePath = pathname.startsWith('/hr') ? '/hr' : '/admin';
  const [year,   setYear]   = useState(now.getFullYear());
  const [search, setSearch] = useState('');
  const [slipId, setSlipId] = useState(null);

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['payroll-history', year, search],
    queryFn: async () => {
      const params = new URLSearchParams({ year });
      if (search) params.set('employee_id', search);
      const { data } = await api.get(`/payroll/history?${params}`);
      return data.data || [];
    },
  });

  // Group by year → month
  const grouped = records.reduce((acc, r) => {
    const key = `${r.year}-${String(r.month).padStart(2,'0')}`;
    if (!acc[key]) acc[key] = { year: r.year, month: r.month, records: [] };
    acc[key].records.push(r);
    return acc;
  }, {});
  const groups = Object.values(grouped).sort((a, b) =>
    b.year !== a.year ? b.year - a.year : b.month - a.month
  );

  return (
    <div className="space-y-5 animate-fade-in">
      {slipId && <PayslipModal payrollId={slipId} onClose={() => setSlipId(null)} />}

      <div className="flex items-center gap-3">
        <Link href={`${basePath}/payroll`}
          className="p-2 hover:bg-gray-100 rounded-xl transition text-gray-500">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Payroll History</h1>
          <p className="text-sm text-gray-500">All previously processed payroll records.</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3">
        <select value={year} onChange={e => setYear(Number(e.target.value))} className="input py-2 w-auto">
          {[now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear()].map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Filter by employee ID..." className="input py-2 w-52" />
      </div>

      {isLoading ? (
        <div className="card p-6 space-y-3">
          {[...Array(6)].map((_, i) => <div key={i} className="h-10 bg-gray-50 rounded-xl animate-pulse" />)}
        </div>
      ) : !groups.length ? (
        <div className="card py-16 text-center">
          <p className="text-4xl mb-3">🗂️</p>
          <p className="font-semibold text-gray-600">No payroll history for {year}</p>
        </div>
      ) : (
        groups.map(group => (
          <div key={`${group.year}-${group.month}`} className="card p-0 overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
              <p className="font-bold text-gray-800">
                {MONTHS[group.month - 1]} {group.year}
              </p>
              <p className="text-xs text-gray-400">{group.records.length} employees</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm text-left">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <tr>
                    {['Employee','Department','Gross','Net Salary','Status',''].map(h => (
                      <th key={h} className="px-5 py-2.5 font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {group.records.map(r => (
                    <tr key={r.id} className="hover:bg-gray-50/60">
                      <td className="px-5 py-3">
                        <p className="font-semibold text-gray-800">{r.full_name}</p>
                        <p className="text-xs text-gray-400">{r.employee_id}</p>
                      </td>
                      <td className="px-5 py-3 text-gray-500">{r.department || '—'}</td>
                      <td className="px-5 py-3 text-gray-600">{fmt(r.gross_salary)}</td>
                      <td className="px-5 py-3 font-bold text-gray-900">{fmt(r.net_salary)}</td>
                      <td className="px-5 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize
                          ${STATUS_STYLES[r.status] || 'bg-gray-100 text-gray-600'}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <button onClick={() => setSlipId(r.id)}
                          className="p-1.5 rounded-lg hover:bg-cyan-50 text-cyan-600" title="View payslip">
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
