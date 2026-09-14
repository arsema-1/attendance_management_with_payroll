'use client';

import { useQuery } from '@tanstack/react-query';
import { CheckCircle, Banknote, Clock, CreditCard, Eye, Calendar, Building2, FileDown, FileText } from 'lucide-react';
import Link from 'next/link';
import api from '@/utils/api';
import { useRouter } from 'next/navigation';

const currency = value => `${parseFloat(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} ETB`;

function PaidPayslip({ payroll, monthName }) {
  const earnings = [
    ['Basic Salary', payroll.base_salary],
    ['Overtime Bonus', payroll.overtime_bonus],
    ...(payroll.items || []).filter(item => item.type === 'allowance' || item.type === 'bonus').map(item => [item.label, item.amount]),
  ].filter(([, amount]) => parseFloat(amount) > 0);
  const deductions = [
    ['Late Deduction', payroll.late_deduction],
    ['Leave Deduction', payroll.leave_deduction],
    ['Absent Deduction', (parseFloat(payroll.base_salary || 0) / (payroll.working_days || 1)) * (payroll.absent_days || 0)],
    ...(payroll.items || []).filter(item => item.type === 'deduction' || item.type === 'tax').map(item => [item.label, item.amount]),
  ].filter(([, amount]) => parseFloat(amount) > 0);
  const totalDeductions = Math.max(0, parseFloat(payroll.gross_salary || 0) - parseFloat(payroll.net_salary || 0));

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      <div className="max-w-3xl mx-auto bg-white min-h-screen shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h1 className="font-extrabold text-slate-900 text-lg">Payslip</h1>
          <div className="flex gap-2">
            <button onClick={() => window.print()} className="btn-secondary py-1.5 px-3 text-sm flex items-center gap-1.5"><FileText className="w-4 h-4" /> Print</button>
            <a href={`/api/payroll/slip/${payroll.id}/pdf`} target="_blank" rel="noopener noreferrer" className="btn-secondary py-1.5 px-3 text-sm flex items-center gap-1.5"><FileDown className="w-4 h-4" /> PDF</a>
          </div>
        </div>

        <div className="bg-brand-primary text-white px-6 py-7 flex justify-between">
          <div><h2 className="text-2xl font-extrabold">PAYSLIP</h2><p className="text-sm opacity-85 mt-1">{monthName} {payroll.year}</p></div>
          <div className="text-right"><p className="font-bold">Manikstu Agro</p><p className="text-xs opacity-80">HR & Payroll System</p><span className="inline-flex items-center gap-1 mt-2 px-2.5 py-1 bg-green-100 text-green-800 rounded-full text-xs font-bold"><CheckCircle className="w-3.5 h-3.5" /> Paid</span></div>
        </div>

        <div className="grid grid-cols-2 gap-x-10 gap-y-3 px-6 py-5 bg-slate-50 text-sm">
          {[
            ['Employee Name', payroll.full_name], ['Pay Period', `${monthName} ${payroll.year}`],
            ['Employee ID', payroll.employee_id], ['Position', payroll.designation || '—'],
            ['Department', payroll.department || '—'], ['Payment Status', 'Successful'],
          ].map(([label, value]) => <div className="flex justify-between gap-3" key={label}><span className="text-slate-500">{label}</span><span className="font-semibold text-slate-800 text-right">{value}</span></div>)}
        </div>

        <div className="grid grid-cols-4 divide-x divide-cyan-100 bg-cyan-50 text-center">
          {[['Working Days', payroll.working_days], ['Present', payroll.present_days], ['Absent', payroll.absent_days], ['Leave', payroll.leave_days]].map(([label, value]) => <div className="py-4" key={label}><p className="text-2xl font-extrabold text-brand-primary">{value || 0}</p><p className="text-xs text-slate-500 mt-1">{label}</p></div>)}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 px-6 py-6">
          <div><h3 className="text-xs uppercase tracking-wide font-bold text-slate-400 mb-3">Earnings</h3>{earnings.map(([label, amount]) => <div className="flex justify-between py-2 border-b border-slate-100 text-sm" key={label}><span className="text-slate-600">{label}</span><span className="font-semibold text-emerald-600">{currency(amount)}</span></div>)}<div className="flex justify-between pt-3 font-extrabold text-sm"><span>Gross Salary</span><span>{currency(payroll.gross_salary)}</span></div></div>
          <div><h3 className="text-xs uppercase tracking-wide font-bold text-slate-400 mb-3">Deductions</h3>{deductions.length ? deductions.map(([label, amount]) => <div className="flex justify-between py-2 border-b border-slate-100 text-sm" key={label}><span className="text-slate-600">{label}</span><span className="font-semibold text-red-500">- {currency(amount)}</span></div>) : <div className="py-2 text-sm text-slate-500">No deductions</div>}<div className="flex justify-between pt-3 font-extrabold text-sm"><span>Total Deductions</span><span className="text-red-500">- {currency(totalDeductions)}</span></div></div>
        </div>
        <div className="mx-6 mb-6 bg-brand-primary text-white rounded-xl px-5 py-5 flex justify-between items-center"><div><p className="text-xs opacity-75">NET SALARY</p><p className="text-3xl font-extrabold mt-1">{currency(payroll.net_salary)}</p></div><div className="text-right text-xs opacity-80"><p>{monthName} {payroll.year}</p><p>Payment successful</p></div></div>
      </div>
    </div>
  );
}

