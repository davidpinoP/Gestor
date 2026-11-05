"use client";
import type { Category, FlowKind, Scope } from "@/lib/types";
import { Field, Select } from "./ui";

/** Selector de categoría + subcategoría. Guarda el id más específico. */
export function CategorySelect({ categories, scope, kind, value, onChange }: { categories: Category[]; scope: Scope; kind: FlowKind; value: string | null; onChange: (id: string | null) => void }) {
  const pool = categories.filter((c) => c.scope === scope && c.kind === kind && (!c.archived || c.id === value));
  const roots = pool.filter((c) => !c.parent_id);
  const selected = pool.find((c) => c.id === value);
  const rootId = selected ? selected.parent_id ?? selected.id : "";
  const subs = pool.filter((c) => c.parent_id === rootId);
  return (
    <>
      <Field label="Categoría">
        <Select value={rootId} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">Sin categoría</option>
          {roots.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>
      <Field label="Subcategoría">
        <Select value={selected?.parent_id ? selected.id : ""} onChange={(e) => onChange(e.target.value || rootId || null)} disabled={subs.length === 0}>
          <option value="">{subs.length ? "—" : "Sin subcategorías"}</option>
          {subs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>
    </>
  );
}
