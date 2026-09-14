'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Download, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import api from '@/utils/api';

export default function EmployeePayrollPage() {
  const now   = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year,  setYear]  = useState(now.getFullYear());

  const employee = typeof window !== 'undefined'
    ? JSON.parse(localStorage.getItem('employee_data') || '{}')
    : {};

  const { data, isLoading } = useQuery({
    queryKey: ['my-payroll', month, year],
    queryFn:  async () => {
      const { data } = await api.get(`/payroll/report?month=${month}&year=${year}`);
      const mine = data.data?.find(r => r.employee_id === employee.employee_id);
      return mine || null;
    },
    enabled: !!employee.employee_id,
  });

  const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long' });

  return (      <div className="min-h-screen bg-gray-50 pb-16">
        <div className="max-w-3xl mx-auto px-4 pt-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <Link href="/employee" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-brand-primary font-semibold">
              <ArrowLeft className="w-4 h-4" /> Back
            </Link>
            <div className="flex items-center gap-2">
              <select
                className="bg-white border border-gray-200 rounded-xl px-3 py-1.5 text-sm font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
                value={month}
                onChange={e => setMonth(Number(e.target.value))}
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i+1} value={i+1}>
                    {new Date(2000, i).toLocaleString('default', { month: 'long' })}
                  </option>
                ))}
              </select>
              <select
                className="bg-white border border-gray-200 rounded-xl px-3 py-1.5 text-sm font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
                value={year}
                onChange={e => setYear(Number(e.target.value))}
              >
                {[now.getFullYear() - 1, now.getFullYear()].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Receipt card */}
          <div className="receipt">
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
                    {data?.status === 'paid' ? (
                      <><CheckCircle2 className="w-3.5 h-3.5" /> Payment Received</>
                    ) : data?.status === 'finalized' ? (
                      <><Clock className="w-3.5 h-3.5" /> Finalized</>
                    ) : (
                      <><AlertCircle className="w-3.5 h-3.5" /> Draft</>
                    )}
                  </span>
                  <p className="receipt-type">Salary Slip</p>
                </div>
              </div>
              <div className="receipt-receipt-no">
                <p className="receipt-no-label">Pay Period</p>
                <p className="receipt-no-value">{monthName} {year}</p>
              </div>
            </div>

            {isLoading && (
              <div className="p-12 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-primary mx-auto mb-3" />
                <p className="text-sm text-gray-400">Loading salary slip...</p>
              </div>
            )}

            {!isLoading && !data && (
              <div className="p-12 text-center">
                <p className="text-4xl mb-3">📊</p>
                <p className="font-semibold text-gray-700">No payroll generated yet</p>
                <p className="text-sm text-gray-400 mt-1">For {monthName} {year}</p>
              </div>
            )}

            {data && (
              <>
                {/* Employee & pay details */}
                <div className="receipt-details">
                  <div className="receipt-col">
                    <p className="receipt-section-title">Employee Details</p>
                    <div className="receipt-detail-row">
                      <span className="receipt-detail-label">Employee Name</span>
                      <span className="receipt-detail-value">{data.full_name}</span>
                    </div>
                    <div className="receipt-detail-row">
                      <span className="receipt-detail-label">Employee ID</span>
                      <span className="receipt-detail-value">{data.employee_id}</span>
                    </div>
                    <div className="receipt-detail-row">
                      <span className="receipt-detail-label">Department</span>
                      <span className="receipt-detail-value">{data.department || '—'}</span>
                    </div>
                    <div className="receipt-detail-row">
                      <span className="receipt-detail-label">Position</span>
                      <span className="receipt-detail-value">{data.designation || '—'}</span>
                    </div>
                  </div>
                  <div className="receipt-col">
                    <p className="receipt-section-title">Pay Information</p>
                    <div className="receipt-detail-row">
                      <span className="receipt-detail-label">Working Days</span>
                      <span className="receipt-detail-value">{data.working_days} days</span>
                    </div>
                    <div className="receipt-detail-row">
                      <span className="receipt-detail-label">Date of Joining</span>
                      <span className="receipt-detail-value">
                        {data.date_of_joining ? new Date(data.date_of_joining).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
                      </span>
                    </div>
                    <div className="receipt-detail-row">
                      <span className="receipt-detail-label">Pay Status</span>
                      <span className="receipt-detail-value">
                        {data.status === 'paid' ? '✅ Paid' :
                         data.status === 'finalized' ? '🔒 Finalized' : '📋 Draft'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Attendance strip */}
                <div className="receipt-section">
                  <p className="receipt-section-title">Attendance</p>
                  <div className="receipt-rows">
                    <div className="receipt-row">
                      <span className="receipt-row-label">Present</span>
                      <span className="receipt-row-value text-cyan-700 font-bold">{data.present_days} days</span>
                    </div>
                    <div className="receipt-row">
                      <span className="receipt-row-label">Absent</span>
                      <span className="receipt-row-value text-red-600 font-bold">{data.absent_days} days</span>
                    </div>
                    <div className="receipt-row">
                      <span className="receipt-row-label">Leave</span>
                      <span className="receipt-row-value text-blue-700 font-bold">{data.leave_days} days</span>
                    </div>
                  </div>
                </div>

                {/* Earnings */}
                <div className="receipt-section">
                  <p className="receipt-section-title">Earnings</p>
                  <div className="receipt-rows">
                    <div className="receipt-row">
                      <span className="receipt-row-label">Basic Salary</span>
                      <span className="receipt-row-value text-emerald-700">ETB {parseFloat(data.base_salary).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>
                    {parseFloat(data.overtime_bonus) > 0 && (
                      <div className="receipt-row">
                        <span className="receipt-row-label">Overtime Bonus</span>
                        <span className="receipt-row-value text-emerald-700">+ ETB {parseFloat(data.overtime_bonus).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    {parseFloat(data.other_allowances) > 0 && (
                      <div className="receipt-row">
                        <span className="receipt-row-label">Allowances</span>
                        <span className="receipt-row-value text-emerald-700">+ ETB {parseFloat(data.other_allowances).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    <div className="receipt-row receipt-row-total">
                      <span className="receipt-row-label font-bold">Gross Salary</span>
                      <span className="receipt-row-value font-bold text-emerald-800">ETB {parseFloat(data.gross_salary).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>

                {/* Deductions */}
                <div className="receipt-section">
                  <p className="receipt-section-title">Deductions</p>
                  <div className="receipt-rows">
                    {parseFloat(data.late_deduction) > 0 && (
                      <div className="receipt-row">
                        <span className="receipt-row-label">Late Deduction</span>
                        <span className="receipt-row-value text-red-600">- ETB {parseFloat(data.late_deduction).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    {data.absent_days > 0 && (
                      <div className="receipt-row">
                        <span className="receipt-row-label">Absent Deduction</span>
                        <span className="receipt-row-value text-red-600">- ETB {((parseFloat(data.base_salary) / data.working_days) * data.absent_days).toFixed(2)}</span>
                      </div>
                    )}
                    {parseFloat(data.other_deductions) > 0 && (
                      <div className="receipt-row">
                        <span className="receipt-row-label">Other Deductions</span>
                        <span className="receipt-row-value text-red-600">- ETB {parseFloat(data.other_deductions).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    {(parseFloat(data.late_deduction) > 0 || data.absent_days > 0 || parseFloat(data.other_deductions) > 0) ? (
                      <div className="receipt-row receipt-row-total">
                        <span className="receipt-row-label font-bold">Total Deductions</span>
                        <span className="receipt-row-value font-bold text-red-700">
                          - ETB {(parseFloat(data.late_deduction) + (data.absent_days > 0 ? (parseFloat(data.base_salary) / data.working_days) * data.absent_days : 0) + parseFloat(data.other_deductions)).toFixed(2)}
                        </span>
                      </div>
                    ) : (
                      <div className="receipt-row receipt-row-empty">
                        <span>No deductions applied</span>
                        <span></span>
                      </div>
                    )}
                  </div>
                </div>

                {/* NET SALARY */}
                <div className="receipt-net-box">
                  <div className="receipt-net-inner">
                    <p className="receipt-net-label">NET SALARY</p>
                    <p className="receipt-net-amount">{parseFloat(data.net_salary).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                    <p className="receipt-net-currency">ETB</p>
                  </div>
                </div>

                {/* Footer */}
                <div className="receipt-footer">
                  <div className="receipt-footer-row">
                    <div className="receipt-footer-col">
                      <p className="receipt-footer-label">Generated On</p>
                      <p className="receipt-footer-value">
                        {data.generated_at ? new Date(data.generated_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}
                      </p>
                    </div>
                    <div className="receipt-footer-col">
                      <p className="receipt-footer-label">Payslip</p>
                      <p className="receipt-footer-value">
                        {data.status === 'paid' ? 'Download Available' : 'Pending Processing'}
                      </p>
                    </div>
                    <div className="receipt-footer-col">
                      <p className="receipt-footer-label">Department</p>
                      <p className="receipt-footer-value">{data.department || '—'}</p>
                    </div>
                  </div>
                  <div className="receipt-stamp">
                    <p className="receipt-stamp-text">{data.status === 'paid' ? 'PAID' : data.status === 'finalized' ? 'READY' : 'DRAFT'}</p>
                    <p className="receipt-stamp-sub">{monthName} {year}</p>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Download button for paid slips */}
          {data?.status === 'paid' && (
            <div className="text-center mt-6">
              <a href={`/employee/payroll/slip/${data.id}/pdf`}
                className="btn-primary inline-flex items-center gap-2 text-sm py-2.5 px-6">
                <Download className="w-4 h-4" /> Download PDF Payslip
              </a>
            </div>
          )}
        </div>
      </div>
  );
}
