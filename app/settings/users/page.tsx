import { format } from "date-fns";
import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";
import { getCurrentUser, ROLE_LABEL, ROLE_DESCRIPTION } from "@/lib/permissions";
import { PageHeader } from "@/components/page-header";
import { DataCard } from "@/components/data-card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserDialog, ToggleUserButton } from "./user-dialog";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const [users, me] = await Promise.all([
    db.user.findMany({
      where: { associationId: DEFAULT_ASSOCIATION_ID },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    }),
    getCurrentUser(),
  ]);

  const isAdmin = me?.role === "ADMIN";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Who can sign in, and what they are allowed to do"
        actions={isAdmin ? <UserDialog mode="create" /> : undefined}
      />

      {!isAdmin && (
        <p className="rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Only an administrator can add or change users. You can see the list here.
        </p>
      )}

      <DataCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="w-40">Role</TableHead>
              <TableHead className="w-28">Status</TableHead>
              <TableHead className="w-32">Added</TableHead>
              <TableHead className="w-48 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id} className={u.active ? "" : "opacity-60"}>
                <TableCell className="font-medium">
                  {u.name}
                  {u.id === me?.id && <span className="ml-2 text-xs text-muted-foreground">you</span>}
                </TableCell>
                <TableCell className="text-muted-foreground">{u.email}</TableCell>
                <TableCell>
                  <Badge variant={u.role === "ADMIN" ? "default" : "outline"}>
                    {ROLE_LABEL[u.role]}
                  </Badge>
                </TableCell>
                <TableCell>
                  {u.active ? <Badge>Active</Badge> : <Badge variant="outline">Disabled</Badge>}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {format(u.createdAt, "dd MMM yyyy")}
                </TableCell>
                <TableCell className="space-x-1 text-right">
                  {isAdmin && (
                    <>
                      <UserDialog
                        mode="edit"
                        user={{ id: u.id, name: u.name, email: u.email, role: u.role }}
                      />
                      {u.id !== me?.id && <ToggleUserButton id={u.id} active={u.active} />}
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DataCard>

      <div className="rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold">What each role can do</h2>
        <dl className="mt-3 space-y-2 text-sm">
          {(["ADMIN", "TREASURER", "VIEWER"] as const).map((r) => (
            <div key={r} className="flex gap-3">
              <dt className="w-32 shrink-0 font-medium">{ROLE_LABEL[r]}</dt>
              <dd className="text-muted-foreground">{ROLE_DESCRIPTION[r]}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
