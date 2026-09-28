import { db } from "./db";
import { DEFAULT_ASSOCIATION_ID } from "./association";
import { SEQUENCE_RESETS, stemFor, type SequenceConfig, type SequenceReset } from "./numbering-format";

export { SEQUENCE_RESETS, stemFor, type SequenceConfig, type SequenceReset };

/**
 * Document numbering.
 *
 * Each document type has a prefix, a zero-padding width, when the sequence
 * restarts (every month, every year, or never) and the number it starts from.
 * Defaults match the numbers already issued, so an association that never
 * touches this screen sees no change.
 */

export type SequenceKey = "INVOICE" | "RECEIPT" | "JOURNAL" | "CASH_IN" | "CASH_OUT";

export const SEQUENCE_DEFAULTS: Record<SequenceKey, SequenceConfig> = {
  INVOICE: { prefix: "", padding: 3, reset: "MONTHLY", startAt: 1 },
  RECEIPT: { prefix: "OR-", padding: 2, reset: "MONTHLY", startAt: 1 },
  JOURNAL: { prefix: "JE-", padding: 5, reset: "YEARLY", startAt: 1 },
  CASH_IN: { prefix: "CR-", padding: 2, reset: "MONTHLY", startAt: 1 },
  CASH_OUT: { prefix: "PV-", padding: 2, reset: "MONTHLY", startAt: 1 },
};

function toConfig(row: { prefix: string; padding: number; reset: string; startAt: number }): SequenceConfig {
  const reset = (SEQUENCE_RESETS as string[]).includes(row.reset) ? (row.reset as SequenceReset) : "MONTHLY";
  return { prefix: row.prefix, padding: row.padding, reset, startAt: row.startAt };
}

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
  return row ? toConfig(row) : SEQUENCE_DEFAULTS[key];
}

export async function getAllSequenceConfigs(associationId = DEFAULT_ASSOCIATION_ID) {
  const rows = await db.numberSequence.findMany({ where: { associationId } });
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return SEQUENCE_KEYS.map((key) => {
    const row = byKey.get(key);
    return {
      key,
      label: SEQUENCE_LABEL[key],
      ...(row ? toConfig(row) : SEQUENCE_DEFAULTS[key]),
      isDefault: !row,
    };
  });
}

/** Tables that carry a document number, and the column it lives in. */
const NUMBERED = {
  INVOICE: { table: "Charge", column: "invoiceNo" },
  RECEIPT: { table: "Receipt", column: "receiptNo" },
  JOURNAL: { table: "JournalEntry", column: "entryNo" },
  CASH_IN: { table: "CashEntry", column: "refNo" },
  CASH_OUT: { table: "CashEntry", column: "refNo" },
} as const satisfies Record<SequenceKey, { table: string; column: string }>;

/**
 * Highest number already issued under a stem.
 *
 * Only numbers that are the stem followed by digits count, so a prefix of "A"
 * ignores "ADJ-1" and opening-balance refs like "BF-3000/A01". Longest first,
 * because a running sequence outgrows its width: A10000 comes after A9999.
 */
async function highestIssued(key: SequenceKey, stem: string, associationId: string) {
  const { table, column } = NUMBERED[key];
  const like = stem.replace(/[\\%_]/g, (c) => `\\${c}`) + "%";
  const rows = await db.$queryRawUnsafe<{ no: string }[]>(
    `SELECT "${column}" AS no FROM "${table}"
      WHERE "associationId" = $1 AND "${column}" LIKE $2
        AND substring("${column}" from $3::int) ~ '^[0-9]+$'
      ORDER BY length("${column}") DESC, "${column}" DESC
      LIMIT 1`,
    associationId, like, stem.length + 1,
  );
  return rows[0]?.no ?? null;
}

/** Next number for a document type. */
export async function nextNumber(
  key: SequenceKey,
  date: Date,
  associationId = DEFAULT_ASSOCIATION_ID,
): Promise<string> {
  const config = await getSequenceConfig(key, associationId);
  const stem = stemFor(config, date);
  const last = await highestIssued(key, stem, associationId);
  const n = last ? Math.max(parseInt(last.slice(stem.length), 10) + 1, config.startAt) : config.startAt;
  return `${stem}${String(n).padStart(config.padding, "0")}`;
}

export function previewNumber(config: SequenceConfig, date = new Date()) {
  return `${stemFor(config, date)}${String(config.startAt).padStart(config.padding, "0")}`;
}
