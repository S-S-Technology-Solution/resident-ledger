import { fmtAcct, type FinancialStatement } from "@/lib/financial-statements";

/** A financial statement laid out as the accountant prints it. */
export function FinancialStatementView({ fs }: { fs: FinancialStatement }) {
  const cols = fs.showPct ? 3 : 2;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr><th colSpan={cols} className="px-3 pt-1 text-left text-base font-bold">{fs.associationName}</th></tr>
        <tr><th colSpan={cols} className="px-3 text-left font-bold">{fs.title}</th></tr>
        <tr><th colSpan={cols} className="px-3 pb-4 text-left font-bold">{fs.period}</th></tr>
        <tr className="bg-muted/60">
          <th />
          <th className="w-40 px-3 py-1.5 text-right font-semibold">
            {fs.amountHeading.map((h) => <div key={h}>{h}</div>)}
          </th>
          {fs.showPct && <th className="w-24 px-3 py-1.5 text-right font-semibold">%</th>}
        </tr>
      </thead>
      <tbody>
        {fs.rows.map((r, i) => {
          if (r.gap) return <tr key={i}><td colSpan={cols} className="h-3" /></tr>;
          if (r.heading) return <tr key={i}><td colSpan={cols} className="px-3 pt-2 pb-1 font-semibold">{r.label}</td></tr>;
          const rule =
            r.rule === "above" ? "border-t border-foreground"
            : r.rule === "double" ? "border-t border-b-[3px] border-double border-foreground"
            : "";
          return (
            <tr key={i} className={r.bold ? "font-semibold" : ""}>
              <td className={`py-1 pr-3 ${r.indent ? "pl-8" : "pl-3"}`}>{r.label}</td>
              <td className="px-3 py-0">
                {r.amount && <div className={`py-1 text-right font-mono tabular ${rule}`}>{fmtAcct(r.amount)}</div>}
              </td>
              {fs.showPct && (
                <td className="px-3 py-1 text-right font-mono tabular">
                  {r.pct != null ? `${r.pct.toFixed(2)}%` : ""}
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
