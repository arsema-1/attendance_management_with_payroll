'use client';

import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { RefreshCw, UserPlus } from 'lucide-react';
import Link from 'next/link';
import api from '@/utils/api';
import DashboardStats from '@/components/DashboardStats';
import { AttendanceTrendChart, DepartmentChart } from '@/components/AttendanceChart';
import TodayAttendanceTable from '@/components/admin/TodayAttendanceTable';
import PendingLeavePanel from '@/components/admin/PendingLeavePanel';

export default function HRDashboard() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['hr-dashboard'],
    queryFn: async () => {
      const { data } = await api.get('/admin/dashboard');
      return data.data;
    },
    refetchInterval: 60_000,
  });

  const summary   = data?.summary;
  const trend     = data?.attendance_trend  || [];
  const deptStats = data?.department_stats  || [];
  const todayRecs = data?.today_records     || [];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {format(new Date(), 'EEEE, dd MMMM yyyy')} · Live attendance overview
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => refetch()} disabled={isFetching}
            className="flex items-center gap-1.5 btn-secondary text-sm py-2 px-3">
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <Link href="/hr/employees/add" className="btn-primary text-sm py-2 px-3 flex items-center gap-1.5">
            <UserPlus className="w-3.5 h-3.5" /> Add Employee
          </Link>
        </div>
      </div>

      <DashboardStats summary={summary} loading={isLoading} />

      {summary?.pending_leaves > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3.5
                        flex items-center justify-between">
          <p className="text-amber-800 text-sm font-medium">
            🔔 <strong>{summary.pending_leaves}</strong> leave request{summary.pending_leaves > 1 ? 's' : ''} awaiting review
          </p>
          <Link href="/hr/leave" className="text-amber-700 text-xs font-bold underline">
            Review now →
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2">
          <AttendanceTrendChart data={trend} loading={isLoading} />
        </div>
        <DepartmentChart data={deptStats} loading={isLoading} />
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-800">Today's Attendance</h2>
        </div>
        <TodayAttendanceTable records={todayRecs} loading={isLoading} />
      </div>

      <PendingLeavePanel />
    </div>
  );
}
