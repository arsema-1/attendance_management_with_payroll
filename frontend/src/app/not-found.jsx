import Link from 'next/link';
export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center">
        <p className="text-6xl mb-4">404</p>
        <h2 className="text-xl font-bold text-gray-800 mb-2">Page not found</h2>
        <Link href="/" className="text-sm text-brand-primary hover:underline">Go home</Link>
      </div>
    </div>
  );
}
