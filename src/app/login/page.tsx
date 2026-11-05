import { LoginForm } from "./login-form";

export const metadata = { title: "Acceso" };

export default function LoginPage() {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4">
      <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[720px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,#c8a96a22,transparent)]" />
      <div className="relative w-full max-w-sm animate-fade-in">
        <div className="mb-8 text-center">
          <svg className="mx-auto mb-4" width="40" height="40" viewBox="0 0 32 32" aria-hidden><path d="M7 10l4 12 5-9 5 9 4-12" fill="none" stroke="#c8a96a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <h1 className="font-display text-4xl font-semibold">Wealth OS</h1>
          <p className="mt-2 text-sm text-fg-subtle">Tu CFO personal. Patrimonio, liquidez y decisiones.</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
