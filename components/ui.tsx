import type { ReactNode } from "react";

export function DemoBadge({ dark = false }: { dark?: boolean }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
        dark ? "bg-navy-2 text-coral-soft" : "bg-coral-wash text-coral-deep"
      }`}
    >
      Demo · fictional data
    </span>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <div role="status" className="flex items-center gap-3 text-muted">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-teal" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl bg-card p-4">
      <span className="flex flex-col gap-1">
        <span className="font-semibold text-navy">{label}</span>
        {hint && <span className="text-sm text-muted">{hint}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        className="peer sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden="true"
        className="relative mt-1 h-7 w-12 shrink-0 rounded-full bg-line transition peer-checked:bg-teal peer-focus-visible:outline peer-focus-visible:outline-3 peer-focus-visible:outline-teal after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5"
      />
    </label>
  );
}

export const btn = {
  primary:
    "inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-coral px-6 text-lg font-semibold text-white shadow-sm transition hover:bg-coral-deep disabled:opacity-50",
  teal:
    "inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-teal px-6 text-lg font-semibold text-white shadow-sm transition hover:bg-teal-deep disabled:opacity-50",
  quiet:
    "inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-line bg-card px-5 font-semibold text-navy transition hover:bg-paper disabled:opacity-50",
  small:
    "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-line bg-card px-3 text-sm font-semibold text-navy transition hover:bg-paper disabled:opacity-50",
};
