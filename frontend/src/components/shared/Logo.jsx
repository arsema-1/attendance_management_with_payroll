import Image from 'next/image';

export default function Logo({ size = 48, showText = true, className = '' }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <Image
          src="/worklog_logo.png"
          alt="Work Log"
          width={size}
          height={size}
          className="object-contain rounded-full"
          priority
        />
      </div>
      {showText && (
        <div className="flex flex-col leading-tight">
          <span
            className="font-extrabold tracking-tight"
            style={{ color: '#0891B2', fontSize: size * 0.42 }}
          >
            Work
          </span>
          <span
            className="font-semibold tracking-widest uppercase"
            style={{ color: '#22D3EE', fontSize: size * 0.22 }}
          >
            Log
          </span>
        </div>
      )}
    </div>
  );
}
