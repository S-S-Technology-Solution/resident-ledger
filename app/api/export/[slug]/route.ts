import { NextRequest, NextResponse } from "next/server";
import { buildXlsx } from "@/lib/export/excel";
import { buildPdf } from "@/lib/export/pdf";
import { EXPORTS } from "@/lib/export/registry";
import { getCurrentUser } from "@/lib/permissions";
import { canSeeScreen } from "@/lib/screens";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const def = EXPORTS[slug];
  if (!def) return NextResponse.json({ error: `Unknown export ${slug}` }, { status: 404 });
  // Each export belongs to a screen; you can download it if you can open that screen.
  const user = await getCurrentUser();
  if (!user || !user.active || !canSeeScreen(user, def.screen)) {
    return NextResponse.json({ error: "You don't have access to this screen." }, { status: 403 });
  }
  const sp = req.nextUrl.searchParams;
  const format = (sp.get("format") ?? "pdf").toLowerCase();
  try {
    const data = await def.build(sp);
    const filename = `${slug}-${new Date().toISOString().slice(0, 10)}.${format === "xlsx" ? "xlsx" : "pdf"}`;

    if (format === "xlsx") {
      const buf = await buildXlsx(data);
      return new NextResponse(buf as unknown as BodyInit, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }
    const buf = await buildPdf(data);
    return new NextResponse(buf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
}
