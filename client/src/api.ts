import type { CityRow, DemoRow, GeoCollection, Meta, QueryResult, SavedSearch, StateRow } from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  const body = (await response.json()) as { data?: T; error?: string; message?: string };
  if (!response.ok) {
    throw new Error(body.message ?? body.error ?? `Request failed (${response.status})`);
  }
  if (body.data === undefined) {
    throw new Error("Malformed response");
  }
  return body.data;
}

export const api = {
  meta: () => request<Meta>("/api/meta"),
  states: () => request<StateRow[]>("/api/states"),
  cities: (state?: string | null) =>
    request<CityRow[]>(state ? `/api/cities?state=${encodeURIComponent(state)}` : "/api/cities"),
  demographics: () => request<DemoRow[]>("/api/demographics"),
  geoStates: () => request<GeoCollection>("/api/geo/states"),
  geoCities: (state?: string | null) =>
    request<GeoCollection>(
      state ? `/api/geo/cities?state=${encodeURIComponent(state)}` : "/api/geo/cities",
    ),
  schema: () =>
    request<{
      tables: Array<{ table_name: string; comment: string | null }>;
      columns: Array<{ table_name: string; column_name: string; data_type: string; udt_name: string }>;
      hints: string[];
    }>("/api/schema"),
  query: (sql: string) =>
    request<QueryResult>("/api/query", { method: "POST", body: JSON.stringify({ sql }) }),
  searches: () => request<SavedSearch[]>("/api/searches"),
  saveSearch: (payload: {
    name: string;
    kind: "sql" | "filters";
    query?: string;
    filters?: unknown;
    description?: string;
  }) => request<SavedSearch>("/api/searches", { method: "POST", body: JSON.stringify(payload) }),
  deleteSearch: (id: number) => request<{ ok: boolean }>(`/api/searches/${id}`, { method: "DELETE" }),
};
