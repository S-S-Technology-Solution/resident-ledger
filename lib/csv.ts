/**
 * Minimal CSV reader — handles quoted fields, embedded commas, doubled quotes
 * and both line endings. Enough for the spreadsheet exports these imports take,
 * without pulling in a dependency.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  // Strip a UTF-8 BOM, which Excel puts at the front of its exports.
  const src = text.replace(/^﻿/, "");

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
      continue;
    }

    if (ch === '"') { inQuotes = true; continue; }
    if (ch === ",") { row.push(field); field = ""; continue; }
    if (ch === "\r") continue;
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += ch;
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** Rows keyed by header, with headers lowercased and trimmed. */
export function parseCsvRecords(text: string): Record<string, string>[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r) =>
    Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()])),
  );
}

/** Reads a column by any of several accepted header spellings. */
export function pick(record: Record<string, string>, ...names: string[]): string {
  for (const n of names) {
    const v = record[n.toLowerCase()];
    if (v !== undefined && v !== "") return v;
  }
  return "";
}

/** Parses a money figure, tolerating thousands separators, currency and brackets. */
export function parseMoney(raw: string): number | null {
  if (!raw) return null;
  let s = raw.trim().replace(/RM/gi, "").replace(/,/g, "").replace(/\s/g, "");
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  if (s.startsWith("-")) { negative = true; s = s.slice(1); }
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}
