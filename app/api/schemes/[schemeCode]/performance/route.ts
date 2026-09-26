import { NextRequest } from "next/server";
import { getAmfiPerformance } from "@/lib/funds/amfi";
import type { FundPerformance } from "@/lib/funds/types";

const periods = new Set<FundPerformance["period"]>(["1M", "3M", "1Y", "3Y", "5Y"]);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ schemeCode: string }> },
) {
  const { schemeCode } = await params;
  if (!/^\d{1,12}$/.test(schemeCode)) {
    return Response.json({ error: "Invalid AMFI scheme code." }, { status: 400 });
  }

  const period = request.nextUrl.searchParams.get("period") as FundPerformance["period"] | null;
  if (!period || !periods.has(period)) {
    return Response.json({ error: "Choose a supported return period." }, { status: 400 });
  }

  try {
    const performance = await getAmfiPerformance(schemeCode, period);
    if (!performance) return Response.json({ error: "AMFI has no history for this scheme yet." }, { status: 404 });
    return Response.json(performance, { 
      headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=43200" } 
    });
  } catch {
    return Response.json({ error: "AMFI history is temporarily unavailable." }, { status: 502 });
  }
}
