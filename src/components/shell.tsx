"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { signOut } from "@/lib/actions/auth";
import { Modal } from "./modal";
import { TransactionForm } from "./transaction-form";
import { cx } from "./ui";

const NAV = [
  { href: "/", label: "Dashboard", icon: "M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" },
  { href: "/movimientos", label: "Movimientos", icon: "M4 7h13l-3-3M20 17H7l3 3" },
  { href: "/calendario", label: "Calendario", icon: "M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z" },
  { href: "/cuentas", label: "Cuentas", icon: "M3 10l9-6 9 6M5 10v8m4-8v8m6-8v8m4-8v8M3 20h18" },
  { href: "/ajustes", label: "Ajustes", icon: "M12 15a3 3 0 100-6 3 3 0 000 6zm7.4-3a7.4 7.4 0 00-.1-1.3l2-1.6-2-3.4-2.4 1a7.5 7.5 0 00-2.2-1.3L14.3 3h-4l-.4 2.4a7.5 7.5 0 00-2.2 1.3l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 000 2.6l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 002.2 1.3l.4 2.4h4l.4-2.4a7.5 7.5 0 002.2-1.3l2.4 1 2-3.4-2-1.6c.1-.4.1-.9.1-1.3z" },
];

function Icon({ d }: { d: string }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
}

export function Shell({ children, email }: { children: ReactNode; email: string }) {
  const path = usePathname();
  const [quick, setQuick] = useState(false);
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <div className="min-h-dvh md:pl-60">
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-white/[0.06] bg-ink-950 px-4 py-6 md:flex">
        <Link href="/" className="mb-8 flex items-center gap-2.5 px-2">
          <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden><path d="M7 10l4 12 5-9 5 9 4-12" fill="none" stroke="#c8a96a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <span className="font-display text-xl font-semibold tracking-wide">Wealth OS</span>
        </Link>
        <button onClick={() => setQuick(true)} className="mb-6 flex h-10 items-center justify-center gap-2 rounded-lg bg-gold text-sm font-medium text-ink-950 hover:bg-[#d6ba7f]">
          <span className="text-lg leading-none">+</span> Registrar movimiento
        </button>
        <nav className="space-y-0.5">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={cx("flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              active(n.href) ? "bg-white/[0.06] text-fg" : "text-fg-subtle hover:bg-white/[0.03] hover:text-fg-muted")}>
              <span className={active(n.href) ? "text-gold" : ""}><Icon d={n.icon} /></span>{n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto space-y-2 border-t border-white/[0.06] px-2 pt-4">
          <p className="truncate text-xs text-fg-subtle">{email}</p>
          <form action={signOut}><button className="text-xs text-fg-subtle hover:text-fg">Cerrar sesión</button></form>
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-white/[0.06] bg-ink-950/90 px-4 backdrop-blur md:hidden">
        <span className="font-display text-lg font-semibold">Wealth OS</span>
        <form action={signOut}><button className="text-xs text-fg-subtle">Salir</button></form>
      </header>

      <main className="mx-auto max-w-7xl px-4 pt-6 pb-28 md:px-8 md:pt-10 md:pb-16 animate-fade-in">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-6 border-t border-white/[0.06] bg-ink-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {NAV.slice(0, 3).map((n) => (
          <Link key={n.href} href={n.href} className={cx("flex flex-col items-center gap-0.5 py-2 text-[10px]", active(n.href) ? "text-gold" : "text-fg-subtle")}>
            <Icon d={n.icon} />{n.label}
          </Link>
        ))}
        <button onClick={() => setQuick(true)} aria-label="Registrar movimiento" className="flex flex-col items-center justify-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-gold text-2xl leading-none text-ink-950">+</span>
        </button>
        {NAV.slice(3).map((n) => (
          <Link key={n.href} href={n.href} className={cx("flex flex-col items-center gap-0.5 py-2 text-[10px]", active(n.href) ? "text-gold" : "text-fg-subtle")}>
            <Icon d={n.icon} />{n.label}
          </Link>
        ))}
      </nav>

      <Modal open={quick} onClose={() => setQuick(false)} title="Registrar movimiento">
        <TransactionForm onDone={() => setQuick(false)} />
      </Modal>
    </div>
  );
}
