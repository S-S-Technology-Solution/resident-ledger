import Decimal from "decimal.js";

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export type Money = Decimal;

type Value = string | number | Decimal | bigint;

export function money(v: Value | null | undefined): Money {
  if (v === null || v === undefined || v === "") return new Decimal(0);
  if (typeof v === "bigint") return new Decimal(v.toString());
  return new Decimal(v as Decimal.Value);
}

export function fmtRM(v: Value | null | undefined): string {
  const d = money(v);
  return d.toNumber().toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function sum(values: (Value | null | undefined)[]): Money {
  return values.reduce<Money>((acc, v) => acc.plus(money(v)), new Decimal(0));
}
