'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, subDays } from 'date-fns';
import { Search, RefreshCw } from 'lucide-react';
import api from '@/utils/api';

export default function AdminAttendancePage() {
  const today = format(new Date(), 'yyyy-MM-dd');
  const [date, setDate] = useState(today);
  const [search, setSearch] = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin-attendance', date],
    queryFn: async () => {
      const { data } = await api.get(`/admin/dashboard`);
      // Use today_records from dashboard for today, otherwise reports endpoint
      if (date === today) return data.data?.today_records || [];
      const rep = await api.get(`/admin/reports?from=${date}&to=${date}`);
      return rep.data?.data || [];
    },
    refetchInterval: date === today ? 30_000 : false,
  });

  const records = Array.isArray(data) ? data : [];

  const filtered = records.filter(r =>
    !search ||
    r.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    r.employee_id?.toLowerCase().includes(search.toLowerCase()) ||
    r.department?.toLowerCase().includes(search.toLowerCase())
  );

  function statusBadge(r) {
    if (!r.check_in_time) {
      if (r.status === 'leave') return <span className="badge-leave">On Leave</span>;
      return <span className="badge-absent">Absent</span>;
    }
    if (r.is_late)         return <span className="badge-late">Late</span>;
    if (!r.check_out_time) return <span className="badge-present">In Office</span>;
    return                        <span className="badge-present">Complete</span>;
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Attendance</h1>
          <p className="text-sm text-gray-500">Daily attendance overview for all employees.</p>
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
        <input
          type="date"
          value={date}
          max={today}
          onChange={e => setDate(e.target.value)}
          className="input w-auto py-2"
        />
        <div className="relative flex-1 max-w-xs">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, ID, department..."
            className="input pl-9"
          />
        </div>
        {/* Quick date shortcuts */}
        <div className="flex gap-2">
          {[
            { label: 'Today',     val: today },
            { label: 'Yesterday', val: format(subDays(new Date(), 1), 'yyyy-MM-dd') },
          ].map(d => (
            <button
              key={d.label}
              onClick={() => setDate(d.val)}
              className={`px-3 py-2 rounded-xl text-sm font-semibold transition ${
                date === d.val
                  ? 'bg-brand-primary text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats row */}
      {!isLoading && records.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Present',  count: records.filter(r => r.check_in_time && !r.is_late).length, cls: 'bg-cyan-50 border-cyan-100', textCls: 'text-cyan-700', subCls: 'text-cyan-600' },
            { label: 'Late',     count: records.filter(r => r.is_late).length,                     cls: 'bg-amber-50 border-amber-100', textCls: 'text-amber-700', subCls: 'text-amber-600' },
            { label: 'Absent',   count: records.filter(r => !r.check_in_time && r.status !== 'leave').length, cls: 'bg-red-50 border-red-100', textCls: 'text-red-700', subCls: 'text-red-600' },
            { label: 'On Leave', count: records.filter(r => r.status === 'leave').length,           cls: 'bg-blue-50 border-blue-100', textCls: 'text-blue-700', subCls: 'text-blue-600' },
          ].map(s => (
            <div key={s.label} className={`rounded-2xl border p-4 ${s.cls}`}>
              <p className={`text-2xl font-extrabold ${s.textCls}`}>{s.count}</p>
              <p className={`text-xs font-semibold ${s.subCls} mt-0.5`}>{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-10 bg-gray-50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : !filtered.length ? (
          <div className="py-16 text-center">
            <p className="text-4xl mb-3">📅</p>
            <p className="font-semibold text-gray-700">No records for {format(new Date(date), 'dd MMMM yyyy')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                <tr>
                  {['Employee', 'Department', 'Check-In', 'Check-Out', 'Hours', 'Method', 'Status'].map(h => (
                    <th key={h} className="px-5 py-3 font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(r => (
                  <tr key={r.employee_id} className="hover:bg-gray-50/60">
                    <td className="px-5 py-3">
                      <p className="font-semibold text-gray-800">{r.full_name}</p>
                      <p className="text-xs text-gray-400">{r.employee_id}</p>
                    </td>
                    <td className="px-5 py-3 text-gray-600">{r.department || '—'}</td>
                    <td className="px-5 py-3 text-gray-700">
                      {r.check_in_time ? format(new Date(r.check_in_time), 'hh:mm a') : '—'}
                    </td>
                    <td className="px-5 py-3 text-gray-700">
                      {r.check_out_time ? format(new Date(r.check_out_time), 'hh:mm a') : '—'}
                    </td>
                    <td className="px-5 py-3 text-gray-600">
                      {r.working_minutes
                        ? `${Math.floor(r.working_minutes / 60)}h ${r.working_minutes % 60}m`
                        : '—'}
                    </td>
                    <td className="px-5 py-3 text-gray-500 capitalize">{r.method || '—'}</td>
                    <td className="px-5 py-3">{statusBadge(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
