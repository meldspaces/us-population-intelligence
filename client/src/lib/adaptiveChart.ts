import type { EChartsOption } from "echarts";
import { asNumber, labelize } from "./format";

export type ChartDecision = {
  kind: "bar" | "grouped" | "donut" | "heatmap" | "scatter" | "table";
  title: string;
  reason: string;
  option: EChartsOption | null;
};

const NUMERIC_HINT = /(pct|percent|rate|population|count|midpoint|low|high|value|ms)/i;

function isNumericColumn(name: string, rows: Record<string, unknown>[]): boolean {
  if (NUMERIC_HINT.test(name)) return true;
  const sample = rows.slice(0, 12).map((r) => r[name]);
  return sample.filter((v) => asNumber(v) !== null).length >= Math.min(3, sample.length);
}

export function chooseChart(
  columns: string[],
  rows: Record<string, unknown>[],
  theme: "dark" | "light",
): ChartDecision {
  const text = theme === "dark" ? "#e8eef4" : "#1b2430";
  const muted = theme === "dark" ? "#8b9aab" : "#5c6b7a";
  const axis = { axisLabel: { color: muted }, axisLine: { lineStyle: { color: muted } } };

  if (rows.length === 0 || columns.length === 0) {
    return { kind: "table", title: "No rows", reason: "Query returned no data", option: null };
  }

  const numeric = columns.filter((c) => isNumericColumn(c, rows));
  const categorical = columns.filter((c) => !numeric.includes(c));
  const labelCol = categorical[0] ?? columns[0];
  const valueCol = numeric.find((c) => c !== labelCol) ?? numeric[0];

  const palette = ["#d4a017", "#2a9d8f", "#c23b4a", "#7aa2f7", "#e76f51", "#9b7ed9"];

  if (categorical.length >= 1 && numeric.length === 1 && rows.length <= 8) {
    const values = rows.map((r) => asNumber(r[valueCol]) ?? 0);
    const sum = values.reduce((a, b) => a + b, 0);
    if (sum > 50 && sum < 120) {
      return {
        kind: "donut",
        title: `${labelize(valueCol)} composition`,
        reason: "Few categories with a part-to-whole numeric shape → donut",
        option: {
          color: palette,
          tooltip: { trigger: "item" },
          series: [
            {
              type: "pie",
              radius: ["48%", "72%"],
              data: rows.map((r) => ({
                name: String(r[labelCol] ?? ""),
                value: asNumber(r[valueCol]) ?? 0,
              })),
              label: { color: text },
            },
          ],
        },
      };
    }
  }

  if (categorical.length >= 2 && numeric.length >= 1 && rows.length <= 80) {
    const x = Array.from(new Set(rows.map((r) => String(r[categorical[0]] ?? ""))));
    const y = Array.from(new Set(rows.map((r) => String(r[categorical[1]] ?? ""))));
    const data = rows.map((r) => [
      x.indexOf(String(r[categorical[0]] ?? "")),
      y.indexOf(String(r[categorical[1]] ?? "")),
      asNumber(r[valueCol]) ?? 0,
    ]);
    return {
      kind: "heatmap",
      title: `${labelize(categorical[0])} × ${labelize(categorical[1])}`,
      reason: "Two categories plus a metric → heatmap",
      option: {
        tooltip: { position: "top" },
        grid: { left: 90, top: 30, right: 24, bottom: 40 },
        xAxis: { type: "category", data: x, splitArea: { show: true }, ...axis },
        yAxis: { type: "category", data: y, splitArea: { show: true }, ...axis },
        visualMap: {
          min: 0,
          max: Math.max(...data.map((d) => Number(d[2])), 1),
          inRange: { color: ["#134e4a", "#d4a017", "#9f1239"] },
          textStyle: { color: muted },
        },
        series: [{ type: "heatmap", data, label: { show: true, color: text } }],
      },
    };
  }

  if (numeric.length >= 2 && categorical.length >= 1 && rows.length <= 40) {
    return {
      kind: "grouped",
      title: `${labelize(labelCol)} comparison`,
      reason: "One category and multiple metrics → grouped bars",
      option: {
        color: palette,
        tooltip: { trigger: "axis" },
        legend: { textStyle: { color: muted } },
        grid: { left: 48, right: 16, top: 36, bottom: 28 },
        xAxis: { type: "category", data: rows.map((r) => String(r[labelCol] ?? "")), ...axis },
        yAxis: { type: "value", ...axis },
        series: numeric.slice(0, 4).map((col) => ({
          name: labelize(col),
          type: "bar" as const,
          data: rows.map((r) => asNumber(r[col])),
        })),
      },
    };
  }

  if (numeric.length >= 2 && rows.length >= 8) {
    return {
      kind: "scatter",
      title: `${labelize(numeric[0])} vs ${labelize(numeric[1])}`,
      reason: "Two numeric fields → scatter",
      option: {
        color: ["#d4a017"],
        tooltip: {
          formatter: (p: unknown) => {
            const point = p as { data: [number, number, string] };
            return `${point.data[2]}<br/>${point.data[0]}, ${point.data[1]}`;
          },
        },
        grid: { left: 48, right: 16, top: 24, bottom: 32 },
        xAxis: { name: labelize(numeric[0]), ...axis },
        yAxis: { name: labelize(numeric[1]), ...axis },
        series: [
          {
            type: "scatter",
            symbolSize: 10,
            data: rows.map((r) => [
              asNumber(r[numeric[0]]) ?? 0,
              asNumber(r[numeric[1]]) ?? 0,
              String(r[labelCol] ?? ""),
            ]),
          },
        ],
      },
    };
  }

  if (valueCol && labelCol) {
    const sorted = [...rows].sort((a, b) => (asNumber(b[valueCol]) ?? 0) - (asNumber(a[valueCol]) ?? 0));
    const horizontal = sorted.length > 12;
    return {
      kind: "bar",
      title: `${labelize(valueCol)} by ${labelize(labelCol)}`,
      reason: "Single category + metric → ranked bars",
      option: {
        color: ["#d4a017"],
        tooltip: { trigger: "axis" },
        grid: horizontal
          ? { left: 110, right: 16, top: 16, bottom: 24 }
          : { left: 40, right: 16, top: 16, bottom: 48 },
        xAxis: horizontal
          ? { type: "value", ...axis }
          : { type: "category", data: sorted.map((r) => String(r[labelCol] ?? "")), ...axis },
        yAxis: horizontal
          ? { type: "category", data: sorted.map((r) => String(r[labelCol] ?? "")).reverse(), ...axis }
          : { type: "value", ...axis },
        series: [
          {
            type: "bar",
            data: horizontal
              ? sorted.map((r) => asNumber(r[valueCol])).reverse()
              : sorted.map((r) => asNumber(r[valueCol])),
          },
        ],
      },
    };
  }

  return { kind: "table", title: "Table", reason: "No chart mapping for this result shape", option: null };
}
