import { db } from "./db";
import { DEFAULT_ASSOCIATION_ID } from "./association";

/**
 * Document numbering.
 *
 * Each document type has a prefix, a zero-padding width, and a choice of whether
 * the sequence restarts every month. Defaults match the numbers already issued,
 * so an association that never touches this screen sees no change.
 */

export type SequenceKey = "INVOICE" | "RECEIPT" | "JOURNAL" | "CASH_IN" | "CASH_OUT";

type SequenceConfig = { prefix: string; padding: number; resetMonthly: boolean };

export const SEQUENCE_DEFAULTS: Record<SequenceKey, SequenceConfig> = {
  INVOICE: { prefix: "", padding: 3, resetMonthly: true },
  RECEIPT: { prefix: "OR-", padding: 2, resetMonthly: true },
  JOURNAL: { prefix: "JE-", padding: 5, resetMonthly: false },
  CASH_IN: { prefix: "CR-", padding: 2, resetMonthly: true },
  CASH_OUT: { prefix: "PV-", padding: 2, resetMonthly: true },
};

export const SEQUENCE_LABEL: Record<SequenceKey, string> = {
  INVOICE: "Sales invoice",
  RECEIPT: "Official receipt",
  JOURNAL: "Journal entry",
  CASH_IN: "Cash book receipt",
  CASH_OUT: "Payment voucher",
};

export const SEQUENCE_KEYS = Object.keys(SEQUENCE_DEFAULTS) as SequenceKey[];

export async function getSequenceConfig(
  key: SequenceKey,
  associationId = DEFAULT_ASSOCIATION_ID,
): Promise<SequenceConfig> {
  const row = await db.numberSequence.findUnique({
    where: { associationId_key: { associationId, key } },
  });
  if (!row) return SEQUENCE_DEFAULTS[key];
  return { prefix: row.prefix, padding: row.padding, resetMonthly: row.resetMonthly };
}

export async function getAllSequenceConfigs(associationId = DEFAULT_ASSOCIATION_ID) {
  const rows = await db.numberSequence.findMany({ where: { associationId } });
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return SEQUENCE_KEYS.map((key) => {
    const row = byKey.get(key);
    return {
      key,
      label: SEQUENCE_LABEL[key],
      ...(row
        ? { prefix: row.prefix, padding: row.padding, resetMonthly: row.resetMonthly }
        : SEQUENCE_DEFAULTS[key]),
      isDefault: !row,
    };
  });
}

/** The fixed part of a number: prefix plus either YYMM or YYYY. */
function stemFor(config: SequenceConfig, date: Date) {
  if (config.resetMonthly) {
    const yy = String(date.getFullYear() % 100).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    return `${config.prefix}${yy}${mm}`;
  }
  return `${config.prefix}${date.getFullYear()}-`;
}

/**
 * Next number for a document type.
 *
 * `existing` looks up the highest number already issued under the same stem —
 * passed in by the caller because each document type lives in its own table.
 */
export async function nextNumber(
  key: SequenceKey,
  date: Date,
  existing: (stem: string) => Promise<string | null>,
  associationId = DEFAULT_ASSOCIATION_ID,
): Promise<string> {
  const config = await getSequenceConfig(key, associationId);
  const stem = stemFor(config, date);
  const last = await existing(stem);
  const n = last ? parseInt(last.slice(stem.length), 10) + 1 : 1;
  return `${stem}${String(Number.isNaN(n) ? 1 : n).padStart(config.padding, "0")}`;
}

export function previewNumber(config: SequenceConfig, date = new Date()) {
  return `${stemFor(config, date)}${"1".padStart(config.padding, "0")}`;
}
