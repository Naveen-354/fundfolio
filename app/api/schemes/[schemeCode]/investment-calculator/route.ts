import { getAmfiNavHistory } from "@/lib/funds/amfi";
import { getAmfiSchemeExitLoadTerms } from "@/lib/funds/amfi-portal";
import { calculateHistoricalInvestment, parseExitLoadSchedule, type HistoricalInvestmentInput } from "@/lib/funds/investment-calculation";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ schemeCode: string }> },
) {
  const { schemeCode } = await params;
  if (!/^\d{1,12}$/.test(schemeCode)) {
    return Response.json({ error: "Invalid AMFI scheme code." }, { status: 400 });
  }

  let parsedBody: unknown;
  try {
    parsedBody = await request.json();
  } catch {
    return Response.json({ error: "Investment details are invalid." }, { status: 400 });
  }

  if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
    return Response.json({ error: "Investment details are invalid." }, { status: 400 });
  }
  const body = parsedBody as Partial<HistoricalInvestmentInput>;

  if ((body.mode !== "sip" && body.mode !== "lumpsum") || typeof body.startDate !== "string" || typeof body.withdrawalDate !== "string") {
    return Response.json({ error: "Choose an investment type, investment date, and withdrawal date." }, { status: 400 });
  }

  const input: HistoricalInvestmentInput = {
    mode: body.mode,
    amount: Number(body.amount),
    startDate: body.startDate,
    withdrawalDate: body.withdrawalDate,
    annualStepUp: Number(body.annualStepUp ?? 0),
  };

  try {
    const history = await getAmfiNavHistory(schemeCode);
    if (!history) return Response.json({ error: "NAV history is not available for this scheme." }, { status: 404 });

    try {
      const exitLoadTerms = await getAmfiSchemeExitLoadTerms(schemeCode).catch(() => []);
      const exitLoadSchedule = parseExitLoadSchedule(exitLoadTerms);
      const result = calculateHistoricalInvestment(input, history.observations, exitLoadSchedule);
      return Response.json(result, { headers: { "Cache-Control": "no-store" } });
    } catch (cause) {
      return Response.json({ error: cause instanceof Error ? cause.message : "Investment details are invalid." }, { status: 400 });
    }
  } catch {
    return Response.json({ error: "AMFI NAV history is temporarily unavailable. Please try again." }, { status: 502 });
  }
}
