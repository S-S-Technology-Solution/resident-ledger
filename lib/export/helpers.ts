import { getAssociation } from "../association";
import type { Column, ReportData } from "./types";

/** Shared pieces for building exports. */
export type Range = { from?: string; to?: string };

export function parseRange(r: Range) {
  return {
    from: r.from ? new Date(r.from) : undefined,
    to: r.to ? new Date(r.to) : undefined,
  };
}

export function rangeSubtitle(r: Range, asOf = false) {
  if (asOf) return `As of ${r.to ?? new Date().toISOString().slice(0, 10)}`;
  if (r.from && r.to) return `${r.from} to ${r.to}`;
  if (r.from) return `From ${r.from}`;
  if (r.to) return `Through ${r.to}`;
  return "All dates";
}

export async function base(): Promise<Pick<ReportData, "associationName" | "generatedAt">> {
  const a = await getAssociation();
  return { associationName: a.name, generatedAt: new Date() };
}

export const numCol = (key: string, header: string, width = 1): Column => ({ key, header, money: true, align: "right", width });

/** "2026-01-31" for a date, as exports show them. */
export const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");
