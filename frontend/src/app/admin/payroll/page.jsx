'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle, XCircle, Clock, Eye, ChevronDown, ChevronRight,
  AlertCircle, Send, RefreshCw, Banknote, Download, Search, History,
  CreditCard, Info, Users, FileText, FileDown, RotateCcw,
} from 'lucide-react';
import api from '@/utils/api';
import toast from 'react-hot-toast';
import PayslipModal from './PayslipModal';
import BankInfoModal from '@/components/shared/BankInfoModal';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function fmt(n) {
  return `${parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0 })}`;
}

/* ─── Approval Request Card ──────────────────────────────── */
function ApprovalRequestCard({ request, onApprove, onReject, onOpenSlip }) {
  const [expanded, setExpanded] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);

  const handleReject = () => {
    onReject(request, rejectReason);
    setRejectReason('');
    setShowRejectForm(false);
  };

  return (
    <div className="card border border-amber-200 bg-amber-50/30 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-amber-100">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">
                {MONTHS[request.month - 1]} {request.year} Payroll
              </h3>
              <p className="text-sm text-gray-500">
                Submitted by <span className="font-semibold text-gray-700">{request.submitted_by}</span>
                {request.submitted_by_email && (
                  <span className="text-gray-400"> ({request.submitted_by_email})</span>
                )}
              </p>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-xs text-gray-400">Total Net</p>
            <p className="text-lg font-extrabold text-amber-700">{fmt(request.total_net)} ETB</p>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            {request.count} employee(s)
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            {new Date(request.submitted_at).toLocaleString()}
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="p-4 bg-white border-b border-gray-100">
        <div className="flex gap-2">
          <button
            onClick={() => onApprove(request)}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 transition text-sm"
          >
            <CheckCircle className="w-4 h-4" />
            Approve All
          </button>
          <button
            onClick={() => setShowRejectForm(!showRejectForm)}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-50 text-red-600 border border-red-200 rounded-xl font-semibold hover:bg-red-100 transition text-sm"
          >
            <XCircle className="w-4 h-4" />
            Reject
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center justify-center gap-1 px-3 py-2.5 text-gray-500 hover:bg-gray-100 rounded-xl transition text-sm"
          >
            <Eye className="w-4 h-4" />
            Details
          </button>
        </div>

        {/* Reject Reason Form */}
        {showRejectForm && (
          <div className="mt-3 p-3 bg-red-50 rounded-xl border border-red-200">
            <label className="text-xs font-semibold text-red-700 block mb-1">Rejection Reason (optional)</label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Enter reason for rejection..."
              className="w-full px-3 py-2 text-sm border border-red-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-300"
              rows={2}
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleReject}
                className="px-4 py-1.5 bg-red-600 text-white text-sm rounded-lg font-semibold hover:bg-red-700"
              >
                Confirm Reject
              </button>
              <button
                onClick={() => { setShowRejectForm(false); setRejectReason(''); }}
                className="px-4 py-1.5 text-gray-500 text-sm rounded-lg hover:bg-gray-100"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="p-4 bg-gray-50">
          <h4 className="text-xs font-semibold text-gray-500 uppercase mb-3">Payroll Records</h4>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">Employee</th>
                  <th className="px-3 py-2 text-left">Department</th>
                  <th className="px-3 py-2 text-right">Basic</th>
                  <th className="px-3 py-2 text-right">OT Bonus</th>
                  <th className="px-3 py-2 text-right">Deductions</th>
                  <th className="px-3 py-2 text-right">Net Salary</th>
                  <th className="px-3 py-2 text-left">Bank</th>
                  <th className="px-3 py-2 text-center">Payslip</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {request.records.map((rec) => (
                  <tr key={rec.id} className="hover:bg-white">
                    <td className="px-3 py-2">
                      <p className="font-semibold text-gray-800">{rec.full_name}</p>
                      <p className="text-xs text-gray-400">{rec.employee_id}</p>
                    </td>
                    <td className="px-3 py-2 text-gray-500">{rec.department || '—'}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{fmt(rec.base_salary)}</td>
                    <td className="px-3 py-2 text-right text-green-600">+{fmt(rec.overtime_bonus)}</td>
                    <td className="px-3 py-2 text-right text-red-500">
                      -{fmt(parseFloat(rec.late_deduction || 0) + parseFloat(rec.other_deductions || 0))}
                    </td>
                    <td className="px-3 py-2 text-right font-bold text-gray-900">{fmt(rec.net_salary)}</td>
                    <td className="px-3 py-2">
                      {rec.bank_code ? (
                        <div className="text-xs">
                          <p className="text-gray-700">{rec.bank_name || rec.bank_code}</p>
                          <p className="text-gray-400">{rec.account_number}</p>
                        </div>
                      ) : (
                        <span className="text-xs text-red-500">No bank info</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => onOpenSlip(rec.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold
                                     text-cyan-700 bg-cyan-50 border border-cyan-200 rounded-lg
                                     hover:bg-cyan-100 transition"
                        title="View payslip"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Pending Payment Card ───────────────────────────────── */
function PendingPaymentCard({ rec, onTransfer, onOpenSlip }) {
  const isFailed = rec.status === 'failed';
  const isPendingAdminApproval = rec.status === 'pending_admin_approval';
  const isTransferInitiated = rec.payment_initiated_at != null;
  const hasBankInfo = rec.account_number && rec.bank_code;

  return (
    <div className={`card overflow-hidden border ${isFailed ? 'border-red-200 bg-red-50/30' : 'border-purple-200 bg-purple-50/30'}`}>
      {/* Header */}
      <div className={`p-4 border-b ${isFailed ? 'border-red-100' : 'border-purple-100'}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${isFailed ? 'bg-red-100' : 'bg-purple-100'}`}>
              <Banknote className={`w-5 h-5 ${isFailed ? 'text-red-600' : 'text-purple-600'}`} />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">{rec.full_name}</h3>
              <p className="text-sm text-gray-500">{rec.employee_id} · {rec.department || 'No department'}</p>
              {isFailed && (
                <span className="inline-flex items-center gap-1 text-xs text-red-600 font-semibold mt-0.5">
                  <AlertCircle className="w-3 h-3" /> Previous transfer failed — retry available
                </span>
              )}
              {isPendingAdminApproval && !isFailed && !isTransferInitiated && (
                <span className="inline-flex items-center gap-1 text-xs text-purple-600 font-semibold mt-0.5">
                  <Clock className="w-3 h-3" /> Ready for transfer
                </span>
              )}
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-xs text-gray-400">Transfer Amount</p>
            <p className={`text-lg font-extrabold ${isFailed ? 'text-red-700' : 'text-purple-700'}`}>{fmt(rec.net_salary)} ETB</p>
          </div>
        </div>
        {hasBankInfo && (
          <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <CreditCard className="w-3.5 h-3.5" />
              {rec.bank_name || rec.bank_code} · ****{String(rec.account_number).slice(-4)}
            </span>
          </div>
        )}
      </div>

      {/* Single Action Button */}
      <div className="p-4 bg-white border-b border-gray-100">
        <div className="flex gap-2">
          {isFailed ? (
            <button
              onClick={() => onTransfer(rec)}
              disabled={!hasBankInfo}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-white rounded-xl font-semibold transition text-sm disabled:opacity-50 disabled:cursor-not-allowed bg-orange-500 hover:bg-orange-600`}
            >
              <RotateCcw className="w-4 h-4" />
              Retry Transfer
            </button>
          ) : isTransferInitiated ? (
            <button
              onClick={() => onTransfer(rec)}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 transition text-sm">
              <CheckCircle className="w-4 h-4" />
              Complete Transfer
            </button>
          ) : (
            <button
              onClick={() => onTransfer(rec)}
              disabled={!hasBankInfo}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-white rounded-xl font-semibold transition text-sm disabled:opacity-50 disabled:cursor-not-allowed bg-purple-600 hover:bg-purple-700`}
            >
              <Send className="w-4 h-4" />
              Transfer Salary
            </button>
          )}
          <button
            onClick={() => onOpenSlip(rec.id)}
            className="flex items-center justify-center gap-1 px-3 py-2.5 text-gray-500 hover:bg-gray-100 rounded-xl transition text-sm">
            <Eye className="w-4 h-4" />
            View Slip
          </button>
        </div>
        {!hasBankInfo && (
          <p className="mt-2 text-xs text-red-500">No bank account info — cannot transfer.</p>
        )}
      </div>
    </div>
  );
}

/* ─── Main Admin Payroll Page ────────────────────────────── */
export default function AdminPayrollPage() {
  const now = new Date();
  const pathname = usePathname();
  const basePath = pathname.startsWith('/hr') ? '/hr' : '/admin';

  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [slipId, setSlipId] = useState(null);
  const [activeTab, setActiveTab] = useState('pending'); // 'pending' | 'history'
  const qc = useQueryClient();

  const [adminData, setAdminData] = useState(null);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const d = localStorage.getItem('admin_data');
      if (d) setAdminData(JSON.parse(d));
    }
  }, []);

  const adminRole = adminData?.role || '';
  const isHrOfficer = adminRole === 'hr_officer';
  const isHrAdmin   = adminRole === 'hr_admin';
  const isSuperAdmin = adminRole === 'super_admin';
  const isAdmin = isHrAdmin || isSuperAdmin;

  // Fetch pending approval requests (admin only)
  const { data: pendingRequests = [], isLoading: pendingLoading } = useQuery({
    queryKey: ['payroll-pending-approvals', month, year],
    queryFn: async () => {
      const params = new URLSearchParams({ month, year });
      const { data } = await api.get(`/payroll/pending-approvals?${params}`);
      return data.data || [];
    },
    enabled: isAdmin,
  });

  // Fetch pending payment records (admin only) - pending_admin_approval AND failed
  const { data: pendingPaymentRecords = [], isLoading: pendingPaymentLoading } = useQuery({
    queryKey: ['payroll-pending-payment', month, year],
    queryFn: async () => {
      const [pending, failed] = await Promise.all([
        api.get(`/payroll/list?${new URLSearchParams({ month, year, status: 'pending_admin_approval' })}`),
        api.get(`/payroll/list?${new URLSearchParams({ month, year, status: 'failed' })}`),
      ]);
      return [...(pending.data.data || []), ...(failed.data.data || [])];
    },
    enabled: isAdmin,
  });

  // Fetch payroll list for HR view
  const { data: records = [], isLoading: listLoading } = useQuery({
    queryKey: ['payroll-list', month, year],
    queryFn: async () => {
      const params = new URLSearchParams({ month, year });
      const { data } = await api.get(`/payroll/list?${params}`);
      return data.data || [];
    },
    enabled: isHrOfficer,
  });

  const { data: summary } = useQuery({
    queryKey: ['payroll-summary', month, year],
    queryFn: async () => {
      const { data } = await api.get(`/payroll/summary?month=${month}&year=${year}`);
      return data.data || {};
    },
  });

  const generate = useMutation({
    mutationFn: () => api.post('/payroll/generate', { month, year }),
    onSuccess: (res) => {
      toast.success(res.data.message);
      qc.invalidateQueries(['payroll-list']);
      qc.invalidateQueries(['payroll-summary']);
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to generate payroll'),
  });

  // Submit for approval (HR only)
  const submitForApproval = useMutation({
    mutationFn: () => api.post('/payroll/submit-for-approval', { month, year }),
    onSuccess: (res) => {
      toast.success(res.data.message);
      qc.invalidateQueries(['payroll-list']);
      qc.invalidateQueries(['payroll-summary']);
      qc.invalidateQueries(['payroll-pending-approvals']);
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to submit for approval'),
  });

  // Approve a request
  const approveMutation = useMutation({
    mutationFn: async (request) => {
      // Approve all records in the bulk request
      if (request.bulk_request_id) {
        return api.post('/payroll/bulk-approve', { bulk_request_id: request.bulk_request_id });
      } else {
        // Single record approval
        const results = await Promise.all(
          request.records.map(rec => api.post(`/payroll/${rec.id}/approve`))
        );
        return results[results.length - 1];
      }
    },
    onSuccess: () => {
      toast.success('Payroll approved successfully!');
      qc.invalidateQueries(['payroll-pending-approvals']);
      qc.invalidateQueries(['payroll-summary']);
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to approve'),
  });

  // Reject a request
  const rejectMutation = useMutation({
    mutationFn: async ({ request, reason }) => {
      if (request.bulk_request_id) {
        return api.post('/payroll/bulk-reject', { bulk_request_id: request.bulk_request_id, reason });
      } else {
        const results = await Promise.all(
          request.records.map(rec => api.post(`/payroll/${rec.id}/reject`, { reason }))
        );
        return results[results.length - 1];
      }
    },
    onSuccess: () => {
      toast.success('Payroll rejected.');
      qc.invalidateQueries(['payroll-pending-approvals']);
      qc.invalidateQueries(['payroll-summary']);
      qc.invalidateQueries(['payroll-pending-payment']);
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to reject'),
  });

  // Single-step transfer: initiate + verify (+ finalize if needed) in sequence
  const transferMutation = useMutation({
    mutationFn: async (payrollId) => {
      // Step 1: initiate via Chapa
      const initRes = await api.post(`/payments/${payrollId}/initiate`);
      const { tx_ref } = initRes.data.data;
      // Step 2: verify the transfer (this also sets payroll status to paid/failed)
      const verifyRes = await api.post(`/payments/${payrollId}/verify`, { tx_ref });
      // Step 3: if verify succeeded and payroll is now 'paid', skip finalize (already done).
      // If verify left status as 'pending_payment' (unknown Chapa status), finalize it.
      if (verifyRes.data.data?.payroll_status === 'pending_payment') {
        return api.post(`/payments/${payrollId}/finalize`);
      }
      return verifyRes;
    },
    onSuccess: () => {
      toast.success('Salary transferred successfully!');
      qc.invalidateQueries(['payroll-pending-payment']);
      qc.invalidateQueries(['payroll-summary']);
      qc.invalidateQueries(['payroll-list']);
    },
    onError: (e) => {
      const msg = e.response?.data?.message || 'Transfer failed.';
      toast.error(msg);
      qc.invalidateQueries(['payroll-pending-payment']);
    },
  });

  const handleTransfer = (rec) => {
    const action = rec.status === 'failed' ? 'retry' : 'transfer';
    const label = rec.status === 'failed'
      ? `Retry transfer of ${fmt(rec.net_salary)} ETB to ${rec.account_name || rec.full_name}?`
      : `Transfer ${fmt(rec.net_salary)} ETB to ${rec.account_name || rec.full_name}? This will initiate the bank transfer and mark the salary as paid.`;
    if (window.confirm(label)) {
      transferMutation.mutate(rec.id);
    }
  };

  const handleApprove = (request) => {
    if (window.confirm(`Approve ${request.count} payroll record(s) for ${MONTHS[request.month - 1]} ${request.year}?`)) {
      approveMutation.mutate(request);
    }
  };

  const handleReject = (request, reason) => {
    rejectMutation.mutate({ request, reason });
  };

  const allDraft = records.length > 0 && records.every(r => r.status === 'draft');
  const hasFinalizedForApproval = records.some(r => r.status === 'finalized' && !r.approval_status);

  function handleExport(f) {
    const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
    const token = localStorage.getItem('admin_token') || localStorage.getItem('hr_token');
    window.open(`${base}/payroll/export?month=${month}&year=${year}&format=${f}&token=${token}`, '_blank');
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {slipId && <PayslipModal payrollId={slipId} onClose={() => setSlipId(null)} />}

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">
            {isAdmin ? 'Payroll Approvals' : 'Payroll'}
          </h1>
          <p className="text-sm text-gray-500">
            {isAdmin
              ? 'Review and approve payroll submissions from HR.'
              : 'Generate and manage monthly employee salaries.'}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href={`${basePath}/payroll/history`}
            className="btn-secondary flex items-center gap-1.5 text-sm py-2 px-3">
            <History className="w-4 h-4" /> History
          </Link>
          {!isHrOfficer && (
            <Link href={`${basePath}/payroll/transactions`}
              className="btn-secondary flex items-center gap-1.5 text-sm py-2 px-3">
              <CreditCard className="w-4 h-4" /> Transactions
            </Link>
          )}
          {records.length > 0 && (
            <>
              <button onClick={() => handleExport('excel')}
                className="btn-secondary flex items-center gap-1.5 text-sm py-2 px-3">
                <Download className="w-4 h-4" /> Excel
              </button>
              <button onClick={() => handleExport('pdf')}
                className="btn-secondary flex items-center gap-1.5 text-sm py-2 px-3">
                <Download className="w-4 h-4" /> PDF
              </button>
            </>
          )}
        </div>
      </div>

      {/* Controls bar */}
      <div className="card p-4 flex flex-wrap gap-3 items-center">
        <select value={month} onChange={e => setMonth(Number(e.target.value))} className="input py-2 w-auto">
          {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
        </select>
        <select value={year} onChange={e => setYear(Number(e.target.value))} className="input py-2 w-auto">
          {[now.getFullYear() - 1, now.getFullYear()].map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        <div className="flex gap-2 ml-auto flex-wrap">
          {/* HR: Generate payroll */}
          {isHrOfficer && (
            <button onClick={() => generate.mutate()} disabled={generate.isPending}
              className="btn-primary flex items-center gap-1.5 text-sm py-2 px-4">
              {generate.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              {records.length ? 'Recalculate' : 'Generate'}
            </button>
          )}

          {/* HR: Submit for approval */}
          {isHrOfficer && hasFinalizedForApproval && (
            <button onClick={() => submitForApproval.mutate()} disabled={submitForApproval.isPending}
              className="btn-secondary flex items-center gap-1.5 text-sm py-2 px-4 text-amber-700 border-amber-200 hover:bg-amber-50">
              <Send className="w-4 h-4" />
              {submitForApproval.isPending ? 'Submitting...' : 'Request Approval'}
            </button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      {summary && parseInt(summary.total_employees) > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Employees', val: summary.total_employees, color: 'text-gray-700' },
            { label: 'Gross Payroll', val: fmt(summary.total_gross), color: 'text-gray-700' },
            { label: 'Total Deductions', val: fmt(summary.total_deductions), color: 'text-red-500' },
            { label: 'OT Pay', val: fmt(summary.total_overtime), color: 'text-green-600' },
            { label: 'Net Payroll', val: fmt(summary.total_net), color: 'text-brand-primary font-extrabold' },
            { label: 'Paid', val: `${summary.paid_count ?? 0}/${summary.total_employees}`, color: 'text-green-600' },
          ].map(s => (
            <div key={s.label} className="card p-4">
              <p className={`text-lg font-extrabold ${s.color}`}>{s.val}</p>
              <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Admin View: Pending Approval Requests */}
      {isAdmin && (
        <div className="space-y-4">
          {/* Tab navigation */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
            <button
              onClick={() => setActiveTab('pending')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                activeTab === 'pending'
                  ? 'bg-white text-amber-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Pending Approvals ({pendingRequests.length})
            </button>
            <button
              onClick={() => setActiveTab('pending-payment')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                activeTab === 'pending-payment'
                  ? 'bg-white text-purple-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Pending Payment ({pendingPaymentRecords.filter(r => r.status === 'pending_admin_approval').length})
              {pendingPaymentRecords.filter(r => r.status === 'failed').length > 0 && (
                <span className="ml-1 text-red-500">· {pendingPaymentRecords.filter(r => r.status === 'failed').length} failed</span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                activeTab === 'history'
                  ? 'bg-white text-brand-primary shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              All Records
            </button>
          </div>

          {activeTab === 'pending' && (
            <>
              {pendingLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-32 bg-gray-50 rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : pendingRequests.length === 0 ? (
                <div className="card p-12 text-center">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="w-8 h-8 text-green-500" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-800 mb-1">No Pending Approvals</h3>
                  <p className="text-sm text-gray-500 max-w-md mx-auto">
                    All payroll submissions have been reviewed. HR will submit new payroll requests for your approval.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {pendingRequests.map((request, idx) => (
                    <ApprovalRequestCard
                      key={request.bulk_request_id || idx}
                      request={request}
                      onApprove={handleApprove}
                      onReject={handleReject}
                      onOpenSlip={(id) => setSlipId(id)}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {activeTab === 'pending-payment' && (
            <>
              {pendingPaymentLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-24 bg-gray-50 rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : pendingPaymentRecords.length === 0 ? (
                <div className="card p-12 text-center">
                  <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Banknote className="w-8 h-8 text-purple-500" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-800 mb-1">No Pending Payments</h3>
                  <p className="text-sm text-gray-500 max-w-md mx-auto">
                    HR has not submitted any payroll for payment yet. Once approved, HR can initiate payments.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {pendingPaymentRecords.map((rec) => (
                    <PendingPaymentCard
                      key={rec.id}
                      rec={rec}
                      onTransfer={handleTransfer}
                      onOpenSlip={(id) => setSlipId(id)}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {activeTab === 'history' && (
            <PendingApprovalsHistory month={month} year={year} />
          )}
        </div>
      )}

      {/* HR View: Full payroll management */}
      {isHrOfficer && (
        <div className="card p-0 overflow-hidden">
          {listLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-11 bg-gray-50 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : !records.length ? (
            <div className="py-16 text-center">
              <p className="text-4xl mb-3">💰</p>
              <p className="font-semibold text-gray-700">No payroll records for {MONTHS[month-1]} {year}</p>
              <p className="text-sm text-gray-400 mt-1">Click "Generate" to calculate salaries from attendance data.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    {['Employee','Dept','Basic','Present','Absent','Net Salary','Status',''].map(h => (
                      <th key={h} className="px-4 py-3 font-semibold whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {records.map(rec => (
                    <HRPayrollRow key={rec.id} rec={rec} onViewSlip={setSlipId} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── HR Payroll Row (simplified for HR view) ────────────── */
function HRPayrollRow({ rec, onViewSlip }) {
  const [expanded, setExpanded] = useState(false);
  const qc = useQueryClient();

  const approvalBadge = rec.approval_status === 'pending_approval'
    ? <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">Pending Approval</span>
    : rec.approval_status === 'approved'
    ? <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">Approved</span>
    : rec.approval_status === 'rejected'
    ? <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">Rejected</span>
    : null;

  return (
    <>
      <tr className="hover:bg-gray-50/60 transition">
        <td className="px-4 py-3">
          <p className="font-semibold text-gray-800 text-sm">{rec.full_name}</p>
          <p className="text-xs text-gray-400">{rec.employee_id}</p>
        </td>
        <td className="px-4 py-3 text-sm text-gray-500">{rec.department || '—'}</td>
        <td className="px-4 py-3 text-sm text-gray-600">{fmt(rec.base_salary)}</td>
        <td className="px-4 py-3 text-center text-sm text-cyan-700 font-semibold">{rec.present_days}</td>
        <td className="px-4 py-3 text-center text-sm text-red-500 font-semibold">{rec.absent_days}</td>
        <td className="px-4 py-3 text-sm font-bold text-gray-900">{fmt(rec.net_salary)}</td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${
              rec.status === 'draft' ? 'bg-yellow-100 text-yellow-700'
              : rec.status === 'finalized' ? 'bg-blue-100 text-blue-700'
              : rec.status === 'paid' ? 'bg-green-100 text-green-700'
              : 'bg-gray-100 text-gray-600'
            }`}>
              {rec.status}
            </span>
            {approvalBadge}
          </div>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <button onClick={() => onViewSlip(rec.id)}
              className="p-1.5 rounded-lg hover:bg-cyan-50 text-cyan-600" title="View payslip">
              <Eye className="w-4 h-4" />
            </button>
          </div>
        </td>
      </tr>
    </>
  );
}

/* ─── Pending Approvals History (all records with approval status) */
function PendingApprovalsHistory({ month, year }) {
  const { data: records = [], isLoading } = useQuery({
    queryKey: ['payroll-list-history', month, year],
    queryFn: async () => {
      const params = new URLSearchParams({ month, year });
      const { data } = await api.get(`/payroll/list?${params}`);
      return (data.data || []).filter(r => r.approval_status);
    },
  });

  if (isLoading) return (
    <div className="space-y-3">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="h-16 bg-gray-50 rounded-xl animate-pulse" />
      ))}
    </div>
  );

  if (!records.length) return (
    <div className="card p-8 text-center">
      <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
      <p className="text-gray-500 text-sm">No approval history for this period.</p>
    </div>
  );

  return (
    <div className="card p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Employee</th>
              <th className="px-4 py-3">Department</th>
              <th className="px-4 py-3 text-right">Net Salary</th>
              <th className="px-4 py-3">Approval Status</th>
              <th className="px-4 py-3">Submitted By</th>
              <th className="px-4 py-3">Reviewed By</th>
              <th className="px-4 py-3">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {records.map(rec => (
              <tr key={rec.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <p className="font-semibold text-gray-800">{rec.full_name}</p>
                  <p className="text-xs text-gray-400">{rec.employee_id}</p>
                </td>
                <td className="px-4 py-3 text-gray-500">{rec.department || '—'}</td>
                <td className="px-4 py-3 text-right font-bold">{fmt(rec.net_salary)}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                    rec.approval_status === 'pending_approval' ? 'bg-amber-100 text-amber-700'
                    : rec.approval_status === 'approved' ? 'bg-green-100 text-green-700'
                    : rec.approval_status === 'rejected' ? 'bg-red-100 text-red-700'
                    : 'bg-gray-100 text-gray-600'
                  }`}>
                    {rec.approval_status?.replace(/_/g, ' ') || '—'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">{rec.submitted_by_name || '—'}</td>
                <td className="px-4 py-3 text-gray-500">{rec.approved_by_name || '—'}</td>
                <td className="px-4 py-3 text-gray-500 text-xs max-w-32 truncate">{rec.approval_notes || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
