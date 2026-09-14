import HRShell from '@/components/hr/HRShell';

export const metadata = { title: 'HR Officer — Work Log' };

export default function HRLayout({ children }) {
  return <HRShell>{children}</HRShell>;
}
