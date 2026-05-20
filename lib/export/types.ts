export type Align = "left" | "right" | "center";

export type Column = {
  key: string;
  header: string;
  align?: Align;
  width?: number;        // proportional weight for PDF; pixels (~7px/char) for xlsx
  money?: boolean;
};

export type ReportData = {
  title: string;
  subtitle?: string;
  associationName: string;
  generatedAt: Date;
  columns: Column[];
  rows: Record<string, string | number | null>[];
  totals?: Record<string, string | number | null>;
};
