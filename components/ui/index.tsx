import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-[30px] flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[clamp(34px,4.2vw,50px)] leading-none text-black">{title}</h1>
        {subtitle && <div className="mt-2.5 text-sm text-gray-500">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className = "" }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 px-5 pt-[18px]">
          <h2 className="text-[21px] leading-tight tracking-[-0.01em] text-black">{title}</h2>
          {actions}
        </div>
      )}
      <div className="px-5 pb-5 pt-3.5 first:pt-5">{children}</div>
    </section>
  );
}

export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center text-sm text-gray-500">
      <p>{children}</p>
      {action}
    </div>
  );
}

const TONES = {
  gray: "bg-gray-100 text-gray-700",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  blue: "bg-sky-50 text-sky-700",
  amber: "bg-amber-50 text-amber-800",
  red: "bg-red-50 text-red-700",
  purple: "bg-violet-50 text-violet-700",
  teal: "bg-brand-50 text-brand-700",
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ tone = "gray", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}>{children}</span>;
}

export function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

export function Stat({ label, value, href, hint }: { label: string; value: ReactNode; href?: string; hint?: string }) {
  return (
    <div className="card px-5 py-[18px]">
      <div className="text-[13px] text-gray-500">{label}</div>
      <div className="mt-1 font-display text-[38px] leading-[1.05] tracking-[-0.02em] text-gray-900">{value}</div>
      {href ? (
        <Link href={href} className="mt-2 inline-block text-sm link">
          {hint ?? "View all"} →
        </Link>
      ) : hint && <div className="mt-2 text-sm text-gray-500">{hint}</div>}
    </div>
  );
}

export function Select({ name, defaultValue, options, placeholder, required }: {
  name: string;
  defaultValue?: string | null;
  options: { value: string; label: string }[];
  placeholder?: string;
  required?: boolean;
}) {
  return (
    // Keyed on the saved value so the form reset React 19 does after an action shows what was saved.
    <select key={defaultValue ?? ""} name={name} defaultValue={defaultValue ?? ""} className="input" required={required}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** One-line result banner driven by ?emailed= / ?email_error= after an "Email to client" action. */
export function EmailFlash({ emailed, error }: { emailed?: string; error?: string }) {
  if (emailed) return <p className="mb-4 rounded-md bg-emerald-50 px-4 py-2 text-sm text-emerald-800">Emailed to {emailed}.</p>;
  if (error) return <p className="mb-4 rounded-md bg-amber-50 px-4 py-2 text-sm text-amber-900">Email not sent: {error}</p>;
  return null;
}
