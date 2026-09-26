import type { Metadata } from "next";
import { connection } from "next/server";
import { FundExplorer } from "@/app/fund-explorer";
import { getFundPage } from "@/lib/funds/amfi";
import { defaultPublicTypography } from "@/lib/site/typography-shared";
import { getPublicTypographySettings } from "@/lib/site/typography";
import type { FundPageData } from "@/lib/funds/types";

export const metadata: Metadata = {
  title: "Fundfolio — Explore Indian mutual funds",
  description: "An open, free view of Indian mutual fund schemes and official AMFI NAV history.",
};

const emptyPage: FundPageData = {
  schemes: [], total: 0, page: 1, pageSize: 12, pageCount: 1, navDate: null,
  totalSchemes: 0,
  categoryCounts: { Equity: 0, Debt: 0, Hybrid: 0, Index: 0, Other: 0 },
  fundHouses: [],
};

export default async function Home() {
  await connection();
  const [initialData, typography] = await Promise.all([
    getFundPage({ search: "", category: "All", fundHouse: "", sort: "name", page: 1, pageSize: 12 }).catch(() => emptyPage),
    getPublicTypographySettings().catch(() => defaultPublicTypography),
  ]);

  return <FundExplorer initialData={initialData} typography={typography} />;
}
