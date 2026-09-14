'use client';

import { use } from 'react';
import QRAttendance from '@/components/QRScanner';

export default function AttendWithIdPage({ params }) {
  const { id } = use(params);
  return <QRAttendance prefillId={decodeURIComponent(id)} />;
}
