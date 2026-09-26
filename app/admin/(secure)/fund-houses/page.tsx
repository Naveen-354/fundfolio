import type { Metadata } from "next";
import { FundHouseManager } from "@/app/admin/fund-houses/fund-house-manager";

export const metadata: Metadata = { title: "Fund houses" };

export default function FundHousesPage() {
  return <FundHouseManager />;
}
