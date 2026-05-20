import { NextRequest, NextResponse } from "next/server";
import { buildXlsx } from "@/lib/export/excel";
import { buildPdf } from "@/lib/export/pdf";
import {
  trialBalance,
  profitLoss,
  balanceSheet,
  generalLedgerReport,
  arAgeing,
  collectionReport,
  apAgeing,
  expenseByCategory,
  expenseBySupplier,
  paymentHistory,
} from "@/lib/export/reports";
import type { ReportData } from "@/lib/export/types";

export const dynamic = "force-dynamic";

async function buildReport(slug: string, sp: URLSearchParams): Promise<ReportData> {
  const range = { from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined };
  switch (slug) {
    case "trial-balance": return trialBalance(range);
    case "profit-loss": return profitLoss(range);
    case "balance-sheet": return balanceSheet(range);
    case "general-ledger": {
      const accountId = sp.get("accountId");
      if (!accountId) throw new Error("accountId is required for general-ledger");
      return generalLedgerReport(accountId, range);
    }
    case "ar-ageing": return arAgeing(range);
    case "collection": return collectionReport(range);
    case "ap-ageing": return apAgeing(range);
    case "expense-by-category": return expenseByCategory(range);
    case "expense-by-supplier": return expenseBySupplier(range);
    case "payment-history": {
      const residentId = sp.get("residentId");
      if (!residentId) throw new Error("residentId is required for payment-history");
      return paymentHistory(residentId, range);
    }
    default: throw new Error(`Unknown report ${slug}`);
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const sp = req.nextUrl.searchParams;
  const format = (sp.get("format") ?? "pdf").toLowerCase();
  try {
    const data = await buildReport(slug, sp);
    const filename = `${slug}-${new Date().toISOString().slice(0, 10)}.${format === "xlsx" ? "xlsx" : "pdf"}`;

    if (format === "xlsx") {
      const buf = await buildXlsx(data);
      return new NextResponse(buf as unknown as BodyInit, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }
    const buf = await buildPdf(data);
    return new NextResponse(buf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
}
