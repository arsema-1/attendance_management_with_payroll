'use client';

import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Download, Printer, WalletCards } from 'lucide-react';
import api from '@/utils/api';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const money = value => `${parseFloat(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} ETB`;

export default function EmployeePayslipPage() {
  const employee = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('employee_data') || '{}') : {};
  const currentDate = new Date();
  const month = currentDate.getMonth() + 1;
  const year = currentDate.getFullYear();

  const { data: payrollRecord, isLoading: loadingRecord } = useQuery({
    queryKey: ['my-payroll-current', month, year],
    queryFn: async () => {
      const { data } = await api.get(`/payroll/report?month=${month}&year=${year}`);
      return data.data?.find(record => record.employee_id === employee.employee_id) || null;
    },
    enabled: !!employee.employee_id,
  });
  const { data: payroll, isLoading: loadingSlip } = useQuery({
    queryKey: ['my-payslip', payrollRecord?.id],
    queryFn: async () => (await api.get(`/payroll/slip/${payrollRecord.id}`)).data.data,
    enabled: !!payrollRecord?.id,
  });

  const allowances = (payroll?.items || []).filter(item => item.type === 'allowance' || item.type === 'bonus')
    .reduce((total, item) => total + parseFloat(item.amount || 0), parseFloat(payroll?.overtime_bonus || 0));
  const deductionItems = (payroll?.items || []).filter(item => item.type === 'deduction' || item.type === 'tax');
  const totalDeductions = Math.max(0, parseFloat(payroll?.gross_salary || 0) - parseFloat(payroll?.net_salary || 0));
  const paymentDate = payroll?.payment_finalized_at || payroll?.transaction_initiated_at || payroll?.transaction_created_at;

  function handlePrint() {
    const slip = document.getElementById('payslip-print-area');
    if (!slip) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`<html><head><title>Payment Receipt — ${payroll?.full_name || ''}</title><style>
      *{box-sizing:border-box}body{font-family:Arial,sans-serif;margin:0;padding:24px;color:#1e293b}.receipt{max-width:760px;margin:auto;border:2px solid #cbd5e1;border-radius:12px;overflow:hidden;font-family:Arial,sans-serif}.receipt-header{background:#0891b2;color:#fff;padding:24px 28px;display:flex;justify-content:space-between;align-items:center}.receipt-title-row{display:flex;align-items:center;gap:16px}.receipt-logo{display:flex;align-items:center;gap:10px}.receipt-logo-text{width:40px;height:40px;background:rgba(255,255,255,0.2);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800}.receipt-company-name{margin:0;font-size:16px;font-weight:700}.receipt-company-sub{margin:2px 0 0;font-size:11px;opacity:0.8}.receipt-badge{display:inline-flex;align-items:center;gap:5px;background:#dcfce7;color:#166534;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700;margin-bottom:6px}.receipt-type{margin:0;font-size:12px;opacity:0.85}.receipt-receipt-no{text-align:right;padding-top:10px}.receipt-no-label{margin:0;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;opacity:0.7}.receipt-no-value{margin:2px 0 0;font-size:14px;font-weight:700;font-family:'Courier New',monospace}.receipt-details{display:grid;grid-template-columns:1fr 1fr;gap:0;border-bottom:2px dashed #cbd5e1}.receipt-col{padding:16px 24px}.receipt-col+.receipt-col{border-left:1px solid #e2e8f0}.receipt-section-title{margin:0 0 10px;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8;font-weight:700;padding-bottom:6px;border-bottom:1px solid #e2e8f0}.receipt-detail-row{display:flex;justify-content:space-between;align-items:baseline;padding:5px 0;font-size:13px}.receipt-detail-label{color:#64748b;flex-shrink:0}.receipt-detail-value{font-weight:600;color:#1e293b;text-align:right}.receipt-section{padding:16px 24px;border-bottom:1px solid #e2e8f0}.receipt-rows{display:flex;flex-direction:column}.receipt-row{display:flex;justify-content:space-between;align-items:center;padding:7px 0;font-size:13px;border-bottom:1px solid #f1f5f9}.receipt-row:last-child{border-bottom:none}.receipt-row-label{color:#475569}.receipt-row-value{font-weight:600}.receipt-row-total{border-bottom:2px solid #cbd5e1;padding-top:10px}.receipt-row-empty{color:#94a3b8;font-style:italic;justify-content:center}.receipt-net-box{margin:0 24px 20px}.receipt-net-inner{background:#0891b2;color:#fff;border-radius:10px;padding:20px 24px;display:flex;align-items:center;justify-content:space-between}.receipt-net-label{margin:0;font-size:10px;text-transform:uppercase;letter-spacing:0.12em;opacity:0.8}.receipt-net-amount{margin:4px 0;font-size:32px;font-weight:800;line-height:1}.receipt-net-currency{margin:0;font-size:14px;opacity:0.8;font-weight:500}.receipt-footer{padding:16px 24px;background:#f8fafc;border-top:2px dashed #cbd5e1;display:flex;justify-content:space-between;align-items:center}.receipt-footer-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px}.receipt-footer-label{margin:0;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8}.receipt-footer-value{margin:3px 0 0;font-size:13px;font-weight:600;color:#1e293b}.receipt-stamp{border:3px solid #0891B2;border-radius:8px;padding:8px 16px;text-align:center;background:#fff;transform:rotate(-3deg)}.receipt-stamp-text{margin:0;font-size:22px;font-weight:800;color:#0891B2;letter-spacing:0.1em}.receipt-stamp-sub{margin:2px 0 0;font-size:10px;color:#64748b}
    </style></head><body>${slip.outerHTML}</body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  function handleDownloadPdf() {
    const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
    window.open(`${base}/payroll/slip/${payroll?.id}/pdf?token=${localStorage.getItem('employee_token')}`, '_blank');
  }

  if (loadingRecord || (!!payrollRecord && loadingSlip)) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-primary" /></div>;
  if (!payrollRecord || !payroll) return <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4"><div className="text-center"><p className="text-xl font-bold text-slate-800">No Payslip Found</p><p className="text-slate-500 mt-2">Your salary payment has not been processed yet.</p></div></div>;

  const details = [
    ['Employee Name', payroll.full_name], ['Employee ID', payroll.employee_id],
    ['Department', payroll.department || '—'], ['Position', payroll.designation || '—'],
    ['Pay Period', `${MONTHS[payroll.month - 1]} ${payroll.year}`],
    ['Payment Date', paymentDate ? new Date(paymentDate).toLocaleDateString() : '—'],
  ];

  return <div className="min-h-screen bg-slate-50 pb-16"><div className="max-w-3xl mx-auto px-4 pt-8">
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100"><div className="flex items-center gap-3"><WalletCards className="w-5 h-5 text-brand-primary" /><h2 className="font-extrabold text-slate-900">Payment Receipt</h2></div><div className="flex gap-2"><button onClick={handlePrint} className="btn-secondary py-1.5 px-3 text-sm flex items-center gap-1.5"><Printer className="w-4 h-4" /> Print</button><button onClick={handleDownloadPdf} className="btn-secondary py-1.5 px-3 text-sm flex items-center gap-1.5"><Download className="w-4 h-4" /> PDF</button></div></div>
      <div id="payslip-print-area" className="receipt">
        {/* Receipt header */}
        <div className="receipt-header">
          <div className="receipt-title-row">
            <div className="receipt-logo">
              <span className="receipt-logo-text">M</span>
              <div className="receipt-company">
                <p className="receipt-company-name">Manikstu Agro</p>
                <p className="receipt-company-sub">HR & Payroll System</p>
              </div>
            </div>
            <div className="receipt-label">
              <span className="receipt-badge">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Payment Received
              </span>
              <p className="receipt-type">Salary Payment Receipt</p>
            </div>
          </div>
          <div className="receipt-receipt-no">
            <p className="receipt-no-label">Receipt No.</p>
            <p className="receipt-no-value">{payroll.transaction_reference || `RCPT-${payroll.id}`}</p>
          </div>
        </div>

        {/* Employee & payment details grid */}
        <div className="receipt-details">
          <div className="receipt-col">
            <p className="receipt-section-title">Employee Details</p>
            {details.map(([label, value]) => (
              <div key={label} className="receipt-detail-row">
                <span className="receipt-detail-label">{label}</span>
                <span className="receipt-detail-value">{value}</span>
              </div>
            ))}
          </div>
          <div className="receipt-col">
            <p className="receipt-section-title">Payment Info</p>
            <div className="receipt-detail-row">
              <span className="receipt-detail-label">Payment Date</span>
              <span className="receipt-detail-value">{paymentDate ? new Date(paymentDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}</span>
            </div>
            <div className="receipt-detail-row">
              <span className="receipt-detail-label">Payment Method</span>
              <span className="receipt-detail-value">Bank Transfer (Chapa)</span>
            </div>
            <div className="receipt-detail-row">
              <span className="receipt-detail-label">Transaction ID</span>
              <span className="receipt-detail-value font-mono text-xs">{payroll.transaction_reference || '—'}</span>
            </div>
            <div className="receipt-detail-row">
              <span className="receipt-detail-label">Processed By</span>
              <span className="receipt-detail-value">{payroll.approved_by_name || 'Payroll Admin'}</span>
            </div>
          </div>
        </div>

        {/* Earnings */}
        <div className="receipt-section">
          <p className="receipt-section-title">Earnings</p>
          <div className="receipt-rows">
            <div className="receipt-row">
              <span className="receipt-row-label">Basic Salary</span>
              <span className="receipt-row-value text-emerald-700">{money(payroll.base_salary)}</span>
            </div>
            {allowances > 0 && (
              <div className="receipt-row">
                <span className="receipt-row-label">Allowances & Bonuses</span>
                <span className="receipt-row-value text-emerald-700">{money(allowances)}</span>
              </div>
            )}
            <div className="receipt-row receipt-row-total">
              <span className="receipt-row-label font-bold">Gross Salary</span>
              <span className="receipt-row-value font-bold text-emerald-800">{money(payroll.gross_salary)}</span>
            </div>
          </div>
        </div>

        {/* Deductions */}
        <div className="receipt-section">
          <p className="receipt-section-title">Deductions</p>
          <div className="receipt-rows">
            {deductionItems.map(item => (
              <div key={item.id} className="receipt-row">
                <span className="receipt-row-label">{item.label}</span>
                <span className="receipt-row-value text-red-600">- {money(item.amount)}</span>
              </div>
            ))}
            {totalDeductions > 0 ? (
              <div className="receipt-row receipt-row-total">
                <span className="receipt-row-label font-bold">Total Deductions</span>
                <span className="receipt-row-value font-bold text-red-700">- {money(totalDeductions)}</span>
              </div>
            ) : (
              <div className="receipt-row receipt-row-empty">
                <span>No deductions applied</span>
                <span></span>
              </div>
            )}
          </div>
        </div>

        {/* NET SALARY - prominent box */}
        <div className="receipt-net-box">
          <div className="receipt-net-inner">
            <p className="receipt-net-label">NET SALARY PAID</p>
            <p className="receipt-net-amount">{money(payroll.net_salary)}</p>
            <p className="receipt-net-currency">ETB</p>
          </div>
        </div>

        {/* Bank transfer footer */}
        <div className="receipt-footer">
          <div className="receipt-footer-row">
            <div className="receipt-footer-col">
              <p className="receipt-footer-label">Beneficiary</p>
              <p className="receipt-footer-value">{payroll.account_name || payroll.full_name}</p>
            </div>
            <div className="receipt-footer-col">
              <p className="receipt-footer-label">Bank</p>
              <p className="receipt-footer-value">{payroll.bank_name || payroll.bank_code || '—'}</p>
            </div>
            <div className="receipt-footer-col">
              <p className="receipt-footer-label">Account</p>
              <p className="receipt-footer-value font-mono">****{String(payroll.account_number || '').slice(-4)}</p>
            </div>
          </div>
          <div className="receipt-stamp">
            <p className="receipt-stamp-text">PAID</p>
            <p className="receipt-stamp-sub">{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</p>
          </div>
        </div>
      </div>
    </div><div className="mt-6 text-center"><a href="/employee/payroll" className="text-sm text-slate-500 hover:text-brand-primary font-semibold">← Back to Salary Payments</a></div>
  </div></div>;
}
