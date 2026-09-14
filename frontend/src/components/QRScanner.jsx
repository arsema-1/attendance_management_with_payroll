'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { CheckCircle, LogOut, Wifi, WifiOff, MapPin } from 'lucide-react';
import Link from 'next/link';
import api from '@/utils/api';

const STATES = { IDLE: 'idle', LOADING: 'loading', DONE: 'done' };

export default function QRAttendance({ prefillId = '' }) {
  const [employeeId, setEmployeeId] = useState(prefillId);
  const [empInfo,    setEmpInfo]    = useState(null);
  const [pageState,  setPageState]  = useState(STATES.IDLE);
  const [result,     setResult]     = useState(null);
  const [now,        setNow]        = useState(new Date());
  const [online,     setOnline]     = useState(true);
  const [gpsStatus,  setGpsStatus]  = useState('idle');

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Online/offline detection
  useEffect(() => {
    const onOnline  = () => { setOnline(true); syncOfflineRecords(); };
    const onOffline = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener('online',  onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online',  onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Auto-lookup when a prefillId is provided (from QR code scan)
  useEffect(() => {
    if (prefillId) lookupEmployee(prefillId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillId]);

  async function syncOfflineRecords() {
    try {
      const { getPendingRecords, clearPendingRecords } = await import('@/utils/offlineDB');
      const pending = await getPendingRecords();
      if (!pending.length) return;
      await api.post('/attendance/sync', { records: pending });
      await clearPendingRecords();
      toast.success(`${pending.length} offline record(s) synced!`);
    } catch (_) {}
  }

  function getGPS() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve({});
      setGpsStatus('getting');
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setGpsStatus('ok');
          resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        },
        () => { setGpsStatus('denied'); resolve({}); },
        { timeout: 8000, enableHighAccuracy: true }
      );
    });
  }

  async function lookupEmployee(id) {
    const lookup = (typeof id === 'string' ? id : employeeId).trim();
    if (!lookup) return toast.error('Enter your Employee ID or phone number.');
    setPageState(STATES.LOADING);
    try {
      const { data } = await api.get(`/attendance/status/${lookup}`);
      setEmpInfo(data.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Employee not found.');
      setEmpInfo(null);
    } finally {
      setPageState(STATES.IDLE);
    }
  }

  async function handleAction(action) {
    setPageState(STATES.LOADING);
    const location = await getGPS();
    const payload = {
      employee_id: employeeId.trim(),
      ...location,
      device_id: navigator.userAgent.slice(0, 80),
      method: 'qr',
    };

    if (!online) {
      const { savePendingRecord } = await import('@/utils/offlineDB');
      await savePendingRecord({
        ...payload,
        [action === 'checkin' ? 'check_in_time' : 'check_out_time']: new Date().toISOString(),
        date: new Date().toISOString().split('T')[0],
        method: 'offline_sync',
      });
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        await reg.sync?.register('sync-attendance').catch(() => {});
      }
      setResult({ type: action, offline: true, employee_name: empInfo?.employee_name || employeeId });
      setPageState(STATES.DONE);
      return;
    }

    try {
      const endpoint = action === 'checkin' ? '/attendance/check-in' : '/attendance/check-out';
      const { data } = await api.post(endpoint, payload);
      setResult({ type: action, offline: false, ...data.data });
      setPageState(STATES.DONE);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed. Please try again.');
      setPageState(STATES.IDLE);
    }
  }

  function reset() {
    setEmployeeId(prefillId);
    setEmpInfo(null);
    setResult(null);
    setPageState(STATES.IDLE);
    setGpsStatus('idle');
  }

  // ── Confirmation screen ──────────────────────────────────────
  if (pageState === STATES.DONE && result) {
    const isIn = result.type === 'checkin';
    return (
      <div className="min-h-screen gradient-brand flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full text-center animate-fade-in">
          <div className={`w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center
            ${isIn ? 'bg-cyan-100' : 'bg-orange-100'}`}>
            {isIn
              ? <CheckCircle className="w-10 h-10 text-cyan-600" />
              : <LogOut className="w-10 h-10 text-orange-600" />}
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-1">
            {isIn ? 'Checked In!' : 'Checked Out!'}
          </h2>
          <p className="text-gray-400 text-sm mb-1">
            {result.offline
              ? '⚡ Saved offline — will sync automatically'
              : isIn ? 'Have a productive day!' : 'See you tomorrow!'}
          </p>
          <div className="bg-gray-50 rounded-2xl p-4 my-5 text-left space-y-2 text-sm">
            {[
              ['Employee', result.employee_name || result.employee_id],
              ['Date',     format(new Date(), 'dd MMM yyyy')],
              ['Time',     format(new Date(), 'hh:mm:ss a')],
              ...(result.is_late ? [['Status', '⚠️ Late Arrival']] : []),
              ...(result.working_hours ? [['Hours Worked', result.working_hours]] : []),
              ['Method',   result.offline ? 'Offline (queued)' : 'QR Code'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span className="text-gray-500">{k}</span>
                <span className="font-semibold text-gray-800">{v}</span>
              </div>
            ))}
          </div>
          {result.is_late && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mb-4 text-amber-700 text-xs">
              ⚠️ You have been marked as late today.
            </div>
          )}
          <button onClick={reset} className="btn-primary w-full">Done</button>
        </div>
      </div>
    );
  }

  // ── Main attendance form ─────────────────────────────────────
  return (
    <div className="min-h-screen gradient-brand flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-7 max-w-sm w-full animate-fade-in">

        {/* Online/offline badge */}
        <div className="flex justify-end mb-3">
          <span className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full
            ${online ? 'bg-cyan-50 text-cyan-700' : 'bg-red-50 text-red-600'}`}>
            {online ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {online ? 'Online' : 'Offline Mode'}
          </span>
        </div>

        {/* Branding */}
        <div className="text-center mb-6">
          <img src="/worklog_logo.png" alt="Work Log" className="w-16 h-16 mx-auto rounded-full object-contain mb-3 shadow-md" />
          <h1 className="text-xl font-extrabold text-brand-primary">Work Log</h1>
          <p className="text-xs text-gray-400 mt-0.5 font-medium tracking-widest uppercase">Attendance System</p>
          <div className="mt-3 bg-brand-light rounded-2xl px-4 py-2.5">
            <p className="text-brand-primary font-bold text-2xl font-mono">
              {format(now, 'hh:mm:ss a')}
            </p>
            <p className="text-brand-secondary text-xs font-medium">
              {format(now, 'EEEE, dd MMMM yyyy')}
            </p>
          </div>
        </div>

        {/* ID input */}
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">
          Employee ID / Phone Number
        </label>
        <div className="flex gap-2 mb-4">
          <input
            className="input flex-1"
            placeholder="e.g. MKA-001 or phone..."
            value={employeeId}
            onChange={e => { setEmployeeId(e.target.value); setEmpInfo(null); }}
            onKeyDown={e => e.key === 'Enter' && lookupEmployee()}
            disabled={pageState === STATES.LOADING}
          />
          <button
            onClick={() => lookupEmployee()}
            disabled={pageState === STATES.LOADING}
            className="px-4 py-3 bg-brand-primary text-white rounded-xl text-sm font-bold
                       hover:bg-brand-dark transition disabled:opacity-50"
          >
            {pageState === STATES.LOADING ? '...' : 'Find'}
          </button>
        </div>

        {/* GPS indicator */}
        {gpsStatus !== 'idle' && (
          <div className={`flex items-center gap-1.5 text-xs mb-3 px-3 py-1.5 rounded-lg
            ${gpsStatus === 'ok'     ? 'bg-cyan-50 text-cyan-700' :
              gpsStatus === 'denied' ? 'bg-amber-50 text-amber-700' :
                                       'bg-blue-50 text-blue-700'}`}>
            <MapPin className="w-3 h-3" />
            {gpsStatus === 'getting' && 'Getting your location...'}
            {gpsStatus === 'ok'      && 'Location verified ✓'}
            {gpsStatus === 'denied'  && 'Location access denied — GPS check skipped'}
          </div>
        )}

        {/* Employee found — action buttons */}
        {empInfo && (
          <div className="animate-fade-in">
            <div className="bg-brand-light rounded-2xl px-4 py-3 mb-4 text-center">
              <p className="font-bold text-brand-primary text-base">{empInfo.employee_name}</p>
              <p className="text-xs text-brand-secondary">{empInfo.employee_id}</p>
            </div>

            {empInfo.status === 'not_checked_in' && (
              <button
                onClick={() => handleAction('checkin')}
                disabled={pageState === STATES.LOADING}
                className="w-full py-4 bg-brand-primary hover:bg-brand-dark text-white
                           font-bold text-lg rounded-2xl transition active:scale-95
                           disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg"
              >
                <CheckCircle className="w-6 h-6" />
                {pageState === STATES.LOADING ? 'Recording...' : 'CHECK IN'}
              </button>
            )}

            {empInfo.status === 'checked_in' && (
              <>
                <p className="text-center text-xs text-gray-400 mb-3">
                  ✅ Checked in at {format(new Date(empInfo.check_in_time), 'hh:mm a')}
                </p>
                <button
                  onClick={() => handleAction('checkout')}
                  disabled={pageState === STATES.LOADING}
                  className="w-full py-4 bg-orange-500 hover:bg-orange-600 text-white
                             font-bold text-lg rounded-2xl transition active:scale-95
                             disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg"
                >
                  <LogOut className="w-6 h-6" />
                  {pageState === STATES.LOADING ? 'Recording...' : 'CHECK OUT'}
                </button>
              </>
            )}

            {empInfo.status === 'checked_out' && (
              <div className="text-center py-5">
                <p className="text-4xl mb-2">✅</p>
                <p className="font-semibold text-gray-700">Attendance complete for today.</p>
                <p className="text-sm text-gray-400">See you tomorrow!</p>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 text-center">
          <Link href="/login" className="text-xs text-gray-400 hover:text-brand-primary transition">
            Employee Login →
          </Link>
        </div>
      </div>
    </div>
  );
}
