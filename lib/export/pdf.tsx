import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { ReportData } from "./types";
import { fmtAcct, type FinancialStatement } from "../financial-statements";

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 9, fontFamily: "Helvetica", color: "#111827" },
  header: { marginBottom: 12 },
  brand: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#065f46" },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold", marginTop: 2 },
  subtitle: { fontSize: 9, color: "#6b7280", marginTop: 1 },
  generated: { fontSize: 8, color: "#9ca3af", marginTop: 4 },
  tableHead: {
    flexDirection: "row",
    backgroundColor: "#ecfdf5",
    borderBottomWidth: 0.5,
    borderColor: "#6b7280",
    paddingVertical: 5,
    paddingHorizontal: 4,
  },
  th: { fontFamily: "Helvetica-Bold", fontSize: 9, paddingHorizontal: 3 },
  row: { flexDirection: "row", paddingVertical: 4, paddingHorizontal: 4, borderBottomWidth: 0.25, borderColor: "#e5e7eb" },
  // Side padding keeps a right-aligned figure clear of the next column's text.
  cell: { fontSize: 9, paddingHorizontal: 3 },
  totalsRow: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderColor: "#111827",
    marginTop: 2,
  },
  totalsCell: { fontSize: 9, fontFamily: "Helvetica-Bold", paddingHorizontal: 3 },
  headingRow: { backgroundColor: "#f3f4f6", borderBottomWidth: 0.5, borderColor: "#9ca3af", marginTop: 4 },
  subtotalRow: { borderTopWidth: 0.75, borderColor: "#111827", borderBottomWidth: 0.25 },
  bold: { fontFamily: "Helvetica-Bold" },
  muted: { color: "#6b7280" },
  signatures: { flexDirection: "row", gap: 24, marginTop: 48 },
  signature: { flex: 1, borderTopWidth: 0.75, borderColor: "#6b7280", paddingTop: 4, fontSize: 8, color: "#374151" },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 28,
    right: 28,
    fontSize: 8,
    color: "#9ca3af",
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

function formatMoney(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const st = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 40, paddingHorizontal: 36, fontSize: 9, fontFamily: "Helvetica", color: "#000" },
  title: { fontSize: 15, fontFamily: "Helvetica-Bold", textAlign: "center" },
  subtitle: { fontSize: 10, fontFamily: "Helvetica-Bold", textAlign: "center", marginTop: 6 },
  top: { flexDirection: "row", justifyContent: "space-between", marginTop: 22 },
  bold: { fontFamily: "Helvetica-Bold" },
  account: { flexDirection: "row", justifyContent: "space-between", marginTop: 14, paddingBottom: 5, borderBottomWidth: 0.75, borderColor: "#000" },
  row: { flexDirection: "row", paddingVertical: 3 },
  cell: { fontSize: 9, paddingHorizontal: 2 },
});

