"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { AccountWithBalance, Business, Category, ISODate } from "@/lib/types";

export interface RefData {
  accounts: AccountWithBalance[];
  categories: Category[];
  businesses: Business[];
  today: ISODate;
}

const Ctx = createContext<RefData | null>(null);

export function RefProvider({ value, children }: { value: RefData; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRefData() {
  const v = useContext(Ctx);
  if (!v) throw new Error("RefProvider ausente");
  return v;
}
