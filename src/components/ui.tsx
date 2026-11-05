import clsx from "clsx";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export const cx = clsx;

export function Card({ className, children, as: As = "section" }: { className?: string; children: ReactNode; as?: "section" | "div" | "article" }) {
  return <As className={cx("rounded-2xl border border-white/[0.06] bg-ink-900/80 p-5 shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset]", className)}>{children}</As>;
}

export function CardHeader({ title, subtitle, right }: { title: ReactNode; subtitle?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[13px] font-medium uppercase tracking-[0.14em] text-fg-muted">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-fg-subtle">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function PageHeader({ eyebrow, title, right }: { eyebrow?: string; title: string; right?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="text-xs uppercase tracking-[0.2em] text-gold/80">{eyebrow}</p>}
        <h1 className="font-display text-3xl font-semibold tracking-tight text-fg md:text-4xl">{title}</h1>
      </div>
      {right}
    </header>
  );
}

type BtnVariant = "primary" | "secondary" | "ghost" | "danger";
export function Button({ variant = "secondary", size = "md", className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md" }) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm",
        variant === "primary" && "bg-gold text-ink-950 hover:bg-[#d6ba7f]",
        variant === "secondary" && "border border-white/10 bg-ink-800 text-fg hover:bg-ink-700",
        variant === "ghost" && "text-fg-muted hover:bg-white/5 hover:text-fg",
        variant === "danger" && "border border-bad/30 bg-bad/10 text-bad hover:bg-bad/20",
        className,
      )}
    />
  );
}

const fieldCls = "h-10 w-full rounded-lg border border-white/10 bg-ink-850 px-3 text-sm text-fg placeholder:text-fg-subtle focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/15";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(fieldCls, className)} />;
}
export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(fieldCls, "h-auto min-h-20 py-2", className)} />;
}
export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={cx(fieldCls, "appearance-none bg-[length:12px] bg-[right_0.75rem_center] bg-no-repeat pr-8", className)}
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M3 4.5l3 3 3-3' fill='none' stroke='%23a1a3aa' stroke-width='1.5'/%3E%3C/svg%3E\")" }}>
      {children}
    </select>
  );
}

/** `group`: para controles compuestos (botones segmentados) que no deben ir dentro de un <label>. */
export function Field({ label, children, hint, className, group }: { label: string; children: ReactNode; hint?: ReactNode; className?: string; group?: boolean }) {
  const Tag = group ? "div" : "label";
  return (
    <Tag className={cx("block", className)} {...(group ? { role: "group", "aria-label": label } : {})}>
      <span className="mb-1.5 block text-xs font-medium text-fg-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-fg-subtle">{hint}</span>}
    </Tag>
  );
}

export function Check({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-sm text-fg-muted select-none">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 accent-[#c8a96a]" />
      <span>{label}{hint && <span className="block text-xs text-fg-subtle">{hint}</span>}</span>
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange, size = "md" }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; size?: "sm" | "md" }) {
  return (
    <div role="radiogroup" className="inline-flex rounded-lg border border-white/10 bg-ink-850 p-0.5">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cx("rounded-md font-medium transition-colors", size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
            value === o.value ? "bg-ink-700 text-fg shadow-sm" : "text-fg-subtle hover:text-fg-muted")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

type Tone = "neutral" | "gold" | "good" | "warn" | "bad" | "blue";
export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap",
      tone === "neutral" && "bg-white/5 text-fg-muted",
      tone === "gold" && "bg-gold-soft text-gold",
      tone === "good" && "bg-good/10 text-good",
      tone === "warn" && "bg-warn/10 text-warn",
      tone === "bad" && "bg-bad/10 text-bad",
      tone === "blue" && "bg-series-expense/10 text-[#8eaaf0]",
      className)}>
      {children}
    </span>
  );
}

export function Stat({ label, value, sub, tone, help }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "good" | "bad" | "warn" | "gold"; help?: string }) {
  return (
    <div className="min-w-0" title={help}>
      <p className="truncate text-xs text-fg-subtle">{label}</p>
      <p className={cx("num mt-1 truncate text-xl font-semibold md:text-2xl",
        tone === "good" && "text-good", tone === "bad" && "text-bad", tone === "warn" && "text-warn", tone === "gold" && "text-gold")}>{value}</p>
      {sub && <p className="mt-0.5 truncate text-xs text-fg-subtle">{sub}</p>}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center">
      <p className="text-sm font-medium text-fg-muted">{title}</p>
      {children && <div className="mt-1 text-sm text-fg-subtle">{children}</div>}
    </div>
  );
}

export function ErrorText({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <p role="alert" className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{children}</p>;
}
