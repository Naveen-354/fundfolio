export const typographyFonts = {
  system: { label: "System UI", stack: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
  arial: { label: "Arial", stack: "Arial, Helvetica, sans-serif" },
  verdana: { label: "Verdana", stack: "Verdana, Geneva, sans-serif" },
  trebuchet: { label: "Trebuchet MS", stack: "'Trebuchet MS', Arial, sans-serif" },
  georgia: { label: "Georgia", stack: "Georgia, 'Times New Roman', serif" },
  monospace: { label: "Monospace", stack: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" },
} as const;

export type TypographyFont = keyof typeof typographyFonts;
export type PublicTypographySettings = {
  bodyFont: TypographyFont;
  displayFont: TypographyFont;
  fontScale: number;
  schemeListScale: number;
};

export const defaultPublicTypography: PublicTypographySettings = {
  bodyFont: "arial",
  displayFont: "georgia",
  fontScale: 115,
  schemeListScale: 115,
};

export function isTypographyFont(value: unknown): value is TypographyFont {
  return typeof value === "string" && Object.hasOwn(typographyFonts, value);
}
