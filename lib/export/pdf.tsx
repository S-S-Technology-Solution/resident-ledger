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
  th: { fontFamily: "Helvetica-Bold", fontSize: 9 },
  row: { flexDirection: "row", paddingVertical: 4, paddingHorizontal: 4, borderBottomWidth: 0.25, borderColor: "#e5e7eb" },
  cell: { fontSize: 9 },
  totalsRow: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderColor: "#111827",
    marginTop: 2,
  },
  totalsCell: { fontSize: 9, fontFamily: "Helvetica-Bold" },
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
      <Page size="A4" style={styles.page} wrap>
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
          <View style={styles.row} key={i} wrap={false}>
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

        <View style={styles.footer} fixed>
          <Text>{data.associationName}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}
