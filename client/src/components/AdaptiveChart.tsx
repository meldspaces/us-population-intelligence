import type { JSX } from "react";
import ReactECharts from "echarts-for-react";
import { chooseChart } from "../lib/adaptiveChart";
import type { Theme } from "../types";

type Props = {
  columns: string[];
  rows: Record<string, unknown>[];
  theme: Theme;
};

export function AdaptiveChart({ columns, rows, theme }: Props): React.JSX.Element {
  const decision = chooseChart(columns, rows, theme);
  return (
    <section className="chart-card">
      <header className="chart-head">
        <div>
          <h3>{decision.title}</h3>
          <p className="muted">{decision.reason}</p>
        </div>
      </header>
      {decision.option ? (
        <ReactECharts
          option={decision.option}
          style={{ height: 280 }}
          theme={theme === "dark" ? "dark" : undefined}
          notMerge
        />
      ) : (
        <p className="muted">Showing table only for this result shape.</p>
      )}
    </section>
  );
}
