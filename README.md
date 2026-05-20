# ResidentLedger

Accounting application for residents associations. Phase 1 (this scaffold) covers the accounting core:
Chart of Accounts, double-entry Journal, and the four core reports — Trial Balance, General Ledger,
Profit & Loss, Balance Sheet.

## Stack

- **Next.js 16** (App Router, TypeScript, React 19)
- **Postgres** via **Prisma 7** (driver adapter `@prisma/adapter-pg`)
- **shadcn/ui** + Tailwind v4
- **decimal.js** for money (DB column type: `NUMERIC(15,2)`)
- **Zod** for validation, **sonner** for toasts

## Getting started

1. **Provision a Postgres database.** Recommended: a Neon free database via the Vercel Marketplace,
   or `docker run -e POSTGRES_PASSWORD=… -p 5432:5432 postgres:16`.

2. **Set the connection string** in `.env`:
   ```
   DATABASE_URL="postgresql://USER:PASS@HOST:5432/DB?schema=public"
   ```

3. **Push the schema and seed:**
   ```bash
   npm run db:push
   npm run db:seed
   ```
   This creates the default Association ("Taman Sunway Cheras Residents Association"), seeds the
   chart of accounts from the real Trial Balance, and creates an admin user
   (`admin@example.com` / `changeme` — placeholder; auth not yet wired into pages).

4. **Run the app:**
   ```bash
   npm run dev
   ```

## What's implemented (Phase 1)

| Area | Page |
|---|---|
| Chart of Accounts | `/accounts` — list, filter by type, create, edit, deactivate (blocked if used) |
| Journal | `/journal`, `/journal/new`, `/journal/[id]` — multi-line debit/credit, live balance, draft → post, void creates reversal |
| Trial Balance | `/reports/trial-balance` |
| General Ledger | `/reports/general-ledger` |
| Profit & Loss | `/reports/profit-loss` |
| Balance Sheet | `/reports/balance-sheet` |

## What's implemented (Phase 2)

| Area | Page |
|---|---|
| Residents | `/residents`, `/residents/[id]` — CRUD + balance, open charges, payment history |
| Charges | `/charges`, `/charges/new` + Bulk generate dialog — per-charge JE (DR AR / CR Income) |
| Receipts | `/receipts`, `/receipts/new`, `/receipts/[id]` — FIFO auto-allocate, printable Official Receipt, void with reversal (DR Bank/Cash / CR AR) |
| A/R Ageing | `/reports/ar-ageing` — Current / 1-30 / 31-60 / 61-90 / >90 |
| Collection | `/reports/collection` — Billed vs collected for a period |

## What's implemented (Phase 3)

| Area | Page |
|---|---|
| Suppliers | `/suppliers` — CRUD with outstanding balance per supplier |
| Bills | `/bills`, `/bills/new`, `/bills/[id]` — record bill (DR Expense / CR Trade Creditor), status filters, void with reversal |
| Bill payments | full / partial via "Pay" dialog on bill page (DR Trade Creditor / CR Bank or Cash); bill status auto-transitions UNPAID → PARTIAL → PAID; void payment reopens balance |
| A/P Ageing | `/reports/ap-ageing` |
| Expense reports | `/reports/expense-by-category`, `/reports/expense-by-supplier` |

## What's next

- Auth (login wall), PDF/Excel export buttons on each report, multi-association support
- Opening balances journal from the prior-year TB

## Design notes

- All money columns are `Decimal @db.Decimal(15, 2)`. App-side math uses `decimal.js`. No floats.
- Posted journal entries are immutable. "Void" creates a new reversing entry and marks the original `VOIDED`.
- Entry numbering: `JE-YYYY-NNNNN`, per-association, gap-free in practice.
