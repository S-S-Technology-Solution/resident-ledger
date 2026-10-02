"use server";

import { residentOutstanding } from "@/lib/ar";
import { attempt } from "@/lib/action-server";

export async function fetchOutstanding(residentId: string) {
  return attempt(async () => {
    const list = await residentOutstanding(residentId);
    return list.filter((c) => c.open.gt(0)).map((c) => ({
      id: c.id,
      description: c.description,
      periodMonth: c.periodMonth,
      periodYear: c.periodYear,
      open: c.open.toFixed(2),
    }));
  });
}
