const riskLevels = ["Low", "Low to Moderate", "Moderate", "Moderately High", "High", "Very High"] as const;
export type RiskLevel = (typeof riskLevels)[number];

const riskColors: Record<RiskLevel, string> = {
  Low: "#2f8a4e",
  "Low to Moderate": "#8ebd45",
  Moderate: "#e8c93a",
  "Moderately High": "#f0952f",
  High: "#e8622f",
  "Very High": "#d63a3a",
};

// AMFI's own text isn't perfectly consistent ("Very High risk" vs "Very High"), so this
// matches on substrings rather than requiring an exact value. Checked most-specific
// first (e.g. "moderately high" before "high") so a superstring level isn't shadowed by
// a shorter one appearing inside it.
export function classifyRiskLevel(raw: string | null | undefined): RiskLevel | null {
  if (!raw) return null;
  const normalized = raw.toLowerCase().replace(/\brisk\b/g, "").trim();
  if (normalized.includes("very high")) return "Very High";
  if (normalized.includes("moderately high")) return "Moderately High";
  if (normalized.includes("low to moderate") || normalized.includes("low-to-moderate")) return "Low to Moderate";
  if (normalized.includes("moderate")) return "Moderate";
  if (normalized.includes("high")) return "High";
  if (normalized.includes("low")) return "Low";
  return null;
}

function polarPoint(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
}

function ringSegmentPath(cx: number, cy: number, outer: number, inner: number, startAngle: number, endAngle: number) {
  const p1 = polarPoint(cx, cy, outer, startAngle);
  const p2 = polarPoint(cx, cy, outer, endAngle);
  const p3 = polarPoint(cx, cy, inner, endAngle);
  const p4 = polarPoint(cx, cy, inner, startAngle);
  return `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${outer} ${outer} 0 0 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)} L ${p3.x.toFixed(2)} ${p3.y.toFixed(2)} A ${inner} ${inner} 0 0 0 ${p4.x.toFixed(2)} ${p4.y.toFixed(2)} Z`;
}

export function RiskometerGauge({ level, launchLevel }: { level: RiskLevel; launchLevel?: RiskLevel | null }) {
  const cx = 110;
  const cy = 106;
  const outer = 84;
  const inner = 62;
  const currentIndex = riskLevels.indexOf(level);
  const needleAngle = 180 - (currentIndex * 30 + 15);
  const needleTip = polarPoint(cx, cy, inner - 4, needleAngle);
  const showLaunch = launchLevel && launchLevel !== level;
  const launchIndex = launchLevel ? riskLevels.indexOf(launchLevel) : -1;
  const launchAngle = 180 - (launchIndex * 30 + 15);
  const launchTip = polarPoint(cx, cy, outer + 8, launchAngle);

  return (
    <div className="riskometer">
      <svg viewBox="0 0 220 126" width="220" height="126" role="img" aria-label={`Riskometer: ${level}`}>
        {riskLevels.map((segmentLevel, index) => {
          const startAngle = 180 - index * 30;
          const endAngle = 180 - (index + 1) * 30;
          return (
            <path
              key={segmentLevel}
              d={ringSegmentPath(cx, cy, outer, inner, startAngle, endAngle)}
              fill={riskColors[segmentLevel]}
              opacity={segmentLevel === level ? 1 : 0.32}
            />
          );
        })}
        {showLaunch && launchIndex >= 0 && (
          <>
            <line x1={polarPoint(cx, cy, outer + 2, launchAngle).x} y1={polarPoint(cx, cy, outer + 2, launchAngle).y} x2={launchTip.x} y2={launchTip.y} className="riskometer-launch-tick" />
            <circle cx={launchTip.x} cy={launchTip.y} r="2.4" className="riskometer-launch-dot" />
          </>
        )}
        <line x1={cx} y1={cy} x2={needleTip.x} y2={needleTip.y} className="riskometer-needle" />
        <circle cx={cx} cy={cy} r="6" className="riskometer-pivot" />
      </svg>
      <div className="riskometer-label">
        <span>RISKOMETER</span>
        <strong style={{ color: riskColors[level] }}>{level}</strong>
        {showLaunch && <small>At launch: {launchLevel}</small>}
      </div>
    </div>
  );
}
