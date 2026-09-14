'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Play, RefreshCw, CheckCircle, Banknote, Download,
  Search, Eye, Plus, Trash2, ChevronDown, History,
  Send, RotateCcw, AlertCircle, Clock,
  CreditCard, Building2, Info, FileText,
} from 'lucide-react';
import api from '@/utils/api';
import toast from 'react-hot-toast';
import PayslipModal from '@/app/admin/payroll/PayslipModal';
import BankInfoModal from '@/components/shared/BankInfoModal';
import Link from 'next/link';

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const STATUS_STYLES = {
  draft:           'bg-yellow-100 text-yellow-700',
  finalized:       'bg-blue-100   text-blue-700',
  pending_payment:       'bg-purple-100 text-purple-700',
  pending_admin_approval: 'bg-purple-100 text-purple-700',
  paid:            'bg-green-100  text-green-700',
  failed:          'bg-red-100    text-red-700',
};

function fmt(n) {
  return `${parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0 })}`;
}

/* ─── Add-item mini form ─────────────────────────────────── */
function AddItemForm({ payrollId, onDone }) {
  const [type,   setType]   = useState('allowance');
  const [label,  setLabel]  = useState('');
  const [amount, setAmount] = useState('');
  const qc = useQueryClient();

  async function submit(e) {
    e.preventDefault();
    if (!label || !amount) return toast.error('Fill all fields.');
    try {
      await api.post(`/payroll/${payrollId}/items`, { type, label, amount: parseFloat(amount) });
      toast.success('Item added.');
      setLabel(''); setAmount('');
      qc.invalidateQueries(['payroll-list']);
      onDone?.();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add item.');
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap gap-2 mt-3 p-3 bg-gray-50 rounded-xl">
      <select value={type} onChange={e => setType(e.target.value)}
        className="input py-1.5 text-xs w-28">
        <option value="allowance">Allowance</option>
        <option value="bonus">Bonus</option>
        <option value="deduction">Deduction</option>
        <option value="tax">Tax</option>
      </select>
      <input value={label} onChange={e => setLabel(e.target.value)}
        placeholder="Label (e.g. HRA)" className="input py-1.5 text-xs flex-1 min-w-24" />
      <input value={amount} onChange={e => setAmount(e.target.value)}
        type="number" min="0" step="0.01" placeholder="Amount"
        className="input py-1.5 text-xs w-28" />
      <button type="submit" className="btn-primary py-1.5 px-3 text-xs flex items-center gap-1">
        <Plus className="w-3 h-3" /> Add
      </button>
    </form>
  );
}

/* ─── Payment Panel (inside expanded row) ───────────────── */
function PaymentPanel({ rec }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [bankModal, setBankModal] = useState(false);

  const hasBankInfo = rec.account_number && rec.bank_code && rec.account_name;

  // Fetch payment status / transactions for this record
  const { data: paymentData, refetch: refetchPayment } = useQuery({
    queryKey: ['payment-status', rec.id],
    queryFn: async () => {
      const { data } = await api.get(`/payments/${rec.id}/status`);
      return data.data;
    },
    enabled: ['pending_admin_approval', 'pending_payment', 'paid', 'failed'].includes(rec.status),
  });

  const latestTx = paymentData?.transactions?.[0];

  async function submitForPayment() {
    if (!hasBankInfo) {
      toast.error('Employee has no bank account info. Add it first.');
      return;
    }
    setBusy(true);
    try {
      await api.patch(`/payments/${rec.id}/submit`);
      toast.success('Submitted for payment.');
      qc.invalidateQueries(['payroll-list']);
      qc.invalidateQueries(['payroll-summary']);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit.');
    } finally { setBusy(false); }
  }

  const TX_STATUS_STYLE = {
    pending:    'bg-yellow-50 text-yellow-700 border-yellow-200',
    successful: 'bg-green-50  text-green-700  border-green-200',
    failed:     'bg-red-50    text-red-600    border-red-200',
  };

  return (
    <div className="border border-gray-200 rounded-xl p-3 space-y-3 bg-white">
      {bankModal && (
        <BankInfoModal employee={rec} onClose={() => setBankModal(false)} />
      )}

      {/* Bank info summary */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
          {hasBankInfo ? (
            <div className="text-xs">
              <p className="font-semibold text-gray-800">{rec.account_name}</p>
              <p className="text-gray-500">{rec.bank_name || rec.bank_code} · {rec.account_number}</p>
            </div>
          ) : (
            <p className="text-xs text-red-500 font-semibold">No bank account on file</p>
          )}
        </div>
        <button onClick={() => setBankModal(true)}
          className="text-xs text-brand-primary hover:underline font-semibold whitespace-nowrap">
          {hasBankInfo ? 'Edit' : '+ Add Bank'}
        </button>
      </div>

      {/* Net amount */}
      <div className="flex justify-between items-center bg-slate-50 rounded-lg px-3 py-2">
        <span className="text-xs text-gray-500">Transfer Amount (ETB)</span>
        <span className="font-extrabold text-gray-900 text-sm">{fmt(rec.net_salary)} ETB</span>
      </div>

      {/* Approval status indicator */}
      {rec.approval_status === 'approved' && rec.status === 'pending_admin_approval' && (
        <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2 border border-green-200">
          <CheckCircle className="w-4 h-4" />
          <span className="font-semibold">Approved by admin — ready for payment initiation</span>
        </div>
      )}
      {rec.approval_status === 'pending_approval' && (
        <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 border border-amber-200">
          <Clock className="w-4 h-4" />
          <span className="font-semibold">Awaiting admin approval</span>
        </div>
      )}

      {/* Latest transaction info */}
      {latestTx && (
        <div className={`rounded-lg border px-3 py-2 text-xs space-y-1 ${TX_STATUS_STYLE[latestTx.status] || TX_STATUS_STYLE.pending}`}>
          <div className="flex justify-between">
            <span className="font-semibold capitalize">Transfer {latestTx.status}</span>
            <span className="font-mono">{latestTx.tx_ref}</span>
          </div>
          {latestTx.failure_reason && (
            <p className="text-red-600 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> {latestTx.failure_reason}
            </p>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        {/* HR: submit finalized → pending_admin_approval (via approval workflow) */}
        {rec.status === 'finalized' && rec.approval_status === null && (
          <button onClick={submitForPayment} disabled={busy}
            className="flex-1 btn-secondary text-xs py-2 text-purple-700 border-purple-200 hover:bg-purple-50 flex items-center justify-center gap-1 disabled:opacity-50">
            <Send className="w-3.5 h-3.5" />
            {busy ? 'Submitting…' : 'Submit for Payment'}
          </button>
        )}

        {/* Show pending admin approval status */}
        {rec.status === 'pending_admin_approval' && (
          <div className="flex-1 flex items-center justify-center gap-1.5 text-xs text-purple-700 font-semibold py-2">
            <Clock className="w-3.5 h-3.5" />
            Pending Admin Approval
          </div>
        )}

        {rec.status === 'paid' && (
          <div className="flex-1 flex items-center justify-center gap-1.5 text-xs text-green-700 font-semibold py-2">
            <CheckCircle className="w-3.5 h-3.5" /> Payment Completed
          </div>
        )}
      </div>

      {/* Info note when pending and no bank info */}
      {rec.status === 'finalized' && !hasBankInfo && (
        <p className="text-xs text-red-500 flex items-center gap-1">
          <Info className="w-3 h-3" /> Add bank account info before submitting for payment.
        </p>
      )}
    </div>
  );
}

/* ─── Expandable row ─────────────────────────────────────── */
function PayrollRow({ rec, onViewSlip }) {
  const [expanded, setExpanded] = useState(false);
  const [showAdd,  setShowAdd]  = useState(false);
  const qc = useQueryClient();

  const deleteItem = async (itemId) => {
    try {
      await api.delete(`/payroll/${rec.id}/items/${itemId}`);
      toast.success('Item removed.');
      qc.invalidateQueries(['payroll-list']);
    } catch { toast.error('Failed to remove item.'); }
  };

  const changeStatus = async (status) => {
    try {
      await api.patch(`/payroll/${rec.id}/status`, { status });
      toast.success(`Marked as ${status}.`);
      qc.invalidateQueries(['payroll-list']);
      qc.invalidateQueries(['payroll-summary']);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed.');
    }
  };

  const allowances = (rec.items || []).filter(i => i.type === 'allowance' || i.type === 'bonus');
  const deductions = (rec.items || []).filter(i => i.type === 'deduction' || i.type === 'tax');
  const isLocked   = rec.status === 'paid' || rec.status === 'pending_payment';

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
        <td className="px-4 py-3 text-sm text-red-400">{fmt(rec.late_deduction)}</td>
        <td className="px-4 py-3 text-sm text-green-600">{fmt(rec.overtime_bonus)}</td>
        <td className="px-4 py-3 text-sm text-gray-500">
          {fmt(rec.other_allowances)} / {fmt(rec.other_deductions)}
        </td>
        <td className="px-4 py-3 text-sm font-bold text-gray-900">{fmt(rec.net_salary)}</td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1 flex-wrap">
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${STATUS_STYLES[rec.status] || 'bg-gray-100 text-gray-600'}`}>
              {rec.status.replace(/_/g, ' ')}
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
            <button onClick={() => setExpanded(v => !v)}
              className={`p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition ${expanded ? 'rotate-180' : ''}`}>
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        </td>
      </tr>

      {expanded && (
        <tr>
          <td colSpan={11} className="px-4 pb-4 bg-slate-50">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">

              {/* Left: Items */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Allowances & Bonuses</p>
                {allowances.length === 0
                  ? <p className="text-xs text-gray-400">None</p>
                  : allowances.map(item => (
                    <div key={item.id} className="flex justify-between items-center text-xs py-1 border-b border-gray-100">
                      <span className="text-gray-700">{item.label} <span className="text-gray-400">({item.type})</span></span>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-green-600">{fmt(item.amount)}</span>
                        {!isLocked && (
                          <button onClick={() => deleteItem(item.id)} className="text-red-400 hover:text-red-600">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                }

                <p className="text-xs font-semibold text-gray-500 uppercase mt-3 mb-2">Deductions & Tax</p>
                {deductions.length === 0
                  ? <p className="text-xs text-gray-400">None</p>
                  : deductions.map(item => (
                    <div key={item.id} className="flex justify-between items-center text-xs py-1 border-b border-gray-100">
                      <span className="text-gray-700">{item.label} <span className="text-gray-400">({item.type})</span></span>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-red-500">{fmt(item.amount)}</span>
                        {!isLocked && (
                          <button onClick={() => deleteItem(item.id)} className="text-red-400 hover:text-red-600">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                }

                {!isLocked && (
                  <>
                    <button onClick={() => setShowAdd(v => !v)}
                      className="mt-2 text-xs text-brand-primary font-semibold flex items-center gap-1 hover:underline">
                      <Plus className="w-3 h-3" /> Add item
                    </button>
                    {showAdd && <AddItemForm payrollId={rec.id} onDone={() => setShowAdd(false)} />}
                  </>
                )}
              </div>

              {/* Right: Salary breakdown + payment actions */}
              <div className="space-y-3">
                {/* Salary summary */}
                <div className="bg-white rounded-xl border border-gray-100 p-3 text-sm space-y-1">
                  <div className="flex justify-between"><span className="text-gray-500">Base Salary</span><span>{fmt(rec.base_salary)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">OT Bonus</span><span className="text-green-600">+ {fmt(rec.overtime_bonus)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Allowances</span><span className="text-green-600">+ {fmt(rec.other_allowances)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Gross</span><span className="font-semibold">{fmt(rec.gross_salary)}</span></div>
                  <hr className="border-gray-100" />
                  <div className="flex justify-between"><span className="text-gray-500">Late Deduction</span><span className="text-red-500">- {fmt(rec.late_deduction)}</span></div>
                  {parseFloat(rec.leave_deduction) > 0 && (
                    <div className="flex justify-between"><span className="text-gray-500">Leave Deduction</span><span className="text-red-500">- {fmt(rec.leave_deduction)}</span></div>
                  )}
                  <div className="flex justify-between"><span className="text-gray-500">Other Deductions</span><span className="text-red-500">- {fmt(rec.other_deductions)}</span></div>
                  <hr className="border-gray-100" />
                  <div className="flex justify-between font-bold text-base">
                    <span>Net Salary</span><span className="text-brand-primary">{fmt(rec.net_salary)}</span>
                  </div>
                </div>

                {/* Draft/finalized workflow */}
                <div className="flex gap-2 flex-wrap">
                  {rec.status === 'draft' && (
                    <button onClick={() => changeStatus('finalized')}
                      className="flex-1 btn-secondary text-xs py-2 text-blue-700 border-blue-200 hover:bg-blue-50 flex items-center justify-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" /> Finalize
                    </button>
                  )}
                  {rec.status === 'finalized' && (
                    <button onClick={() => changeStatus('draft')}
                      className="flex-1 btn-secondary text-xs py-2 text-gray-600 flex items-center justify-center gap-1">
                      Revert to Draft
                    </button>
                  )}
                </div>

                {/* Payment panel */}
                {['finalized', 'pending_admin_approval', 'pending_payment', 'paid', 'failed'].includes(rec.status) && (
                  <PaymentPanel rec={rec} />
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* ─── Main page ──────────────────────────────────────────── */
export default function HRPayrollPage() {
  const now      = new Date();
  const [month,  setMonth]  = useState(now.getMonth() + 1);
  const [year,   setYear]   = useState(now.getFullYear());
  const [search, setSearch] = useState('');
  const [dept,   setDept]   = useState('');
  const [status, setStatus] = useState('');
  const [slipId, setSlipId] = useState(null);
  const qc = useQueryClient();

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['payroll-list', month, year, search, dept, status],
    queryFn: async () => {
      const params = new URLSearchParams({ month, year });
      if (search) params.set('search', search);
      if (dept)   params.set('department', dept);
      if (status) params.set('status', status);
      const { data } = await api.get(`/payroll/list?${params}`);
      return data.data || [];
    },
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

  const bulkStatus = (s) => async () => {
    try {
      const res = await api.patch('/payroll/bulk-status', { month, year, status: s });
      toast.success(res.data.message);
      qc.invalidateQueries(['payroll-list']);
      qc.invalidateQueries(['payroll-summary']);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed.');
    }
  };

  // Submit for admin approval
  const submitForApproval = useMutation({
    mutationFn: () => api.post('/payroll/submit-for-approval', { month, year }),
    onSuccess: (res) => {
      toast.success(res.data.message);
      qc.invalidateQueries(['payroll-list']);
      qc.invalidateQueries(['payroll-summary']);
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to submit for approval'),
  });

  const allDraft     = records.length > 0 && records.every(r => r.status === 'draft');
  const allFinalized = records.length > 0 && records.every(r => r.status === 'finalized');
  const hasFinalizedForApproval = records.some(r => r.status === 'finalized' && !r.approval_status);

  function handleExport(f) {
    const base  = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
    const token = localStorage.getItem('hr_token') || localStorage.getItem('admin_token');
    window.open(`${base}/payroll/export?month=${month}&year=${year}&format=${f}&token=${token}`, '_blank');
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {slipId && <PayslipModal payrollId={slipId} onClose={() => setSlipId(null)} />}

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Payroll</h1>
          <p className="text-sm text-gray-500">Generate and manage monthly employee salaries.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href="/hr/payroll/history"
            className="btn-secondary flex items-center gap-1.5 text-sm py-2 px-3">
            <History className="w-4 h-4" /> History
          </Link>
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
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search employee..." className="input pl-9 py-2 w-48" />
        </div>
        <input value={dept} onChange={e => setDept(e.target.value)}
          placeholder="Department..." className="input py-2 w-36" />
        <select value={status} onChange={e => setStatus(e.target.value)} className="input py-2 w-auto">
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="finalized">Finalized</option>
          <option value="pending_payment">Pending Payment</option>
          <option value="pending_admin_approval">Pending Admin Approval</option>
          <option value="paid">Paid</option>
          <option value="failed">Failed</option>
        </select>

        <div className="flex gap-2 ml-auto flex-wrap">
          <button onClick={() => generate.mutate()} disabled={generate.isPending}
            className="btn-primary flex items-center gap-1.5 text-sm py-2 px-4">
            {generate.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {records.length ? 'Recalculate' : 'Generate'}
          </button>
          {allDraft && (
            <button onClick={bulkStatus('finalized')}
              className="btn-secondary flex items-center gap-1.5 text-sm py-2 px-4 text-blue-700 border-blue-200 hover:bg-blue-50">
              <CheckCircle className="w-4 h-4" /> Finalize All
            </button>
          )}
          {allFinalized && (
            <button onClick={bulkStatus('draft')}
              className="btn-secondary flex items-center gap-1.5 text-sm py-2 px-4 text-gray-600 hover:bg-gray-50">
              <RotateCcw className="w-4 h-4" /> Revert All to Draft
            </button>
          )}
          {/* Request Approval button */}
          {hasFinalizedForApproval && (
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
            { label: 'Employees',        val: summary.total_employees,                                color: 'text-gray-700' },
            { label: 'Gross Payroll',    val: fmt(summary.total_gross),                               color: 'text-gray-700' },
            { label: 'Total Deductions', val: fmt(summary.total_deductions),                          color: 'text-red-500'  },
            { label: 'OT Pay',           val: fmt(summary.total_overtime),                            color: 'text-green-600'},
            { label: 'Net Payroll',      val: fmt(summary.total_net),                                 color: 'text-brand-primary font-extrabold' },
            { label: 'Paid',             val: `${summary.paid_count ?? 0}/${summary.total_employees}`,color: 'text-green-600' },
          ].map(s => (
            <div key={s.label} className="card p-4">
              <p className={`text-lg font-extrabold ${s.color}`}>{s.val}</p>
              <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Info banner about approval */}
      {hasFinalizedForApproval && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
          <Info className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Ready for Approval</p>
            <p className="text-xs text-amber-600">
              You have finalized payroll records ready to submit for admin approval.
              Click "Request Approval" to send them to the admin for review.
            </p>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {isLoading ? (
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
                  {['Employee','Dept','Basic','Present','Absent','Late Ded.','OT Bonus','Allow/Deduct','Net Salary','Status',''].map(h => (
                    <th key={h} className="px-4 py-3 font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {records.map(rec => (
                  <PayrollRow key={rec.id} rec={rec} onViewSlip={setSlipId} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
