import { RefProvider } from "@/components/ref-context";
import { Shell } from "@/components/shell";
import { loadReference } from "@/lib/data";
import { todayMadrid } from "@/lib/dates";
import { requireUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await requireUser();
  const ref = await loadReference(supabase);
  return (
    <RefProvider value={{ ...ref, today: todayMadrid() }}>
      <Shell email={user.email ?? ""}>{children}</Shell>
    </RefProvider>
  );
}
