import ExcelJS from "exceljs";
import type { ReportData } from "./types";

export async function buildXlsx(data: ReportData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ResidentLedger";
  wb.created = data.generatedAt;
  const sheetName = data.title.replace(/[*?:\\/\[\]]/g, "-").slice(0, 31);
  const ws = wb.addWorksheet(sheetName);

  ws.columns = data.columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width ?? Math.max(12, c.header.length + 4),
    style: {
      alignment: { horizontal: c.align ?? (c.money ? "right" : "left") },
      ...(c.money ? { numFmt: "#,##0.00;(#,##0.00)" } : {}),
    },
  }));

  // Header rows above the table
  ws.spliceRows(1, 0,
    [data.associationName],
    [data.title],
    ...(data.subtitle ? [[data.subtitle]] : []),
    [`Generated ${data.generatedAt.toISOString().slice(0, 10)}`],
    [],
  );

  const titleRow = ws.getRow(1);
  titleRow.font = { bold: true, size: 14 };
  ws.getRow(2).font = { bold: true, size: 12 };

  // Re-set columns header row offset is automatic; exceljs handles spliceRows + columns separately
  // Reset header style for the actual data header row (after the inserted rows)
  const tableHeaderRowIndex = 5 + (data.subtitle ? 1 : 0);
  const headerRow = ws.getRow(tableHeaderRowIndex);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE6F4EE" } };
    cell.border = { bottom: { style: "thin", color: { argb: "FF888888" } } };
  });

  // Data rows
  for (const r of data.rows) ws.addRow(r);

  // Totals
  if (data.totals) {
    const totalsRow = ws.addRow(data.totals);
    totalsRow.font = { bold: true };
    totalsRow.eachCell((cell) => {
      cell.border = { top: { style: "thin", color: { argb: "FF000000" } } };
    });
  }

  const ab = await wb.xlsx.writeBuffer();
  return Buffer.from(ab);
}
