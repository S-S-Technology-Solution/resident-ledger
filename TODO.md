Phase 1 — Accounting Core
Chart of Accounts

Add new account (account code, account name, account type)
Edit account name and code
Deactivate account (cannot delete if already used in journal)
View full account list filterable by type
Pre-load default chart of accounts on first setup (Bank, Cash, AR, Security Fee Income, Security Fee Expense, Electricity, etc.)

Journal Entry

Create new journal entry (date, description, reference number)
Add multiple debit and credit lines per entry (select account, enter amount)
Real-time running total showing debit vs credit — must balance before saving
Save as draft (not yet posted, still editable)
Post entry (locks the entry, cannot edit after this)
Void a posted entry (system creates an automatic reversal entry, original is never deleted)
View journal entry list (filter by date range, reference number, status)
View single journal entry detail (all debit and credit lines)
Search journal entries by description or reference

Reports

General Ledger report — select account + date range, shows every transaction line with running balance
Trial Balance report — select date range, shows all accounts with total debit and credit columns, confirms they match
Profit & Loss report — select date range, shows all income accounts vs all expense accounts, calculates net profit or loss
Balance Sheet report — select as-at date, shows assets / liabilities / equity, net profit from P&L flows into equity automatically
Export any report to PDF
Export any report to Excel

System Setup

Association name, registration number, address (used in report headers)
Financial year start month setting
Default currency (RM)
Admin login with password


Phase 2 — Receipt Shortcut
Resident Management

Add resident record (unit address, owner name, phone number)
Edit resident record
Deactivate resident (move out)
View resident list with search by address or name
Set monthly fee rate per resident unit

Charge Generation

Manually add a charge to a resident (amount, description, month)
Bulk generate monthly charges for all active residents for a selected month
View charge history per resident
Cancel or reverse a wrongly posted charge

Payment & Receipt

Select resident to receive payment
View resident current outstanding balance before entering payment
Enter payment amount, date, payment method (cash or bank transfer)
Select which months the payment is covering
System auto-validates amount does not exceed outstanding balance (warn if overpayment)
System auto-creates journal entry — debit Bank or Cash, credit Residents AR
Auto-assign next running receipt number
Generate printable official receipt (association header, receipt number, resident name, unit, amount in words, payment period, date, treasurer label)
Reprint past receipt by receipt number
Void a receipt (with reason) — system auto-reverses the journal entry
Search receipts by date, resident, or receipt number

AR Reports

AR balance per resident — current outstanding amount
AR Ageing Summary — all residents with columns Current, 1–30, 31–60, 61–90, over 90 days
Collection report — total billed vs total collected for a selected month or year
Payment history report per resident
Export AR ageing to PDF and Excel


Phase 3 — Expense Shortcut
Supplier Management

Add supplier record (company name, contact person, phone, bank account)
Edit supplier record
Deactivate supplier
View supplier list

Expense Recording

Record new expense bill (supplier, date, invoice number, amount, expense category)
Expense categories pre-loaded from your P&L (Security Fees, Electricity, Gardener Wages, Meeting Expenses, Printing & Stationery, Refreshment, Travelling, Chairman Allowance, Treasurer Allowance, Upkeep & Maintenance, Service Tax, Accounting Fees, Depreciation, Bad Debt Written Off)
Add or rename expense categories
System auto-creates journal entry — debit Expense account, credit Trade Creditor (AP)
Mark bill as paid — enter payment date and bank reference, system auto-creates journal entry debit Trade Creditor, credit Bank
Partially pay a bill
View all bills with status (unpaid / partially paid / paid)
Search bills by supplier, date, or invoice number

AP Reports

AP Ageing — unpaid bills listed by age (like your Valiant Force RM 15,415.92)
Expense report by category for a date range (matches your P&L format)
Expense report by supplier for a date range
Export to PDF and Excel