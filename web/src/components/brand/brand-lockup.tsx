import Link from "next/link";

export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={`brand-mark ${className}`.trim()}
      viewBox="0 0 48 48"
      fill="none"
    >
      <rect x="1" y="1" width="46" height="46" rx="12" fill="#173F55" />
      <path d="M13 12.5h15l7 7v16H13v-23Z" stroke="#F8FBFC" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M28 12.5v7h7M18 25h12M18 30h8" stroke="#DDECEF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="30" cy="30" r="3.1" fill="#53B4A6" stroke="#173F55" strokeWidth="1.2" />
    </svg>
  );
}

export function BrandLockup({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`brand-lockup ${className}`.trim()} aria-label="POLITICA — portal independente de dados públicos">
      <BrandMark />
      <span className="brand-lockup__copy">
        <strong>POLITICA</strong>
        <small>PORTAL DE DADOS PÚBLICOS</small>
      </span>
    </Link>
  );
}
