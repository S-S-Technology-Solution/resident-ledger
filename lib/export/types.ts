export type Align = "left" | "right" | "center";

export type Column = {
  key: string;
  header: string;
  align?: Align;
  width?: number;        // proportional weight for PDF; pixels (~7px/char) for xlsx
  money?: boolean;
};

/**
 * A row's look, set with the reserved `__style` key: "heading" for a section
 * title, "total" for a subtotal, "muted" for a note. Not shown as a column.
 * The statement layout uses "label" (a plain line or section title), "item"
 * (an indented detail line), "subtotal" (rule above the last figure) and
 * "grand" (rule across, figure double-underlined).
 */
export type RowStyle = "heading" | "total" | "muted" | "label" | "item" | "subtotal" | "grand";
export type Row = Record<string, string | number | null> & { __style?: RowStyle };

export type ReportData = {
  title: string;
  subtitle?: string;
  associationName: string;
  generatedAt: Date;
  columns: Column[];
  rows: Row[];
  totals?: Record<string, string | number | null>;
  // Wide tables print across the page.
  landscape?: boolean;
  // Sign-off lines printed after the table, e.g. ["Prepared by", "Checked by"].
  signatures?: string[];
  // "statement": an accountant's statement in the style of the old Million
  // reports — centred title, no column headings, a ruled account line
  // (accountLine left / right) above the rows.
  layout?: "table" | "statement" | "financial";
  accountLine?: { left: string; right: string };
  // "financial": the statement of income and expenditure or of financial
  // position, drawn from these rows instead of `columns`/`rows`.
  financial?: import("../financial-statements").FinancialStatement;
};

/** One exportable screen or report: who may download it and how it is built. */
export type ExportDef = {
  screen: import("../screens").ScreenKey;
  build: (sp: URLSearchParams) => Promise<ReportData>;
};
