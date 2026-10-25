import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { ReportData } from "./types";

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

export async function buildPdf(data: ReportData): Promise<Buffer> {
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
