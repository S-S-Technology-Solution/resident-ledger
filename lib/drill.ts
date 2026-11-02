/**
 * Where a figure on a report leads when clicked: an account to its general
 * ledger, a ledger line to its entry, a resident or supplier to their ledger.
 */
type Period = { from?: string; to?: string };

const query = (params: Record<string, string | undefined>) =>
  new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1])).toString();

export const glHref = (accountId: string, p: Period = {}) =>
  `/reports/general-ledger?${query({ accountId, from: p.from, to: p.to })}`;

export const entryHref = (entryId: string) => `/reports/entry/${entryId}`;

export const debtorHref = (residentId: string, p: Period = {}) =>
  `/reports/debtor-ledger?${query({ kind: "debtor", id: residentId, from: p.from, to: p.to })}`;

export const creditorHref = (supplierId: string, p: Period = {}) =>
  `/reports/debtor-ledger?${query({ kind: "creditor", id: supplierId, from: p.from, to: p.to })}`;
