import { Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtRM } from "@/lib/money";
import { supplierBalances } from "@/lib/ap";
import { SupplierDialog } from "./supplier-dialog";
import { ToggleSupplier } from "./toggle-supplier";
import { PageHeader } from "@/components/page-header";
import { DataCard } from "@/components/data-card";
import { Empty } from "@/components/empty";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const rows = await supplierBalances();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Suppliers"
        description={`${rows.length} ${rows.length === 1 ? "supplier" : "suppliers"}`}
        actions={<SupplierDialog mode="create" />}
      />
      <DataCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Creditor A/C</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead className="text-right">Outstanding</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-mono text-muted-foreground">{s.creditorCode ?? "—"}</TableCell>
                <TableCell>{s.name}</TableCell>
                <TableCell>{s.contact ?? "—"}</TableCell>
                <TableCell>{s.phone ?? "—"}</TableCell>
                <TableCell className={`text-right font-mono tabular ${s.balance.gt(0) ? "text-rose-600 font-semibold" : ""}`}>{fmtRM(s.balance)}</TableCell>
                <TableCell>{s.active ? <Badge>Active</Badge> : <Badge variant="outline">Inactive</Badge>}</TableCell>
                <TableCell className="text-right space-x-2">
                  <SupplierDialog mode="edit" supplier={{
                    id: s.id, name: s.name,
                    contact: s.contact ?? "", phone: s.phone ?? "", bankAccount: "",
                  }} />
                  <ToggleSupplier id={s.id} active={s.active} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {rows.length === 0 && (
          <Empty
            icon={Truck}
            title="No suppliers yet"
            description="Add a supplier before recording bills."
            action={<SupplierDialog mode="create" />}
          />
        )}
      </DataCard>
    </div>
  );
}
