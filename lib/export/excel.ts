import ExcelJS from "exceljs";
import type { ReportData } from "./types";
import type { FinancialStatement } from "../financial-statements";
import type { StatementAsAt } from "../resident-statement";

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

/** Statement of income and expenditure / financial position, as the accountant lays it out. */
async function financialXlsx(fs: FinancialStatement, title: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ResidentLedger";
  const ws = wb.addWorksheet(title.replace(/[*?:\\/\[\]]/g, "-").slice(0, 31));
  ws.columns = [
    { width: 55 },
    { width: 17, style: { alignment: { horizontal: "right" }, numFmt: "#,##0.00;(#,##0.00)" } },
    ...(fs.showPct ? [{ width: 10, style: { alignment: { horizontal: "right" as const }, numFmt: '0.00"%"' } }] : []),
  ];
  const n = fs.showPct ? 3 : 2;
  ws.addRow([fs.associationName]).font = { bold: true, size: 13 };
  ws.addRow([fs.title]).font = { bold: true };
  ws.addRow([fs.period]).font = { bold: true };
  ws.addRow([]);
  fs.amountHeading.forEach((h, i) => {
    const row = ws.addRow(["", h, ...(fs.showPct && i === fs.amountHeading.length - 1 ? ["%"] : [])]);
    row.font = { bold: true };
    for (let c = 1; c <= n; c++) {
      row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF5F1" } };
      if (c > 1) row.getCell(c).alignment = { horizontal: "right" };
    }
  });
  for (const r of fs.rows) {
    if (r.gap) { ws.addRow([]); continue; }
    if (r.heading) { ws.addRow([r.label]).font = { bold: true }; continue; }
    const row = ws.addRow([r.label ?? "", r.amount?.toNumber() ?? null, ...(fs.showPct ? [r.pct?.toDecimalPlaces(2).toNumber() ?? null] : [])]);
    if (r.bold) row.font = { bold: true };
    if (r.indent) row.getCell(1).alignment = { indent: 2 };
    const fig = row.getCell(2);
    if (r.rule === "above") fig.border = { top: { style: "thin" } };
    if (r.rule === "double") fig.border = { top: { style: "thin" }, bottom: { style: "double" } };
  }
  ws.pageSetup.orientation = "portrait";
  ws.pageSetup.fitToPage = true;
  ws.pageSetup.fitToWidth = 1;
  ws.pageSetup.fitToHeight = 0;
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** A resident's statement of account, as the accountant's print lays it out. */
async function statementOfAccountXlsx(s: StatementAsAt, title: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ResidentLedger";
  const ws = wb.addWorksheet(title.replace(/[*?:\\/\[\]]/g, "-").slice(0, 31));
  const numFmt = "#,##0.00;(#,##0.00)";
  ws.columns = [{ width: 13 }, { width: 14 }, { width: 38 }, { width: 14 }, { width: 14 }, { width: 14 }];
  const n = 6;
  const centred = (text: string, bold = false, size = 11) => {
    const row = ws.addRow([text]);
    ws.mergeCells(row.number, 1, row.number, n);
    row.getCell(1).alignment = { horizontal: "center" };
    row.font = { bold, size };
  };
  const right = (cell: ExcelJS.Cell) => { cell.alignment = { horizontal: "right" }; };
  centred(s.association.name, true, 14);
  if (s.association.registrationNo) centred(s.association.registrationNo);
  if (s.association.address) centred(s.association.address);
  ws.addRow([]);
  const party = ws.addRow([s.resident.name, "", "", "", "", "STATEMENT OF ACCOUNT"]);
  party.font = { bold: true };
  right(party.getCell(n));
  ws.addRow([s.resident.unit]);
  ws.addRow([]);
  const infoHead = ws.addRow(["", "", "", "", "MONTH", "DATE"]);
  infoHead.font = { bold: true };
  const info = ws.addRow([s.resident.code ?? "", "", "", "", s.month, s.date]);
  for (const row of [infoHead, info]) { right(row.getCell(5)); right(row.getCell(6)); }
  const head = ws.addRow(["DATE", "REF NO.", "DESCRIPTION", `DEBIT ${s.association.currency}`, `CREDIT ${s.association.currency}`, `BALANCE ${s.association.currency}`]);
  head.font = { bold: true };
  for (let c = 1; c <= n; c++) head.getCell(c).border = { top: { style: "thin" }, bottom: { style: "thin" } };
  for (const c of [4, 5, 6]) right(head.getCell(c));
  for (const r of s.rows) {
    const row = ws.addRow([
      r.date.toISOString().slice(0, 10).split("-").reverse().join("/"), r.refNo, r.description,
      r.debit.gt(0) ? r.debit.toNumber() : null, r.credit.gt(0) ? r.credit.toNumber() : null, r.balance.toNumber(),
    ]);
    for (const c of [4, 5, 6]) row.getCell(c).numFmt = numFmt;
    if (r.detail) ws.addRow(["", "", r.detail]).getCell(3).font = { italic: true };
  }
  ws.addRow([]);
  ws.addRow([`RINGGIT M'SIA : ${s.words}`]).font = { bold: true };
  const closing = ws.addRow(["", "", "", "", "", s.closing.toNumber()]);
  closing.font = { bold: true };
  closing.getCell(n).numFmt = numFmt;
  for (let c = 1; c <= n; c++) closing.getCell(c).border = { top: { style: "thin" } };
  const boxed: Partial<ExcelJS.Borders> = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
  const labels = ws.addRow(s.ageing.map((a) => a.label));
  const amounts = ws.addRow(s.ageing.map((a) => a.amount.toNumber()));
  for (let c = 1; c <= n; c++) {
    right(labels.getCell(c));
    labels.getCell(c).border = boxed;
    amounts.getCell(c).border = boxed;
    amounts.getCell(c).numFmt = numFmt;
  }
  ws.addRow(["We shall be grateful if you will let us have payment as soon as possible."]);
  ws.addRow(["Any discrepancy in this statement please inform us in writing within 10 days."]);
  ws.pageSetup.orientation = "portrait";
  ws.pageSetup.fitToPage = true;
  ws.pageSetup.fitToWidth = 1;
  ws.pageSetup.fitToHeight = 0;
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function buildXlsx(data: ReportData): Promise<Buffer> {
  if (data.layout === "statement-of-account" && data.statementOfAccount) return statementOfAccountXlsx(data.statementOfAccount, data.title);
  if (data.layout === "financial" && data.financial) return financialXlsx(data.financial, data.title);
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
