# Function checklist — Million accounting system vs ResidentLedger

Every function seen in the `newdocs/` walkthrough, checked against ResidentLedger.

- `[x]` = we have it
- `[ ]` = we do not have it
- `~` = partly there, noted alongside
- `N/A` = not applicable to a residents association (trading, manufacturing,
  projects, agents, tax)

Items marked **new** were built in this pass.

---

## General

- [x] GL Accounts — create/maintain chart of accounts
- [x] A/C Opening Balance — balances brought forward from the previous system — **new**
- [x] Maintain Batch / Generate Batch — monthly batches per group — **new**
- [x] GL Transaction — double-entry posting
- [x] Print Transaction — journal listing and detail
- N/A Maintain Stock Value — trading only

## Account numbering

- [x] Two-part debtor account (control / sub, e.g. 3000/A01)
- [x] Two-part creditor account (e.g. 4000/001) — **new**
- [x] Account groups
- [x] Default control accounts — set under Settings › Control Accounts — **new**

## Cash Book

- [x] Receipt not tied to a debtor — **new**
- [x] Payment not tied to a creditor — **new**
- [x] Bank Reconciliation — now includes cash book entries — **new**
- [x] Print Receipt
- [x] Print Payment Voucher — **new**
- [x] Print Cheque — **new**

## Debtors

Entry:

- [x] Debtor maintenance — create/edit resident account
- [x] Debtor B/F transaction — opening balance per resident — **new**
- [x] Sales invoice
- [x] Receive Payment with invoice knock-off
- [x] Cheque return — reverses the receipt, reopens the invoices, posts the bank fee — **new**

Reports:

- [x] Debtors Statement
- [x] Debtors Aging
- [x] Debtors Payment Due — **new**
- [x] List Debtors Payment
- [x] List Paid Bills (debtor side) — **new**
- [x] List Unpaid Bills (debtor side) — **new**
- [x] Print Official Receipt (A/R)
- [x] Debtors Collection Report
- ~ Debtors Outstanding Balance Report — the ageing report covers most of this
- [x] Print Debtors Ledger — **new**
- [x] Debtors Sales Report — **new**
- N/A Top Customer / Agent Sales / Agent Commission

## Creditors

Entry:

- [x] Creditor maintenance — create/edit supplier
- [x] Creditor B/F transaction — opening balance per supplier — **new**
- [x] Purchase invoice
- [x] Payment to creditor

Reports:

- [x] Remittance Advice — **new**
- [x] Creditors Aging
- [x] Creditors Payment Due — **new**
- [x] List Creditors Payment — **new**
- [x] List Paid Bills — **new**
- [x] List Unpaid Bills — **new**
- [x] Print Payment Voucher (A/P) — **new**
- ~ Creditors Outstanding Balance Report — the ageing report covers most of this
- [x] Print Creditors Ledger — **new**
- ~ Creditors Purchase Report — expense-by-supplier is close
- ~ Top Supplier Report — expense-by-supplier is close

## Reports

- [x] Trial Balance
- [x] Profit & Loss
- [x] Balance Sheet
- [x] General Ledger
- [x] Export to PDF and Excel
- [x] Cash Flow Statement — **new**
- [x] Print Batch of Transaction — **new**
- [x] Fixed Assets Report — **new**
- N/A Gain/Loss Report — this is foreign-exchange gain or loss; everything here is in MYR
- [x] Print Range of Accounts — **new**
- [x] Transaction Voucher Listing — folded into Check Transaction — **new**
- [x] Audit Transaction — **new**
- N/A Manufacturing, Project Ledger, Project Profit, Consolidated Account, Tourism Tax

## Enquiry

- [x] Batch of Transaction — **new**
- [x] 12-Month Transaction Summary — **new**
- ~ 12-Month Payment Due — the payment due listings cover the same ground by date rather than by month
- [x] Check Transaction — **new**
- N/A Check Tax Entry

## Administration / System

- [x] Association details for report headers
- [x] Admin login and password change
- [x] User Account management — **new**
- [x] Roles and permissions — Administrator / Treasurer / View only, enforced on every action — **new**
- [x] Year End Closing — **new**
- [x] Period lock — now enforced on every posting path — **new**
- [x] View Audit Trail — **new**
- [x] Reference numbering — prefix, width and reset period per document type — **new**
- [x] Import / Export Data — CSV import with a dry run, plus PDF and Excel export — **new**
- N/A Backup Database — Neon has point-in-time recovery
- N/A Report Setting, Fonts, Language, Change Key Code, Testing

---

## How the new pieces fit together

**Opening balances** (`/opening-balances`) has three tabs. The general ledger tab
writes a single balancing journal dated at cut-over. The debtor and creditor tabs
hold the subsidiary detail, which carries no journal of its own — posting those
individually would double-count the control accounts and drag prior-year income
into this year's P&L. Each tab shows whether the subsidiary agrees with its
control account, so a half-finished load cannot pass unnoticed.

**Batches** are created automatically the first time anything is posted into a
month, so a posting can never fail for want of a batch. `/batches` also generates
them ahead of time and locks them. Batch numbers follow the existing convention:
year-month plus group code, so Sales for Jan 2026 is `260110`.

**The period lock** was a field in Settings that nothing honoured. Every posting
path now runs through one helper that checks the lock, checks the financial year
is open, and files the entry in its batch — so no path can skip a check.

**Year-end closing** (`/year-end`) zeroes the income and expenditure accounts into
1000/0000 Accumulated Fund, records the surplus, and locks the year. It refuses to
run while unposted drafts remain in the year, and it can be undone.

**Cash book** (`/cash-book`) covers money with no resident or supplier behind it.
Receipts print as receipts, payments as payment vouchers, and both appear in bank
reconciliation alongside everything else.

**Roles** (`/settings/users`) are Administrator, Treasurer and View only. Every
mutating server action calls `requirePosting()` or `requireAdmin()` first — the
gate is in the actions rather than the pages, so it cannot be walked around by
reaching a URL directly. The last administrator cannot demote or deactivate
themselves.

**Cheque return** is deliberately separate from voiding a receipt: the reason
shows on the resident's ledger, the reversal is dated when the bank returned it
rather than today, and the bank's fee posts to 90B1 as a cost to the association
rather than being folded into the reversal.

**Control accounts and numbering** (`/settings/defaults`) were both hardcoded.
Control accounts are now held as account codes on the association, so the chart
of accounts can be reloaded without orphaning the mapping, and saving validates
that every code exists and is active before it takes effect. Document numbering
takes a prefix, width and reset period per document type; changing it only
affects numbers issued from then on.

**CSV import** (`/settings/import`) covers residents, suppliers, debtor opening
balances and the chart of accounts. Checking a file runs the identical code path
with writes switched off, so the preview cannot disagree with the result. Column
names are matched loosely and money parses through thousands separators, currency
prefixes and bracket negatives.

---

## Still open

Every function from the walkthrough is now either built, covered by an equivalent,
or genuinely not applicable. What remains is marked `~` above:

- Outstanding balance reports, debtor and creditor — the ageing reports show the
  same figures bucketed by age, which is more useful than a flat list
- Creditors purchase report and top supplier — expense-by-supplier covers both
- 12-month payment due — the payment due listings cover it by date rather than
  laid out month by month
