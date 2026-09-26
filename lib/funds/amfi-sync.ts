import "server-only";

import type { PoolClient } from "pg";
import { fetchAmfiNavReport, fundHouseSourceKey, parseAmfiFundHouses, parseAmfiNavReport } from "@/lib/funds/amfi";
import { getPostgresPool, isDatabaseConfigured } from "@/lib/funds/postgres-repository";
import type { FundScheme } from "@/lib/funds/types";

const batchSize = 200;

async function upsertFundHouses(client: PoolClient, houses: Array<{ sourceKey: string; amfiName: string }>) {
  for (let offset = 0; offset < houses.length; offset += batchSize) {
    const batch = houses.slice(offset, offset + batchSize);
    const values: string[] = [];
    const rows = batch.map(({ sourceKey, amfiName }) => {
      values.push(sourceKey, amfiName);
      return `($${values.length - 1}, $${values.length})`;
    });
    await client.query(
      `INSERT INTO fund_houses (source_key, amfi_name)
       VALUES ${rows.join(", ")}
       ON CONFLICT (source_key) DO UPDATE
       SET amfi_name = EXCLUDED.amfi_name, updated_at = NOW()
       WHERE fund_houses.amfi_name IS DISTINCT FROM EXCLUDED.amfi_name`,
      values,
    );
  }
}

async function upsertSchemes(client: PoolClient, schemes: FundScheme[], fundHouseIds: Map<string, string>) {
  const schemeIds = new Map<string, string>();

  for (let offset = 0; offset < schemes.length; offset += batchSize) {
    const batch = schemes.slice(offset, offset + batchSize);
    const values: Array<string | number | Date | null> = [];
    const rows = batch.map((scheme) => {
      const fundHouseId = fundHouseIds.get(fundHouseSourceKey(scheme.fundHouse));
      if (!fundHouseId) throw new Error(`AMFI fund house is missing from the catalog: ${scheme.fundHouse}`);
      values.push(
        fundHouseId,
        scheme.schemeCode,
        scheme.name,
        scheme.category,
        scheme.categoryLabel,
        scheme.plan,
        scheme.option,
        scheme.isin,
        new Date(`${scheme.navDate}T00:00:00.000Z`),
        scheme.navDate,
        scheme.nav
      );
      const start = values.length - 11;
      return `($${start}::uuid, $${start + 1}, $${start + 2}, $${start + 3}, $${start + 4}, $${start + 5}, $${start + 6}, $${start + 7}, TRUE, $${start + 8}, $${start + 9}::date, $${start + 10}::numeric)`;
    });

    const result = await client.query<{ id: string; schemeCode: string }>(
      `INSERT INTO schemes (
         fund_house_id, amfi_scheme_code, scheme_name, category, category_label,
         plan_name, option_name, isin_growth, is_active, source_updated_at, nav_date, nav
       )
       VALUES ${rows.join(", ")}
       ON CONFLICT (amfi_scheme_code) DO UPDATE SET
         fund_house_id = EXCLUDED.fund_house_id,
         scheme_name = EXCLUDED.scheme_name,
         category = EXCLUDED.category,
         category_label = EXCLUDED.category_label,
         plan_name = EXCLUDED.plan_name,
         option_name = EXCLUDED.option_name,
         isin_growth = EXCLUDED.isin_growth,
         is_active = TRUE,
         source_updated_at = EXCLUDED.source_updated_at,
         nav_date = EXCLUDED.nav_date,
         nav = EXCLUDED.nav,
         updated_at = NOW()
       RETURNING id, amfi_scheme_code AS "schemeCode"`,
      values,
    );

    for (const row of result.rows) schemeIds.set(row.schemeCode, row.id);
    const navValues: Array<string | number> = [];
    const navRows = batch.map((scheme) => {
      const schemeId = schemeIds.get(scheme.schemeCode);
      if (!schemeId) throw new Error(`AMFI scheme was not returned after sync: ${scheme.schemeCode}`);
      navValues.push(schemeId, scheme.navDate, scheme.nav);
      const start = navValues.length - 2;
      return `($${start}::uuid, $${start + 1}::date, $${start + 2}::numeric)`;
    });
    await client.query(
      `INSERT INTO nav_history (scheme_id, nav_date, nav)
       VALUES ${navRows.join(", ")}
       ON CONFLICT (scheme_id, nav_date) DO UPDATE SET
         nav = EXCLUDED.nav,
         source = 'amfi',
         fetched_at = NOW()`,
      navValues,
    );
  }

  return schemeIds.size;
}

export async function syncAmfiSchemesToDatabase(): Promise<{
  fundHouses: number;
  schemes: number;
  navDate: string;
}> {
  if (!isDatabaseConfigured()) throw new Error("DATABASE_URL is not configured");

  const report = await fetchAmfiNavReport(true);
  const fundHouses = parseAmfiFundHouses(report);
  const schemes = parseAmfiNavReport(report);
  if (fundHouses.length === 0 || schemes.length === 0) throw new Error("AMFI returned no importable fund data");

  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    await upsertFundHouses(client, fundHouses);

    const houseResult = await client.query<{ id: string; sourceKey: string }>(
      `SELECT id, source_key AS "sourceKey" FROM fund_houses WHERE source_key = ANY($1::text[])`,
      [fundHouses.map(({ sourceKey }) => sourceKey)],
    );
    const fundHouseIds = new Map(houseResult.rows.map(({ sourceKey, id }) => [sourceKey, id]));
    const syncedSchemes = await upsertSchemes(client, schemes, fundHouseIds);
    const schemeCodes = schemes.map(({ schemeCode }) => schemeCode);
    await client.query(
      `UPDATE schemes
       SET is_active = FALSE, updated_at = NOW()
       WHERE is_active = TRUE
         AND lower(plan_name) LIKE '%direct%'
         AND lower(option_name) LIKE '%growth%'
         AND NOT (amfi_scheme_code = ANY($1::text[]))`,
      [schemeCodes],
    );

    await client.query("COMMIT");
    return {
      fundHouses: fundHouses.length,
      schemes: syncedSchemes,
      navDate: schemes.reduce((latest, scheme) => scheme.navDate > latest ? scheme.navDate : latest, schemes[0].navDate),
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
