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
 */
export type RowStyle = "heading" | "total" | "muted";
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
};

/** One exportable screen or report: who may download it and how it is built. */
export type ExportDef = {
  screen: import("../screens").ScreenKey;
  build: (sp: URLSearchParams) => Promise<ReportData>;
};