/** An accountant's statement in the Million style: centred heading, ruled account line, no column headings. */
function statementPdf(data: ReportData) {
  const totalWeight = data.columns.reduce((s, c) => s + (c.width ?? 1), 0);
  const flex = (c: { width?: number }) => ({ flex: (c.width ?? 1) / totalWeight });
  const last = data.columns.length - 1;
  return (
    <Document title={data.title} author="ResidentLedger">
      <Page size="A4" orientation={data.landscape ? "landscape" : "portrait"} style={st.page} wrap>
        <Text style={st.title}>{data.title}</Text>
        {data.subtitle && <Text style={st.subtitle}>{data.subtitle}</Text>}
        <View style={st.top} fixed>
          <Text style={st.bold}>{data.associationName.toUpperCase()}</Text>
          <Text render={({ pageNumber }) => `Page ${pageNumber}`} />
        </View>
        {data.accountLine && (
          <View style={st.account} fixed>
            <Text style={st.bold}>{data.accountLine.left}</Text>
            <Text style={st.bold}>{data.accountLine.right}</Text>
          </View>
        )}
        {data.rows.map((r, i) => {
          const label = r.__style === "label" || r.__style === "grand";
          return (
            <View
              key={i}
              wrap={false}
              style={[
                st.row,
                label ? { marginTop: 8 } : {},
                r.__style === "grand" ? { borderTopWidth: 0.75, borderColor: "#000", paddingTop: 5 } : {},
              ]}
            >
              {/* A title line runs across every column but the figure. */}
              {label && (
                <Text style={[st.cell, { flex: 1 - (data.columns[last].width ?? 1) / totalWeight }]}>{String(r[data.columns[0].key] ?? "")}</Text>
              )}
              {data.columns.map((c, ci) => {
                if (label && ci < last) return null;
                const raw = r[c.key];
                const val = c.money ? formatMoney(raw) : raw == null ? "" : String(raw);
                const figure = ci === last;
                // Double underline: the figure's own rule plus a second one just below it.
                if (figure && r.__style === "grand" && val) {
                  return (
                    <View key={c.key} style={[flex(c), { borderBottomWidth: 0.75, borderColor: "#000", paddingBottom: 1.5 }]}>
                      <Text style={[st.cell, { textAlign: "right", borderBottomWidth: 0.75, borderColor: "#000", paddingBottom: 2 }]}>{val}</Text>
                    </View>
                  );
                }
                return (
                  <Text
                    key={c.key}
                    style={[
                      st.cell,
                      flex(c),
                      { textAlign: c.align ?? (c.money ? "right" : "left") },
                      r.__style === "item" && ci === 0 ? { paddingLeft: 10 } : {},
                      figure && r.__style === "subtotal" && val ? { borderTopWidth: 0.75, borderColor: "#000", paddingTop: 3 } : {},
                    ]}
                  >
                    {val}
                  </Text>
                );
              })}
            </View>
          );
        })}
      </Page>
    </Document>
  );
}

const fin = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 44, paddingHorizontal: 44, fontSize: 9.5, fontFamily: "Helvetica", color: "#000" },
  name: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  line: { fontSize: 10, fontFamily: "Helvetica-Bold", marginTop: 3 },
  head: { flexDirection: "row", marginTop: 16, marginBottom: 4, backgroundColor: "#eef5f1", paddingVertical: 3 },
  row: { flexDirection: "row", alignItems: "flex-start" },
  label: { flex: 1, paddingVertical: 2.5, paddingHorizontal: 3 },
  amount: { width: 110, paddingHorizontal: 3 },
  pct: { width: 60, paddingHorizontal: 3, paddingVertical: 2.5, textAlign: "right" },
  figure: { textAlign: "right", paddingVertical: 2.5 },
  bold: { fontFamily: "Helvetica-Bold" },
  footer: { position: "absolute", bottom: 20, right: 44, fontSize: 8, color: "#6b7280" },
});

/** Statement of income and expenditure / financial position, as the accountant lays it out. */
function financialPdf(fs: FinancialStatement, title: string) {
  const rule = { borderColor: "#000", borderTopWidth: 0.75 };
  return (
    <Document title={title} author="ResidentLedger">
      <Page size="A4" style={fin.page} wrap>
        <Text style={fin.name}>{fs.associationName}</Text>
        <Text style={fin.line}>{fs.title}</Text>
        <Text style={fin.line}>{fs.period}</Text>
        <View style={fin.head}>
          <Text style={fin.label} />
          <View style={fin.amount}>
            {fs.amountHeading.map((h) => <Text key={h} style={[fin.figure, fin.bold, { paddingVertical: 1 }]}>{h}</Text>)}
          </View>
          {fs.showPct && <Text style={[fin.pct, fin.bold, { alignSelf: "flex-end", paddingVertical: 1 }]}>%</Text>}
        </View>
        {fs.rows.map((r, i) => {
          if (r.gap) return <View key={i} style={{ height: 8 }} />;
          if (r.heading) return <Text key={i} style={[fin.bold, { paddingHorizontal: 3, paddingTop: 4, paddingBottom: 2.5 }]}>{r.label}</Text>;
          const bold = r.bold ? fin.bold : {};
          const value = r.amount ? fmtAcct(r.amount) : "";
          return (
            <View key={i} style={fin.row} wrap={false}>
              <Text style={[fin.label, bold, r.indent ? { paddingLeft: 16 } : {}]}>{r.label ?? ""}</Text>
              <View style={fin.amount}>
                {r.rule === "double" ? (
                  // Double underline: the figure's own rule plus a second one just below it.
                  <View style={{ borderBottomWidth: 0.75, borderColor: "#000", paddingBottom: 1.5 }}>
                    <Text style={[fin.figure, bold, rule, { borderBottomWidth: 0.75 }]}>{value}</Text>
                  </View>
                ) : (
                  <Text style={[fin.figure, bold, r.rule ? rule : {}]}>{value}</Text>
                )}
              </View>
              {fs.showPct && <Text style={[fin.pct, bold]}>{r.pct != null ? `${r.pct.toFixed(2)}%` : ""}</Text>}
            </View>
          );
        })}
        <Text style={fin.footer} fixed render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
      </Page>
    </Document>
  );
}

