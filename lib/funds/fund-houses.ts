import "server-only";

import { getPostgresPool, isDatabaseConfigured } from "@/lib/funds/postgres-repository";

export type AmfiFundHouse = { sourceKey: string; amfiName: string };

export type FundHouseRecord = {
  id: string;
  sourceKey: string;
  amfiId: string | null;
  amfiName: string;
  rtaType: string | null;
  rtaCode: string | null;
  isActive: boolean;
};

export type FundHousePatch = {
  amfiId?: string | null;
  rtaType?: string | null;
  rtaCode?: string | null;
  isActive?: boolean;
};

function ensureDatabaseConfigured() {
  if (!isDatabaseConfigured()) throw new Error("DATABASE_URL is not configured");
}

export async function syncAmfiFundHouses(fundHouses: AmfiFundHouse[]): Promise<void> {
  ensureDatabaseConfigured();
  const pool = getPostgresPool();

  for (let offset = 0; offset < fundHouses.length; offset += 200) {
    const batch = fundHouses.slice(offset, offset + 200);
    const values: string[] = [];
    const rows = batch.map(({ sourceKey, amfiName }) => {
      values.push(sourceKey, amfiName);
      return `($${values.length - 1}, $${values.length})`;
    });

    await pool.query(
      `INSERT INTO fund_houses (source_key, amfi_name)
       VALUES ${rows.join(", ")}
       ON CONFLICT (source_key) DO UPDATE
       SET amfi_name = EXCLUDED.amfi_name, updated_at = NOW()
       WHERE fund_houses.amfi_name IS DISTINCT FROM EXCLUDED.amfi_name`,
      values,
    );
  }
}

export async function listFundHouses(sourceKeys: string[]): Promise<FundHouseRecord[]> {
  ensureDatabaseConfigured();
  if (sourceKeys.length === 0) return [];

  const result = await getPostgresPool().query(
    `SELECT id, source_key AS "sourceKey", amfi_id AS "amfiId", amfi_name AS "amfiName",
            rta_type AS "rtaType", rta_code AS "rtaCode", is_active AS "isActive"
     FROM fund_houses
     WHERE source_key = ANY($1::text[])
     ORDER BY amfi_name ASC`,
    [sourceKeys],
  );

  return result.rows as FundHouseRecord[];
}

export async function getDisabledFundHouseKeys(): Promise<Set<string>> {
  if (!isDatabaseConfigured()) return new Set();

  const result = await getPostgresPool().query<{ sourceKey: string }>(
    `SELECT source_key AS "sourceKey" FROM fund_houses WHERE is_active = FALSE`,
  );
  return new Set(result.rows.map(({ sourceKey }) => sourceKey));
}

export async function updateFundHouse(id: string, patch: FundHousePatch): Promise<FundHouseRecord | null> {
  ensureDatabaseConfigured();

  const values: Array<string | boolean | null> = [];
  const assignments: string[] = [];
  const addField = (column: string, value: string | boolean | null) => {
    values.push(value);
    assignments.push(`${column} = $${values.length}`);
  };

  if ("amfiId" in patch) addField("amfi_id", patch.amfiId ?? null);
  if ("rtaType" in patch) addField("rta_type", patch.rtaType ?? null);
  if ("rtaCode" in patch) addField("rta_code", patch.rtaCode ?? null);
  if ("isActive" in patch) addField("is_active", patch.isActive ?? true);
  if (assignments.length === 0) return null;

  values.push(id);
  const result = await getPostgresPool().query(
    `UPDATE fund_houses
     SET ${assignments.join(", ")}, updated_at = NOW()
     WHERE id = $${values.length}
     RETURNING id, source_key AS "sourceKey", amfi_id AS "amfiId", amfi_name AS "amfiName",
               rta_type AS "rtaType", rta_code AS "rtaCode", is_active AS "isActive"`,
    values,
  );

  return (result.rows[0] as FundHouseRecord | undefined) ?? null;
}
