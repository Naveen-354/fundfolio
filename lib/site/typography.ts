import "server-only";

import { getPostgresPool, isDatabaseConfigured } from "@/lib/funds/postgres-repository";
import { defaultPublicTypography, isTypographyFont, type PublicTypographySettings } from "@/lib/site/typography-shared";

export { defaultPublicTypography } from "@/lib/site/typography-shared";
export type { PublicTypographySettings, TypographyFont } from "@/lib/site/typography-shared";

type TypographyRow = {
  bodyFont: string;
  displayFont: string;
  fontScale: number;
  schemeListScale: number;
};

function mapTypographyRow(row: TypographyRow | undefined): PublicTypographySettings {
  const fontScale = row?.fontScale;
  const schemeListScale = row?.schemeListScale;
  return {
    bodyFont: isTypographyFont(row?.bodyFont) ? row.bodyFont : defaultPublicTypography.bodyFont,
    displayFont: isTypographyFont(row?.displayFont) ? row.displayFont : defaultPublicTypography.displayFont,
    fontScale: typeof fontScale === "number" && Number.isInteger(fontScale) && fontScale >= 80 && fontScale <= 125
      ? fontScale
      : defaultPublicTypography.fontScale,
    schemeListScale: typeof schemeListScale === "number" && Number.isInteger(schemeListScale) && schemeListScale >= 80 && schemeListScale <= 125
      ? schemeListScale
      : defaultPublicTypography.schemeListScale,
  };
}

export async function getPublicTypographySettings(): Promise<PublicTypographySettings> {
  if (!isDatabaseConfigured()) return defaultPublicTypography;

  const result = await getPostgresPool().query<TypographyRow>(
    `SELECT body_font AS "bodyFont", display_font AS "displayFont", font_scale AS "fontScale",
            scheme_list_scale AS "schemeListScale"
     FROM public.site_typography_settings WHERE singleton_key = 1`,
  );
  return mapTypographyRow(result.rows[0]);
}

export async function savePublicTypographySettings(settings: PublicTypographySettings): Promise<PublicTypographySettings> {
  const result = await getPostgresPool().query<TypographyRow>(
    `INSERT INTO public.site_typography_settings (singleton_key, body_font, display_font, font_scale, scheme_list_scale, updated_at)
     VALUES (1, $1, $2, $3, $4, NOW())
     ON CONFLICT (singleton_key) DO UPDATE SET
       body_font = EXCLUDED.body_font,
       display_font = EXCLUDED.display_font,
       font_scale = EXCLUDED.font_scale,
       scheme_list_scale = EXCLUDED.scheme_list_scale,
       updated_at = NOW()
     RETURNING body_font AS "bodyFont", display_font AS "displayFont", font_scale AS "fontScale",
               scheme_list_scale AS "schemeListScale"`,
    [settings.bodyFont, settings.displayFont, settings.fontScale, settings.schemeListScale],
  );
  return mapTypographyRow(result.rows[0]);
}