export default function SalaryPaymentsPage() {
  const router = useRouter();
  const employee = typeof window !== 'undefined'
    ? JSON.parse(localStorage.getItem('employee_data') || '{}')
    : {};

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const { data: payroll, isLoading } = useQuery({
    queryKey: ['my-payroll-current', month, year],
    queryFn: async () => {
      const { data } = await api.get(`/payroll/report?month=${month}&year=${year}`);
      const record = data.data?.find(r => r.employee_id === employee.employee_id);
      return record || null;
    },
    enabled: !!employee.employee_id,
  });

  const fmt = (n) => `${parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long' });

  const statusConfig = {
    paid: {
      color: 'green',
      icon: CheckCircle,
      label: 'Payment Successful',
      bg: 'bg-green-50',
      text: 'text-green-700',
      border: 'border-green-200',
    },
    pending_payment: {
      color: 'purple',
      icon: Clock,
      label: 'Processing Payment',
      bg: 'bg-purple-50',
      text: 'text-purple-700',
      border: 'border-purple-200',
    },
    finalized: {
      color: 'blue',
      icon: Clock,
      label: 'Approved, Awaiting Payment',
      bg: 'bg-blue-50',
      text: 'text-blue-700',
      border: 'border-blue-200',
    },
    draft: {
      color: 'yellow',
      icon: Clock,
      label: 'Pending Approval',
      bg: 'bg-yellow-50',
      text: 'text-yellow-700',
      border: 'border-yellow-200',
    },
    failed: {
      color: 'red',
      icon: Clock,
      label: 'Payment Failed',
      bg: 'bg-red-50',
      text: 'text-red-700',
      border: 'border-red-200',
    },
  };

  const status = payroll ? statusConfig[payroll.status] || statusConfig.draft : null;
  const StatusIcon = status?.icon || Clock;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-primary"></div>
      </div>
    );
  }

  // A completed payment is the payslip itself; keep the existing workflow UI below
  // for every other payroll status.
  if (payroll?.status === 'paid') {
    return <PaidPayslip payroll={payroll} monthName={monthName} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-gradient-to-r from-brand-primary to-cyan-600 text-white px-4 py-6">
        <div className="max-w-lg mx-auto">
          <h1 className="text-2xl font-extrabold text-center">Salary Payments</h1>
          <p className="text-center mt-1 opacity-80">{monthName} {year}</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-6 space-y-4">
        {!payroll && (
          <div className="card p-6 text-center">
            <Banknote className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="font-semibold text-gray-700">No Payroll Found</p>
            <p className="text-sm text-gray-400 mt-1">No salary record for this month yet.</p>
            <Link
              href="/employee"
              className="mt-4 inline-block text-brand-primary font-semibold text-sm"
            >
              ← Back to Dashboard
            </Link>
          </div>
        )}

        {payroll && (
          <>
            {/* Status Card */}
            <div className={`card overflow-hidden ${status?.bg || 'bg-gray-50'}`}>
              <div className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-full ${status?.bg || 'bg-gray-100'} flex items-center justify-center`}>
                      <StatusIcon className={`w-6 h-6 ${status?.text || 'text-gray-600'}`} />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Current Status</p>
                      <p className={`font-bold text-lg ${status?.text || 'text-gray-700'}`}>
                        {status?.label || 'Unknown'}
                      </p>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${status?.bg} ${status?.text}`}>
                    {payroll.status.replace(/_/g, ' ').toUpperCase()}
                  </span>
                </div>

                {/* Salary Amount */}
                {payroll.status === 'paid' && (
                  <div className="text-center py-4 bg-green-100 rounded-xl mb-4">
                    <p className="text-sm text-green-700 font-medium mb-1">Net Salary Paid</p>
                    <p className="text-3xl font-extrabold text-green-700 flex items-center justify-center gap-2">
                      <Banknote className="w-7 h-7" />
                      {fmt(payroll.net_salary)} ETB
                    </p>
                  </div>
                )}

                {payroll.status === 'pending_payment' && (
                  <div className="text-center py-4 bg-purple-100 rounded-xl mb-4">
                    <p className="text-sm text-purple-700 font-medium mb-1">Amount to be Transferred</p>
                    <p className="text-3xl font-extrabold text-purple-700 flex items-center justify-center gap-2">
                      <Banknote className="w-7 h-7" />
                      {fmt(payroll.net_salary)} ETB
                    </p>
                  </div>
                )}

                {/* Salary Period */}
                <div className="flex items-center gap-3 text-sm text-gray-600 bg-white rounded-xl p-3 mb-4">
                  <Calendar className="w-4 h-4 text-brand-primary" />
                  <div>
                    <p className="font-semibold text-gray-800">{monthName} {year}</p>
                    <p className="text-xs text-gray-400">Salary Period</p>
                  </div>
                </div>

                {/* Payment Method / Bank Info */}
                <div className="flex items-start gap-3 text-sm bg-white rounded-xl p-3">
                  <CreditCard className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-gray-800">
                      {payroll.bank_name || payroll.bank_code || 'Bank Account'}
                    </p>
                    <p className="text-gray-500 font-mono text-xs">
                      {payroll.account_number || 'Account Number'}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {payroll.account_name || 'Account Holder'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Payment Details Section */}
              {payroll.status === 'paid' && latestTx && (
                <div className="border-t border-gray-100 p-5 bg-white">
                  <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <Eye className="w-4 h-4 text-brand-primary" /> Payment Details
                  </h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-gray-400 text-xs">Transaction Reference</p>
                      <p className="font-mono text-gray-800 font-semibold text-xs break-all">
                        {latestTx.tx_ref}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-400 text-xs">Payment Date</p>
                      <p className="font-semibold text-gray-800">
                        {latestTx.created_at
                          ? new Date(latestTx.created_at).toLocaleDateString()
                          : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-400 text-xs">Payment Method</p>
                      <p className="font-semibold text-gray-800 flex items-center gap-1">
                        <Building2 className="w-3 h-3" />
                        Bank Transfer
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-400 text-xs">Status</p>
                      <p className="font-semibold text-green-700 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" />
                        Successful
                      </p>
                    </div>
                  </div>

                  {/* Full Payslip Preview - shown when paid */}
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <p className="text-xs font-semibold uppercase text-gray-400 mb-2">Salary Breakdown</p>
                    <div className="bg-gray-50 rounded-xl p-4">
                      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                        {[
                          ['Employee', payroll.full_name],
                          ['Employee ID', payroll.employee_id],
                          ['Designation', payroll.designation || '—'],
                          ['Department', payroll.department || '—'],
                          ['Pay Period', `${monthName} ${year}`],
                        ].map(([k, v]) => (
                          <div key={k} className="flex justify-between">
                            <span className="text-gray-500">{k}</span>
                            <span className="font-semibold text-gray-800">{v}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 flex justify-between font-bold">
                        <span className="text-gray-500">Net Salary</span>
                        <span className="text-brand-primary text-lg">{fmt(payroll.net_salary)} ETB</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <div className="grid grid-cols-2 gap-3">
                      <Link
                        href={`/employee/payroll/payment-success`}
                        className="flex items-center justify-center gap-2 bg-green-600 text-white font-semibold py-2.5 rounded-xl hover:bg-green-700 transition text-sm"
                      >
                        <Eye className="w-4 h-4" />
                        View Full Payslip
                      </Link>
                      <a
                        href={`/api/payroll/slip/${payroll.id}/pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 bg-gray-900 text-white font-semibold py-2.5 rounded-xl hover:bg-opacity-90 transition text-sm"
                      >
                        <FileDown className="w-4 h-4" />
                        Download Payslip
                      </a>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Other Months */}
            <div className="card p-0 overflow-hidden mt-4">
              <div className="px-5 py-4 border-b border-gray-50">
                <h2 className="font-bold text-gray-800">Payment History</h2>
              </div>
              <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
                {[
                  { month: month - 1 || 12, year: month === 1 ? year - 1 : year, status: 'paid' },
                ].map((p, idx) => (
                  <Link
                    key={idx}
                    href={`/employee/payroll/payment-success`}
                    className="px-5 py-3 flex items-center justify-between hover:bg-gray-50 transition"
                  >
                    <div>
                      <p className="font-semibold text-gray-800">
                        {new Date(year, p.month - 1).toLocaleString('default', { month: 'long' })} {p.year}
                      </p>
                      <p className="text-xs text-gray-400">Net Salary</p>
                    </div>
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
                      Paid
                    </span>
                  </Link>
                ))}
                {(!payroll || payroll.status !== 'paid') && (
                  <p className="px-5 py-6 text-center text-gray-400 text-sm">
                    No completed payments yet.
                  </p>
                )}
              </div>
            </div>

            {/* Back Link */}
            <div className="text-center pt-2">
              <Link
                href="/employee"
                className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-brand-primary font-semibold"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to Dashboard
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
