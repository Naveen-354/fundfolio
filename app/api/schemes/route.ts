import { NextRequest } from "next/server";
import { getFundPage, categories } from "@/lib/funds/amfi";
import type { FundCategory, FundQuery } from "@/lib/funds/types";

const categorySet = new Set<string>(categories);
const sortSet = new Set<FundQuery["sort"]>(["name", "nav-desc", "nav-asc"]);

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const rawCategory = params.get("category") ?? "All";
  const rawSort = params.get("sort") ?? "name";
  const query: FundQuery = {
    search: (params.get("search") ?? "").slice(0, 100),
    category: rawCategory === "All" || categorySet.has(rawCategory) ? rawCategory as FundCategory | "All" : "All",
    fundHouse: (params.get("fundHouse") ?? "").slice(0, 150),
    sort: sortSet.has(rawSort as FundQuery["sort"]) ? rawSort as FundQuery["sort"] : "name",
    page: Math.min(Math.max(Number(params.get("page")) || 1, 1), 500),
    pageSize: 12,
  };

  try {
    const data = await getFundPage(query);
    return Response.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "Fund data is temporarily unavailable." }, { status: 502 });
  }
}
