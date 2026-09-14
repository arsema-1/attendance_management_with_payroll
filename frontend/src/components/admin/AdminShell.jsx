'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard, Users, Calendar, FileBarChart2,
  LogOut, Menu, X, ChevronRight, Clock, Bell, DollarSign, Settings,
  CheckCircle, AlertCircle, FileText,
} from 'lucide-react';
import Logo from '@/components/shared/Logo';
import api from '@/utils/api';

// Nav items visible to all admin roles
const BASE_NAV = [
  { href: '/admin',            icon: LayoutDashboard, label: 'Dashboard'  },
  { href: '/admin/employees',  icon: Users,           label: 'Employees'  },
  { href: '/admin/attendance', icon: Calendar,        label: 'Attendance' },
  { href: '/admin/leave',      icon: Clock,           label: 'Leave'      },
  { href: '/admin/payroll',    icon: DollarSign,      label: 'Payroll'    },
];

// Extra items only for super_admin / hr_admin (full admins)
const ADMIN_ONLY_NAV = [
  { href: '/admin/reports',  icon: FileBarChart2, label: 'Reports'  },
];

// Super admin only
const SUPER_ADMIN_NAV = [
  { href: '/admin/settings', icon: Settings, label: 'Settings' },
];

function getRoleLabel(role) {
  const map = {
    super_admin: 'Super Admin',
    hr_admin:    'HR Admin',
    hr_officer:  'HR Officer',
    viewer:      'Viewer',
  };
  return map[role] || role;
}

const NOTIF_ICONS = {
  payroll_approval: FileText,
  payroll_approved: CheckCircle,
  payroll_rejected: AlertCircle,
};

