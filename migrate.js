const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DATABASE_URL });

async function run() {
  await client.connect();
  
  // Add columns if they don't exist
  await client.query(`
    ALTER TABLE schemes 
    ADD COLUMN IF NOT EXISTS nav numeric,
    ADD COLUMN IF NOT EXISTS nav_date date
  `);

  console.log("Added nav and nav_date to schemes table.");

  // Backfill from nav_history (the latest one)
  console.log("Backfilling...");
  await client.query(`
    UPDATE schemes s
    SET nav = latest.nav, nav_date = latest.nav_date
    FROM (
      SELECT DISTINCT ON (scheme_id) scheme_id, nav, nav_date
      FROM nav_history
      ORDER BY scheme_id, nav_date DESC
    ) latest
    WHERE s.id = latest.scheme_id
  `);
  console.log("Backfill complete.");

  await client.query(`
    CREATE INDEX IF NOT EXISTS schemes_nav_idx ON schemes (nav DESC NULLS LAST);
    CREATE INDEX IF NOT EXISTS schemes_nav_date_idx ON schemes (nav_date DESC NULLS LAST);
  `);
  console.log("Created indexes.");

  await client.end();
}
run();
