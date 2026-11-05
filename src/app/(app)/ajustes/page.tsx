import { PageHeader } from "@/components/ui";
import { loadProfile } from "@/lib/data";
import { requireUser } from "@/lib/supabase/server";
import { SettingsView, type AuditEntry } from "./settings-view";

export const metadata = { title: "Ajustes" };

export default async function AjustesPage() {
  const { supabase } = await requireUser();
  const [profile, audit] = await Promise.all([
    loadProfile(supabase),
    supabase.from("audit_log").select("id,table_name,record_id,action,old_data,new_data,at").order("at", { ascending: false }).limit(40),
  ]);
  return (
    <>
      <PageHeader eyebrow="Configuración" title="Ajustes" />
      <SettingsView profile={profile} audit={(audit.data ?? []) as AuditEntry[]} />
    </>
  );
}