export async function buildPdf(data: ReportData): Promise<Buffer> {
  if (data.layout === "financial" && data.financial) return renderToBuffer(financialPdf(data.financial, data.title));
  if (data.layout === "statement") return renderToBuffer(statementPdf(data));
  const totalWeight = data.columns.reduce((s, c) => s + (c.width ?? 1), 0);
  const flex = (c: { width?: number }) => ({ flex: (c.width ?? 1) / totalWeight });

  const doc = (
    <Document title={data.title} author="ResidentLedger">
      <Page size="A4" orientation={data.landscape ? "landscape" : "portrait"} style={styles.page} wrap>
        <View style={styles.header}>
          <Text style={styles.brand}>{data.associationName}</Text>
          <Text style={styles.title}>{data.title}</Text>
          {data.subtitle && <Text style={styles.subtitle}>{data.subtitle}</Text>}
          <Text style={styles.generated}>
            Generated {data.generatedAt.toISOString().slice(0, 16).replace("T", " ")}
          </Text>
        </View>

        <View style={styles.tableHead} fixed>
          {data.columns.map((c) => (
            <Text
              key={c.key}
              style={[
                styles.th,
                flex(c),
                { textAlign: c.align ?? (c.money ? "right" : "left") },
              ]}
            >
              {c.header}
            </Text>
          ))}
        </View>

        {data.rows.map((r, i) => (
          <View
            style={[styles.row, r.__style === "heading" ? styles.headingRow : {}, r.__style === "total" ? styles.subtotalRow : {}]}
            key={i}
            wrap={false}
          >
            {data.columns.map((c) => {
              const raw = r[c.key];
              const val = c.money ? formatMoney(raw) : raw == null ? "" : String(raw);
              return (
                <Text
                  key={c.key}
                  style={[
                    styles.cell,
                    flex(c),
                    { textAlign: c.align ?? (c.money ? "right" : "left") },
                    r.__style === "heading" || r.__style === "total" ? styles.bold : {},
                    r.__style === "muted" ? styles.muted : {},
                    r.__style === "item" && c === data.columns[0] ? { paddingLeft: 14 } : {},
                  ]}
                >
                  {val}
                </Text>
              );
            })}
          </View>
        ))}

        {data.totals && (
          <View style={styles.totalsRow} wrap={false}>
            {data.columns.map((c) => {
              const raw = data.totals![c.key];
              const val = c.money ? formatMoney(raw) : raw == null ? "" : String(raw);
              return (
                <Text
                  key={c.key}
                  style={[
                    styles.totalsCell,
                    flex(c),
                    { textAlign: c.align ?? (c.money ? "right" : "left") },
                  ]}
                >
                  {val}
                </Text>
              );
            })}
          </View>
        )}

        {data.signatures?.length ? (
          <View style={styles.signatures} wrap={false}>
            {data.signatures.map((s) => <Text key={s} style={styles.signature}>{s}</Text>)}
          </View>
        ) : null}

        <View style={styles.footer} fixed>
          <Text>{data.associationName}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}
