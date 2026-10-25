import type { ExportDef } from "./types";
import {
  trialBalance, profitLoss, balanceSheet, generalLedgerReport, arAgeing, collectionReport, apAgeing,
  expenseByCategory, expenseBySupplier, paymentHistory, fixedAssets, invoiceListing, billListing,
  salesReport, creditorPayments, accountRange, batchTransactions,
} from "./reports";
import { BANK_EXPORTS } from "./bank";
import { MORE_REPORT_EXPORTS } from "./more-reports";
import { LIST_EXPORTS } from "./lists";

/**
 * Every downloadable PDF/Excel, keyed by the slug in /api/export/[slug]. Each
 * names the screen a user must be able to see to download it.
 */
const range = (sp: URLSearchParams) => ({ from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined });
const opt = (sp: URLSearchParams, k: string) => sp.get(k) ?? undefined;

const REPORT_EXPORTS: Record<string, ExportDef> = {
  "trial-balance": { screen: "reports", build: (sp) => trialBalance({ ...range(sp), view: opt(sp, "view") }) },
  "profit-loss": { screen: "reports", build: (sp) => profitLoss(range(sp)) },
  "balance-sheet": { screen: "reports", build: (sp) => balanceSheet(range(sp)) },
  "general-ledger": { screen: "reports", build: (sp) => generalLedgerReport(opt(sp, "accountId"), range(sp)) },
  "ar-ageing": { screen: "reports", build: (sp) => arAgeing(range(sp)) },
  "collection": { screen: "reports", build: (sp) => collectionReport(range(sp)) },
  "ap-ageing": { screen: "reports", build: (sp) => apAgeing(range(sp)) },
  "expense-by-category": { screen: "reports", build: (sp) => expenseByCategory(range(sp)) },
  "expense-by-supplier": { screen: "reports", build: (sp) => expenseBySupplier(range(sp)) },
  "payment-history": {
    screen: "reports",
    build: (sp) => {
      const residentId = sp.get("residentId");
      if (!residentId) throw new Error("residentId is required for payment-history");
      return paymentHistory(residentId, range(sp));
    },
  },
  "fixed-assets": { screen: "reports", build: (sp) => fixedAssets(range(sp)) },
  "invoice-listing": { screen: "reports", build: (sp) => invoiceListing({ ...range(sp), view: opt(sp, "view") }) },
  "bill-listing": { screen: "reports", build: (sp) => billListing({ ...range(sp), view: opt(sp, "view") }) },
  "sales-report": { screen: "reports", build: (sp) => salesReport(range(sp)) },
  "creditor-payments": { screen: "reports", build: (sp) => creditorPayments(range(sp)) },
  "account-range": {
    screen: "reports",
    build: (sp) => accountRange({ ...range(sp), fromCode: opt(sp, "fromCode"), toCode: opt(sp, "toCode") }),
  },
  "batch-transactions": { screen: "reports", build: (sp) => batchTransactions({ batch: opt(sp, "batch") }) },
};

export const EXPORTS: Record<string, ExportDef> = {
  ...REPORT_EXPORTS,
  ...MORE_REPORT_EXPORTS,
  ...LIST_EXPORTS,
  ...BANK_EXPORTS,
};
