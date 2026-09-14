'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Download, RefreshCw, Search } from 'lucide-react';
import api from '@/utils/api';

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

export default function AdminReportsPage() {
  const now = new Date();
  const router = useRouter();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear]   = useState(now.getFullYear());
  const [search, setSearch] = useState('');

  // Block HR Officer from accessing this page
  useEffect(() => {
    const d = localStorage.getItem('admin_data');
    if (d) {
      const { role } = JSON.parse(d);
      if (role === 'hr_officer') router.replace('/admin');
    }
  }, [router]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin-reports', month, year],
    queryFn: async () => {
      const { data } = await api.get(`/admin/reports?month=${month}&year=${year}`);
      return data.data || data || [];
    },
  });

  const records = Array.isArray(data) ? data : [];

  const filtered = records.filter(r =>
    !search ||
    r.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    r.employee_id?.toLowerCase().includes(search.toLowerCase()) ||
    r.department?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-500">Monthly attendance summary for all employees.</p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isLoading}
          className="btn-secondary flex items-center gap-1.5 text-sm py-2 px-3"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-col sm:flex-row gap-3">
        <select
          value={month}
          onChange={e => setMonth(Number(e.target.value))}
          className="input py-2 w-auto"
        >
          {MONTHS.map((m, i) => (
            <option key={i + 1} value={i + 1}>{m}</option>
          ))}
        </select>
        <select
          value={year}
          onChange={e => setYear(Number(e.target.value))}
          className="input py-2 w-auto"
        >
          {[now.getFullYear() - 1, now.getFullYear()].map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <div className="relative flex-1 max-w-xs">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search employee..."
            className="input pl-9"
          />
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 bg-gray-50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : !filtered.length ? (
          <div className="py-16 text-center">
            <p className="text-4xl mb-3">📊</p>
            <p className="font-semibold text-gray-700">No report data for {MONTHS[month - 1]} {year}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                <tr>
                  {['Employee', 'Department', 'Working Days', 'Present', 'Absent', 'Late', 'Leave', 'Attendance %'].map(h => (
                    <th key={h} className="px-5 py-3 font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(row => {
                  const pct = row.working_days > 0
                    ? Math.round((row.present_days / row.working_days) * 100)
                    : 0;
                  return (
                    <tr key={row.employee_id} className="hover:bg-gray-50/60">
                      <td className="px-5 py-3">
                        <p className="font-semibold text-gray-800">{row.full_name}</p>
                        <p className="text-xs text-gray-400">{row.employee_id}</p>
                      </td>
                      <td className="px-5 py-3 text-gray-600">{row.department || '—'}</td>
                      <td className="px-5 py-3 text-gray-600">{row.working_days}</td>
                      <td className="px-5 py-3 text-cyan-700 font-semibold">{row.present_days}</td>
                      <td className="px-5 py-3 text-red-600 font-semibold">{row.absent_days}</td>
                      <td className="px-5 py-3 text-amber-600 font-semibold">{row.late_days ?? '—'}</td>
                      <td className="px-5 py-3 text-blue-600 font-semibold">{row.leave_days ?? '—'}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-100 rounded-full h-1.5 w-16">
                            <div
                              className={`h-1.5 rounded-full ${pct >= 75 ? 'bg-cyan-500' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs font-semibold text-gray-600">{pct}%</span>
                        </div>
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

