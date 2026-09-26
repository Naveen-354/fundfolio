"use client";

import { useState } from "react";
import { PerformancePanel } from "@/app/performance-panel";

export type NavHistoryChoice = { code: string; label: string };

export function NavHistorySelector({ schemeName, defaultCode, choices }: { schemeName: string; defaultCode: string; choices: NavHistoryChoice[] }) {
  const [selected, setSelected] = useState(defaultCode);

  if (choices.length <= 1) {
    return <PerformancePanel schemeCode={defaultCode} name={schemeName} />;
  }

  const current = choices.find((choice) => choice.code === selected) ?? choices[0];

  return (
    <div className="nav-history-selector">
      <div className="nav-history-tabs" role="tablist" aria-label="Choose plan and option">
        {choices.map((choice) => (
          <button
            key={choice.code}
            type="button"
            role="tab"
            aria-selected={choice.code === current.code}
            className={choice.code === current.code ? "selected" : undefined}
            onClick={() => setSelected(choice.code)}
          >
            {choice.label}
          </button>
        ))}
      </div>
      <PerformancePanel schemeCode={current.code} name={`${schemeName} — ${current.label}`} />
    </div>
  );
}
