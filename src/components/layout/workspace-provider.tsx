"use client";
import { createContext, useContext } from "react";
import type { MemberRole } from "@/lib/types";

export interface ClientWorkspace {
  id: string;
  name: string;
  timezone: string;
  role: MemberRole;
  canManage: boolean;
  userId: string;
}

const Ctx = createContext<ClientWorkspace | null>(null);

export function WorkspaceProvider({ value, children }: { value: ClientWorkspace; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWorkspace must be used inside the dashboard");
  return v;
}
