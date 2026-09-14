import AdminShell from '@/components/admin/AdminShell';

export const metadata = { title: 'Admin — Work Log' };

export default function AdminLayout({ children }) {
  return <AdminShell>{children}</AdminShell>;
}
