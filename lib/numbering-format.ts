// Pure number formatting, shared by the server and the numbering settings form.
// Kept apart from numbering.ts so the form does not pull the database client
// into the browser bundle.

export type SequenceReset = "MONTHLY" | "YEARLY" | "NEVER";
export const SEQUENCE_RESETS: SequenceReset[] = ["MONTHLY", "YEARLY", "NEVER"];

export type SequenceConfig = { prefix: string; padding: number; reset: SequenceReset; startAt: number };

/** The fixed part of a number: prefix plus YYMM, YYYY- or nothing. */
export function stemFor(config: Pick<SequenceConfig, "prefix" | "reset">, date: Date) {
  if (config.reset === "MONTHLY") {
    const yy = String(date.getFullYear() % 100).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    return `${config.prefix}${yy}${mm}`;
  }
  if (config.reset === "YEARLY") return `${config.prefix}${date.getFullYear()}-`;
  return config.prefix;
}
