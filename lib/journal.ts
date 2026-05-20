import { db } from "./db";
import { DEFAULT_ASSOCIATION_ID } from "./association";
import Decimal from "decimal.js";

export async function nextEntryNo(associationId = DEFAULT_ASSOCIATION_ID): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `JE-${year}-`;
  const last = await db.journalEntry.findFirst({
    where: { associationId, entryNo: { startsWith: prefix } },
    orderBy: { entryNo: "desc" },
    select: { entryNo: true },
  });
  const n = last ? parseInt(last.entryNo.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(n).padStart(5, "0")}`;
}

export function linesBalance(lines: { debit: Decimal.Value; credit: Decimal.Value }[]) {
  const d = lines.reduce((a, l) => a.plus(new Decimal(l.debit || 0)), new Decimal(0));
  const c = lines.reduce((a, l) => a.plus(new Decimal(l.credit || 0)), new Decimal(0));
  return { debit: d, credit: c, balanced: d.equals(c) && d.gt(0) };
}
