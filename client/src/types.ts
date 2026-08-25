import type { FeatureCollection } from "geojson";

export type GeoCollection = FeatureCollection;

export type Filters = {
  state: string | null;
  generation: string | null;
  sex: string | null;
  race: string | null;
};

export type Tab = "explore" | "sql";

export type Theme = "dark" | "light";

export type StateRow = {
  id: number;
  code: string;
  name: string;
  current_antidepressant_pct: number | string | null;
  lifetime_antidepressant_pct: number | string | null;
  source_url: string | null;
  notes: string | null;
};

export type CityRow = {
  id: number;
  name: string;
  state_code: string;
  state_name: string | null;
  population: number | string | null;
  proxy_pct_low: number | string | null;
  proxy_pct_high: number | string | null;
  proxy_midpoint: number | string | null;
  notes: string | null;
  source_url: string | null;
  source_pop: string | null;
  source_proxy: string | null;
};

export type DemoRow = {
  id: number;
  source_name: string;
  source_url: string | null;
  metric: string;
  year: number | null;
  category: string;
  subcategory: string;
  generations: string[] | null;
  pct: number | string | null;
  notes: string | null;
};

export type SavedSearch = {
  id: number;
  name: string;
  kind: "sql" | "filters";
  query: string | null;
  filters: Filters | null;
  description: string | null;
};

export type QueryResult = {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number | null;
  ms: number;
};

export type Meta = {
  title: string;
  caveat: string;
  sources: Array<{ name: string; url: string }>;
  stats: {
    states: number;
    cities: number;
    mean_state_rate: number | string | null;
    min_state_rate: number | string | null;
    max_state_rate: number | string | null;
  };
};
