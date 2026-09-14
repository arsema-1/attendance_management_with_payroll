'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Search, CheckCircle, XCircle, Filter } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/utils/api';

const LEAVE_LABELS = {
  casual: '🌤 Casual', sick: '🤒 Sick', paid: '🌴 Paid', other: '📋 Other',
};

const STATUS_FILTERS = ['all', 'pending', 'approved', 'rejected', 'canceled'];

export default function AdminLeavePage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('pending');
  const [search, setSearch] = useState('');
  const [rejectNote, setRejectNote] = useState({});
  const [showReject, setShowReject] = useState(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ['admin-leaves', status],
    queryFn: async () => {
      const url = status === 'all' ? '/admin/leave' : `/admin/leave?status=${status}`;
      const { data } = await api.get(url);
      return data.data || [];
    },
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id, action, comment }) =>
      api.patch(`/admin/leave/${id}/review`, { action, comment }),
    onSuccess: (_, vars) => {
      toast.success(`Leave ${vars.action === 'approve' ? 'approved' : 'rejected'}.`);
      qc.invalidateQueries({ queryKey: ['admin-leaves'] });
      qc.invalidateQueries({ queryKey: ['admin-dashboard'] });
      setShowReject(null);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Action failed.'),
  });

  const filtered = data.filter(r =>
    !search ||
    r.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    r.employee_id?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-2xl font-extrabold text-gray-900">Leave Management</h1>
        <p className="text-sm text-gray-500">Review and manage employee leave requests.</p>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or ID..."
            className="input pl-9"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {STATUS_FILTERS.map(s => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold capitalize transition ${
                status === s
                  ? 'bg-brand-primary text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : !filtered.length ? (
          <div className="py-16 text-center">
            <p className="text-3xl mb-2">📋</p>
            <p className="font-semibold text-gray-700">No leave requests found</p>
            <p className="text-sm text-gray-400 mt-1">
              {status !== 'all' ? `No ${status} requests at the moment.` : 'No requests match your search.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map(req => (
              <div key={req.id} className="px-6 py-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-gray-800">{req.full_name}</p>
                    <p className="text-xs text-gray-400">{req.employee_id} · {req.department}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 bg-brand-light text-brand-primary text-xs font-semibold rounded-full">
                      {LEAVE_LABELS[req.leave_type] || req.leave_type}
                    </span>
                    <span className={
                      req.status === 'approved' ? 'badge-approved' :
                      req.status === 'rejected' ? 'badge-rejected' :
                      req.status === 'canceled' ? 'badge-absent' :
                      'badge-pending'
                    }>
                      {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 mt-3 text-sm">
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">From</p>
                    <p className="font-semibold text-gray-700">{format(new Date(req.from_date), 'dd MMM yyyy')}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">To</p>
                    <p className="font-semibold text-gray-700">{format(new Date(req.to_date), 'dd MMM yyyy')}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Days</p>
                    <p className="font-semibold text-gray-700">{req.days_requested}</p>
                  </div>
                </div>

                <p className="text-sm text-gray-600 mt-2">
                  <span className="text-gray-400">Reason: </span>{req.reason}
                </p>

                {req.admin_comment && (
                  <p className="text-sm text-gray-500 mt-1 italic">
                    <span className="text-gray-400">Note: </span>"{req.admin_comment}"
                  </p>
                )}

                {req.status === 'pending' && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => reviewMutation.mutate({ id: req.id, action: 'approve', comment: 'Approved' })}
                      disabled={reviewMutation.isPending}
                      className="flex items-center gap-1.5 px-4 py-2 bg-cyan-500 hover:bg-cyan-600
                                 text-white text-sm font-semibold rounded-xl transition disabled:opacity-50"
                    >
                      <CheckCircle className="w-4 h-4" /> Approve
                    </button>
                    <button
                      onClick={() => setShowReject(showReject === req.id ? null : req.id)}
                      className="flex items-center gap-1.5 px-4 py-2 bg-red-50 hover:bg-red-100
                                 text-red-600 text-sm font-semibold rounded-xl transition"
                    >
                      <XCircle className="w-4 h-4" /> Reject
                    </button>
                  </div>
                )}

                {showReject === req.id && (
                  <div className="flex gap-2 mt-2 animate-fade-in">
                    <input
                      className="input flex-1 text-sm"
                      placeholder="Rejection reason (required)..."
                      value={rejectNote[req.id] || ''}
                      onChange={e => setRejectNote(n => ({ ...n, [req.id]: e.target.value }))}
                    />
                    <button
                      onClick={() => {
                        if (!rejectNote[req.id]?.trim()) return toast.error('Reason required.');
                        reviewMutation.mutate({ id: req.id, action: 'reject', comment: rejectNote[req.id] });
                      }}
                      className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm
                                 font-semibold rounded-xl transition"
                    >
                      Confirm
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

