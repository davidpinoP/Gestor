import { PageHeader } from "@/components/ui";
import { AccountsView } from "./accounts-view";

export const metadata = { title: "Cuentas" };

export default function CuentasPage() {
  return (
    <>
      <PageHeader eyebrow="Activos y pasivos" title="Cuentas" />
      <AccountsView />
    </>
  );
}
