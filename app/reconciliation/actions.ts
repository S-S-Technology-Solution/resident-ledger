"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePosting } from "@/lib/permissions";

export async function setReceiptCleared(id: string, cleared: boolean, statementRef?: string) {
  await requirePosting();
  await db.receipt.update({
    where: { id },
    data: {
      cleared,
      clearedAt: cleared ? new Date() : null,
      statementRef: statementRef ?? undefined,
    },
  });
  revalidatePath("/reconciliation");
}

export async function setPaymentCleared(id: string, cleared: boolean, statementRef?: string) {
  await requirePosting();
  await db.billPayment.update({
    where: { id },
    data: {
      cleared,
      clearedAt: cleared ? new Date() : null,
      statementRef: statementRef ?? undefined,
    },
  });
  revalidatePath("/reconciliation");
}

export async function updateReceiptStatementRef(id: string, statementRef: string) {
  await requirePosting();
  await db.receipt.update({ where: { id }, data: { statementRef: statementRef || null } });
  revalidatePath("/reconciliation");
}

export async function updatePaymentStatementRef(id: string, statementRef: string) {
  await requirePosting();
  await db.billPayment.update({ where: { id }, data: { statementRef: statementRef || null } });
  revalidatePath("/reconciliation");
}

export async function setCashEntryCleared(id: string, cleared: boolean, statementRef?: string) {
  await requirePosting();
  await db.cashEntry.update({
    where: { id },
    data: {
      cleared,
      clearedAt: cleared ? new Date() : null,
      statementRef: statementRef ?? undefined,
    },
  });
  revalidatePath("/reconciliation");
}

export async function updateCashEntryStatementRef(id: string, statementRef: string) {
  await requirePosting();
  await db.cashEntry.update({ where: { id }, data: { statementRef: statementRef || null } });
  revalidatePath("/reconciliation");
}
