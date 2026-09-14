'use client';

import { useQuery } from '@tanstack/react-query';
import { X, Download, Printer } from 'lucide-react';
import api from '@/utils/api';

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function fmt(n) {
  return `₹${parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

const STATUS_STYLES = {
  draft:     'bg-yellow-100 text-yellow-700',
  processed: 'bg-blue-100  text-blue-700',
  paid:      'bg-green-100 text-green-700',
};

export default function PayslipModal({ payrollId, onClose }) {
  const { data, isLoading } = useQuery({
    queryKey: ['payslip', payrollId],
    queryFn: async () => {
      const { data } = await api.get(`/payroll/slip/${payrollId}`);
      return data.data;
    },
  });

  function handlePrint() {
    const el = document.getElementById('payslip-print-area');
    if (!el) return;
    const w = window.open('', '_blank');
    w.document.write(`
      <html>
        <head>
          <title>Payslip — ${data?.full_name}</title>
          <style>
            * { box-sizing: border-box; }
            body { font-family: Inter, sans-serif; margin: 0; padding: 20px; color: #111; }
            .header { background: #0891B2; color: white; padding: 20px 24px; border-radius: 12px 12px 0 0; display: flex; justify-content: space-between; }
            .header h1 { margin: 0; font-size: 22px; } .header p { margin: 4px 0 0; font-size: 13px; opacity: 0.85; }
            .header-right { text-align: right; }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; padding: 16px 24px; background: #f8fafc; }
            .info-row { display: flex; justify-content: space-between; font-size: 13px; }
            .info-row .k { color: #6b7280; } .info-row .v { font-weight: 600; }
            .att-strip { display: flex; justify-content: space-around; padding: 12px 24px; background: #e0f2fe; }
            .att-item { text-align: center; } .att-item .num { font-size: 20px; font-weight: 700; color: #0891B2; }
            .att-item .lbl { font-size: 11px; color: #374151; }
            .section { padding: 0 24px; }
            .section h3 { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; margin: 16px 0 6px; }
            .item-row { display: flex; justify-content: space-between; font-size: 13px; padding: 5px 0; border-bottom: 1px solid #f1f5f9; }
            .item-row .earn { color: #16a34a; font-weight: 600; }
            .item-row .dedu { color: #dc2626; font-weight: 600; }
            .totals { margin: 16px 24px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
            .total-box { background: #f0f9ff; border-radius: 8px; padding: 10px 14px; }
            .total-box .lbl { font-size: 11px; color: #6b7280; } .total-box .val { font-size: 16px; font-weight: 700; color: #0891B2; }
            .net-box { margin: 0 24px 24px; background: #0891B2; color: white; border-radius: 10px; padding: 14px 20px; display: flex; justify-content: space-between; align-items: center; }
            .net-box .lbl { font-size: 13px; opacity: .85; } .net-box .val { font-size: 22px; font-weight: 800; }
            .badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; background: #dcfce7; color: #16a34a; }
          </style>
        </head>
        <body>${el.innerHTML}</body>
      </html>
    `);
    w.document.close();
    w.focus();
    w.print();
    w.close();
  }

  function handleDownloadPdf() {
    const base  = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
    const token = localStorage.getItem('admin_token') || localStorage.getItem('hr_token');
    window.open(`${base}/payroll/slip/${payrollId}/pdf?token=${token}`, '_blank');
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 animate-fade-in"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">

        {/* Modal top bar */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 className="font-extrabold text-gray-900">Payslip</h2>
          <div className="flex gap-2">
            <button onClick={handlePrint}
              className="btn-secondary py-1.5 px-3 text-sm flex items-center gap-1.5">
              <Printer className="w-4 h-4" /> Print
            </button>
            <button onClick={handleDownloadPdf}
              className="btn-secondary py-1.5 px-3 text-sm flex items-center gap-1.5">
              <Download className="w-4 h-4" /> PDF
            </button>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 transition">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {isLoading && (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-2 border-brand-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-gray-400 mt-3">Loading payslip...</p>
          </div>
        )}

        {data && (
          <div id="payslip-print-area">
            {/* Header */}
            <div className="header bg-brand-primary text-white px-6 py-5 flex justify-between items-start">
              <div>
                <h1 className="text-xl font-extrabold">PAYSLIP</h1>
                <p className="text-sm opacity-80 mt-0.5">
                  {MONTHS[data.month - 1]} {data.year}
                </p>
              </div>
              <div className="text-right">
                <p className="font-bold text-sm">Manikstu Agro</p>
                <p className="text-xs opacity-75">HR & Payroll System</p>
                <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-semibold capitalize
                  ${data.status === 'paid' ? 'bg-green-200 text-green-800' :
                    data.status === 'processed' ? 'bg-blue-200 text-blue-800' :
                    'bg-yellow-200 text-yellow-800'}`}>
                  {data.status}
                </span>
              </div>
            </div>

            {/* Employee info grid */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 px-6 py-4 bg-gray-50 text-sm">
              {[
                ['Employee Name', data.full_name],
                ['Pay Period',    `${MONTHS[data.month-1]} ${data.year}`],
                ['Employee ID',   data.employee_id],
                ['Designation',   data.designation || '—'],
                ['Department',    data.department   || '—'],
                ['Date of Joining', data.date_of_joining
                  ? new Date(data.date_of_joining).toLocaleDateString('en-US') : '—'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-gray-500">{k}</span>
                  <span className="font-semibold text-gray-800">{v}</span>
                </div>
              ))}
            </div>

            {/* Attendance strip */}
            <div className="flex divide-x divide-cyan-100 bg-cyan-50 text-center">
              {[
                ['Working Days', data.working_days],
                ['Present',      data.present_days],
                ['Absent',       data.absent_days],
                ['Leave',        data.leave_days],
                ['Late Hrs',     parseFloat(data.late_deduction) > 0
                  ? (parseFloat(data.late_deduction) / 20).toFixed(1)
                  : '0'],
              ].map(([label, val]) => (
                <div key={label} className="flex-1 py-3">
                  <p className="text-xl font-extrabold text-brand-primary">{val}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            {/* Earnings & Deductions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 px-6 py-4">
              {/* Earnings */}
              <div>
                <p className="text-xs font-semibold uppercase text-gray-400 mb-2">Earnings</p>
                <div className="space-y-1.5">
                  {[
                    ['Basic Salary',   data.base_salary,    true],
                    ['Overtime Bonus', data.overtime_bonus, true],
                    ...(data.items || [])
                      .filter(i => i.type === 'allowance' || i.type === 'bonus')
                      .map(i => [i.label, i.amount, true]),
                  ].filter(([,v]) => parseFloat(v) > 0).map(([label, val]) => (
                    <div key={label} className="flex justify-between text-sm py-1 border-b border-gray-50">
                      <span className="text-gray-600">{label}</span>
                      <span className="font-semibold text-green-600">{fmt(val)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm font-bold pt-1">
                    <span>Gross Salary</span>
                    <span>{fmt(data.gross_salary)}</span>
                  </div>
                </div>
              </div>

              {/* Deductions */}
              <div>
                <p className="text-xs font-semibold uppercase text-gray-400 mb-2">Deductions</p>
                <div className="space-y-1.5">
                  {[
                    [`Late Arrival ($20/hr × ${parseFloat(data.late_deduction) > 0
                        ? (parseFloat(data.late_deduction) / 20).toFixed(1) : '0'} hrs)`,
                      data.late_deduction],
                    [`Unpaid Leave (${data.leave_days || 0} day${data.leave_days !== 1 ? 's' : ''})`,
                      data.leave_deduction],
                    ['Absent Deduction',
                      ((parseFloat(data.base_salary) / (data.working_days || 1)) * data.absent_days).toFixed(2)],
                    ...(data.items || [])
                      .filter(i => i.type === 'deduction' || i.type === 'tax')
                      .map(i => [i.label, i.amount]),
                  ].filter(([,v]) => parseFloat(v) > 0).map(([label, val]) => (
                    <div key={label} className="flex justify-between text-sm py-1 border-b border-gray-50">
                      <span className="text-gray-600">{label}</span>
                      <span className="font-semibold text-red-500">- {fmt(val)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm font-bold pt-1">
                    <span>Total Deductions</span>
                    <span className="text-red-500">
                      {fmt(
                        parseFloat(data.late_deduction) +
                        parseFloat(data.leave_deduction  || 0) +
                        parseFloat(data.other_deductions || 0) +
                        (parseFloat(data.base_salary) / (data.working_days || 1)) * data.absent_days
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Net salary */}
            <div className="mx-6 mb-6 bg-brand-primary text-white rounded-xl px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-xs opacity-75">NET SALARY</p>
                <p className="text-2xl font-extrabold mt-0.5">{fmt(data.net_salary)}</p>
              </div>
              <div className="text-right text-xs opacity-75">
                <p>{MONTHS[data.month-1]} {data.year}</p>
                <p>Generated {new Date(data.generated_at).toLocaleDateString('en-US')}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