export default function AdminShell({ children }) {
  const router   = useRouter();
  const pathname = usePathname();
  const qc       = useQueryClient();
  const [admin, setAdmin] = useState(null);
  const [open,  setOpen]  = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const notifRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    const data  = localStorage.getItem('admin_data');
    if (!token) { router.replace('/login'); return; }
    if (data) setAdmin(JSON.parse(data));
  }, [router]);

  // Close notification dropdown when clicking outside
  useEffect(() => {
    function handleClick(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setShowNotifs(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Fetch unread notification count
  const isAdmin = admin?.role === 'super_admin' || admin?.role === 'hr_admin';
  const { data: unreadData } = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: async () => {
      const { data } = await api.get('/notifications/unread-count');
      return data.data;
    },
    refetchInterval: 30000, // poll every 30s
    enabled: isAdmin,
  });

  // Fetch notifications when dropdown is open
  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const { data } = await api.get('/notifications?limit=10');
      return data.data || [];
    },
    enabled: showNotifs && isAdmin,
  });

  const unreadCount = unreadData?.count || 0;

  async function markAsRead(id) {
    try {
      await api.patch(`/notifications/${id}/read`);
      qc.invalidateQueries(['notifications-unread-count']);
      qc.invalidateQueries(['notifications']);
    } catch {}
  }

  async function markAllRead() {
    try {
      await api.patch('/notifications/read-all');
      qc.invalidateQueries(['notifications-unread-count']);
      qc.invalidateQueries(['notifications']);
    } catch {}
  }

  function logout() {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_data');
    router.push('/login');
  }

  const isHrOfficer  = admin?.role === 'hr_officer';
  const isHrAdmin    = admin?.role === 'hr_admin';
  const isSuperAdmin = admin?.role === 'super_admin';
  const isFullAdmin  = isHrAdmin || isSuperAdmin;
  const nav = [
    ...BASE_NAV,
    // Reports only for full admins (hr_admin + super_admin)
    ...(isFullAdmin ? ADMIN_ONLY_NAV : []),
    // Settings only for super_admin
    ...(isSuperAdmin ? SUPER_ADMIN_NAV : []),
  ];

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">

      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-100
        flex flex-col shadow-lg transition-transform duration-300
        ${open ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:static lg:shadow-none
      `}>
        <div className="flex items-center justify-between px-5 py-5 border-b border-gray-100">
          <Logo size={40} />
          <button onClick={() => setOpen(false)} className="lg:hidden text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {nav.map(item => {
            const active = item.href === '/admin'
              ? pathname === '/admin'
              : pathname === item.href || pathname.startsWith(item.href + '/');
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium
                  transition-all ${active
                    ? 'bg-brand-light text-brand-primary'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                  }`}>
                <Icon className={`w-5 h-5 flex-shrink-0 ${active ? 'text-brand-primary' : ''}`} />
                {item.label}
                {active && <ChevronRight className="w-3.5 h-3.5 ml-auto text-brand-primary" />}
              </Link>
            );
          })}
        </nav>

        <div className="px-4 py-4 border-t border-gray-100">
          {admin && (
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-full gradient-brand flex items-center justify-center
                              text-white font-bold text-sm flex-shrink-0">
                {admin.name?.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">{admin.name}</p>
                <p className="text-xs text-gray-400">{getRoleLabel(admin.role)}</p>
              </div>
            </div>
          )}
          <button onClick={logout}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-500
                       hover:bg-red-50 rounded-lg transition">
            <LogOut className="w-4 h-4" /> Logout
          </button>
        </div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setOpen(false)} />
      )}

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="bg-white border-b border-gray-100 px-5 py-3.5
                           flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setOpen(true)} className="lg:hidden text-gray-500 hover:text-gray-800">
              <Menu className="w-5 h-5" />
            </button>
            <p className="text-sm text-gray-400">
              {new Date().toLocaleDateString('en-US', {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
              })}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Notification Bell with count badge */}
            {isAdmin && (
              <div className="relative" ref={notifRef}>
                <button
                  onClick={() => setShowNotifs(!showNotifs)}
                  className="relative p-2 text-gray-400 hover:text-gray-700 transition"
                >
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 text-white
                                     text-[10px] font-bold rounded-full flex items-center justify-center
                                     animate-pulse">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </button>

                {/* Notification Dropdown */}
                {showNotifs && (
                  <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-gray-200
                                  rounded-xl shadow-xl z-50 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                      <h3 className="font-bold text-gray-800 text-sm">Notifications</h3>
                      {unreadCount > 0 && (
                        <button onClick={markAllRead}
                          className="text-xs text-brand-primary hover:underline font-semibold">
                          Mark all read
                        </button>
                      )}
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="py-8 text-center">
                          <Bell className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                          <p className="text-sm text-gray-400">No notifications</p>
                        </div>
                      ) : (
                        notifications.map(notif => {
                          const Icon = NOTIF_ICONS[notif.type] || Bell;
                          return (
                            <div
                              key={notif.id}
                              onClick={() => !notif.is_read && markAsRead(notif.id)}
                              className={`flex items-start gap-3 px-4 py-3 border-b border-gray-50
                                cursor-pointer transition hover:bg-gray-50
                                ${!notif.is_read ? 'bg-blue-50/50' : ''}`}
                            >
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                                notif.type === 'payroll_approved' ? 'bg-green-100' :
                                notif.type === 'payroll_rejected' ? 'bg-red-100' :
                                'bg-amber-100'
                              }`}>
                                <Icon className={`w-4 h-4 ${
                                  notif.type === 'payroll_approved' ? 'text-green-600' :
                                  notif.type === 'payroll_rejected' ? 'text-red-600' :
                                  'text-amber-600'
                                }`} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={`text-xs font-semibold ${!notif.is_read ? 'text-gray-900' : 'text-gray-600'}`}>
                                  {notif.title}
                                </p>
                                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notif.message}</p>
                                <p className="text-[10px] text-gray-400 mt-1">
                                  {new Date(notif.created_at).toLocaleString()}
                                </p>
                              </div>
                              {!notif.is_read && (
                                <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-2" />
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                    {notifications.length > 0 && (
                      <div className="px-4 py-2 border-t border-gray-100 text-center">
                        <Link href="/admin/payroll"
                          onClick={() => setShowNotifs(false)}
                          className="text-xs text-brand-primary hover:underline font-semibold">
                          View all in Payroll
                        </Link>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="hidden sm:flex flex-col items-end">
              <span className="text-sm font-semibold text-gray-700">{admin?.name}</span>
              <span className="text-xs text-gray-400">{getRoleLabel(admin?.role)}</span>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-5 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
