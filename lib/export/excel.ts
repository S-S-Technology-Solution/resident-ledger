import ExcelJS from "exceljs";
import type { ReportData } from "./types";

/** The Million-style statement: centred heading, ruled account line, no column headings. */
async function statementXlsx(data: ReportData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ResidentLedger";
  const ws = wb.addWorksheet(data.title.replace(/[*?:\\/\[\]]/g, "-").slice(0, 31));
  const n = data.columns.length;
  ws.columns = data.columns.map((c) => ({
    key: c.key,
    width: c.width ? Math.round(c.width * 11) : 14,
    style: { alignment: { horizontal: c.align ?? (c.money ? "right" : "left") }, ...(c.money ? { numFmt: "#,##0.00;(#,##0.00)" } : {}) },
  }));
  const centred = (text: string, size: number) => {
    const row = ws.addRow([text]);
    ws.mergeCells(row.number, 1, row.number, n);
    row.getCell(1).alignment = { horizontal: "center" };
    row.font = { bold: true, size };
  };
  centred(data.title, 14);
  if (data.subtitle) centred(data.subtitle, 11);
  ws.addRow([]);
  const top = ws.addRow([data.associationName.toUpperCase()]);
  top.font = { bold: true };
  if (data.accountLine) {
    const acc = ws.addRow([data.accountLine.left]);
    acc.getCell(n).value = data.accountLine.right;
    acc.getCell(n).alignment = { horizontal: "right" };
    acc.font = { bold: true };
    for (let c = 1; c <= n; c++) acc.getCell(c).border = { bottom: { style: "thin" } };
  }
  for (const { __style, ...r } of data.rows) {
    if (__style === "label" || __style === "grand") ws.addRow([]);
    const row = ws.addRow(r);
    // A title line runs across every column but the figure.
    if (__style === "label" || __style === "grand") ws.mergeCells(row.number, 1, row.number, n - 1);
    const figure = row.getCell(n);
    if (__style === "item") row.getCell(1).alignment = { indent: 1 };
    if (__style === "subtotal" && figure.value !== "") figure.border = { top: { style: "thin" } };
    if (__style === "grand") {
      for (let c = 1; c <= n; c++) row.getCell(c).border = { top: { style: "thin" } };
      figure.border = { top: { style: "thin" }, bottom: { style: "double" } };
    }
  }
  ws.pageSetup.orientation = data.landscape ? "landscape" : "portrait";
  ws.pageSetup.fitToPage = true;
  ws.pageSetup.fitToWidth = 1;
  ws.pageSetup.fitToHeight = 0;
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function buildXlsx(data: ReportData): Promise<Buffer> {
  if (data.layout === "statement") return statementXlsx(data);
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

  // Data rows; `__style` is not a column, only how the row looks.
  for (const { __style, ...r } of data.rows) {
    const row = ws.addRow(r);
    if (__style === "heading") {
      row.font = { bold: true };
      row.eachCell({ includeEmpty: true }, (cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } }; });
    } else if (__style === "total") {
      row.font = { bold: true };
      row.eachCell((cell) => { cell.border = { top: { style: "thin", color: { argb: "FF000000" } } }; });
    } else if (__style === "muted") {
      row.font = { color: { argb: "FF6B7280" } };
    } else if (__style === "item") {
      row.getCell(1).alignment = { indent: 2 };
    }
  }

  // Totals
  if (data.totals) {
    const totalsRow = ws.addRow(data.totals);
    totalsRow.font = { bold: true };
    totalsRow.eachCell((cell) => {
      cell.border = { top: { style: "thin", color: { argb: "FF000000" } } };
    });
  }

  if (data.signatures?.length) {
    ws.addRow([]); ws.addRow([]);
    ws.addRow(data.signatures.map((s) => `${s}: ____________________`));
  }
  if (data.landscape) ws.pageSetup.orientation = "landscape";

  const ab = await wb.xlsx.writeBuffer();
  return Buffer.from(ab);
}
