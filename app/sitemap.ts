import { MetadataRoute } from 'next';
import { getPostgresPool, isDatabaseConfigured } from '@/lib/funds/postgres-repository';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://fundfolio.example.com';
  
  // Base static routes
  const routes: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
  ];

  // Dynamically add all active schemes
  if (isDatabaseConfigured()) {
    try {
      const pool = getPostgresPool();
      const result = await pool.query(`
        SELECT amfi_scheme_code, updated_at 
        FROM schemes 
        WHERE is_active = TRUE
      `);
      
      for (const row of result.rows) {
        routes.push({
          url: `${baseUrl}/schemes/${row.amfi_scheme_code}`,
          lastModified: row.updated_at || new Date(),
          changeFrequency: 'daily',
          priority: 0.8,
        });
      }
    } catch (e) {
      console.error("Failed to generate dynamic sitemap", e);
    }
  }

  return routes;
}
