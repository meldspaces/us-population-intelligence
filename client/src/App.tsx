import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type JSX } from "react";
import { api } from "./api";

const AdaptiveChart = lazy(async () => {
  const m = await import("./components/AdaptiveChart");
  return { default: m.AdaptiveChart };
});
const MapView = lazy(async () => {
  const m = await import("./components/MapView");
  return { default: m.MapView };
});
const SqlConsole = lazy(async () => {
  const m = await import("./components/SqlConsole");
  return { default: m.SqlConsole };
});
import { formatPct, formatPop } from "./lib/format";
import type {
  CityRow,
  DemoRow,
  Filters,
  GeoCollection,
  Meta,
  SavedSearch,
  StateRow,
  Tab,
  Theme,
} from "./types";

const EMPTY_FILTERS: Filters = { state: null, generation: null, sex: null, race: null };

export default function App(): JSX.Element {
  const [theme, setTheme] = useState<Theme>("dark");
  const [tab, setTab] = useState<Tab>("explore");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [states, setStates] = useState<StateRow[]>([]);
  const [cities, setCities] = useState<CityRow[]>([]);
  const [demos, setDemos] = useState<DemoRow[]>([]);
  const [geoStates, setGeoStates] = useState<GeoCollection | null>(null);
  const [geoCities, setGeoCities] = useState<GeoCollection | null>(null);
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [schema, setSchema] = useState<{
    tables: Array<{ table_name: string; comment: string | null }>;
    hints: string[];
  }>({ tables: [], hints: [] });
  const [selectedCity, setSelectedCity] = useState<{ name: string; state: string } | null>(null);
  const [sqlSeed, setSqlSeed] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const [m, s, c, d, gs, gc, saved, sch] = await Promise.all([
        api.meta(),
        api.states(),
        api.cities(),
        api.demographics(),
        api.geoStates(),
        api.geoCities(),
        api.searches(),
        api.schema(),
      ]);
      setMeta(m);
      setStates(s);
      setCities(c);
      setDemos(d);
      setGeoStates(gs);
      setGeoCities(gc);
      setSearches(saved);
      setSchema({ tables: sch.tables, hints: sch.hints });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedState = useMemo(
    () => states.find((s) => s.code === filters.state) ?? null,
    [states, filters.state],
  );
  const visibleCities = useMemo(
    () => (filters.state ? cities.filter((c) => c.state_code === filters.state) : cities),
    [cities, filters.state],
  );
  const cityDetail = useMemo(
    () =>
      selectedCity
        ? cities.find((c) => c.name === selectedCity.name && c.state_code === selectedCity.state) ??
          null
        : null,
    [cities, selectedCity],
  );

  const chartBundle = useMemo(() => {
    if (filters.generation || filters.sex || filters.race) {
      const rows = demos.filter((d) => {
        if (d.metric !== "medication_for_depression") return false;
        if (filters.sex && d.category === "sex" && d.subcategory === filters.sex) return true;
        if (filters.race && d.category === "race_ethnicity" && d.subcategory === filters.race) {
          return true;
        }
        if (
          filters.generation &&
          d.category === "age_generation" &&
          d.subcategory === filters.generation
        ) {
          return true;
        }
        return false;
      });
      return {
        columns: ["subcategory", "pct", "category"],
        rows: rows.map((d) => ({
          subcategory: d.subcategory,
          pct: d.pct,
          category: d.category,
        })),
        note: "Demographic slices are national NHIS 2023 rates. Public sources do not publish these intersections at state or city level.",
      };
    }
    if (filters.state) {
      return {
        columns: ["name", "proxy_midpoint", "population"],
        rows: visibleCities.map((c) => ({
          name: c.name,
          proxy_midpoint: c.proxy_midpoint,
          population: c.population,
        })),
        note: selectedState
          ? `${selectedState.name} current antidepressant use ${formatPct(selectedState.current_antidepressant_pct)} (Perlis 2026). City bubbles are proxies, not city Rx registries.`
          : "",
      };
    }
    return {
      columns: ["name", "current_antidepressant_pct", "lifetime_antidepressant_pct"],
      rows: states.map((s) => ({
        name: s.name,
        current_antidepressant_pct: s.current_antidepressant_pct,
        lifetime_antidepressant_pct: s.lifetime_antidepressant_pct,
      })),
      note: "State choropleth uses Perlis 2026 self-reported current antidepressant use.",
    };
  }, [demos, filters, selectedState, states, visibleCities]);

  const nhisOverall = demos.find(
    (d) => d.metric === "medication_for_depression" && d.category === "overall",
  );

  async function saveFilters(): Promise<void> {
    const name = window.prompt("Name this filter set");
    if (!name) return;
    await api.saveSearch({
      name: name.trim(),
      kind: "filters",
      filters,
      description: "Saved map/filter combination",
    });
    setSearches(await api.searches());
  }

  async function applySearch(search: SavedSearch): Promise<void> {
    if (search.kind === "sql" && search.query) {
      setTab("sql");
      setSqlSeed(search.query);
      return;
    }
    if (search.kind === "filters" && search.filters) {
      setFilters({ ...EMPTY_FILTERS, ...search.filters });
      setTab("explore");
    }
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <p className="kicker">Aggregate public statistics · proxy medication rates</p>
          <h1>US Population Intelligence</h1>
        </div>
        <nav className="tabs">
          <button type="button" className={tab === "explore" ? "on" : ""} onClick={() => setTab("explore")}>
            Map
          </button>
          <button type="button" className={tab === "sql" ? "on" : ""} onClick={() => setTab("sql")}>
            SQL
          </button>
          <button type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? "Light" : "Dark"}
          </button>
        </nav>
      </header>

      <div className="caveat">
        {meta?.caveat ??
          "Medication figures are aggregate public proxies. SSRIs are not isolated. No individual data."}
        {meta?.sources.map((s) => (
          <a key={s.url} href={s.url} target="_blank" rel="noreferrer">
            {s.name}
          </a>
        ))}
      </div>

      {error ? (
        <p className="error banner-error">
          {error}{" "}
          <button type="button" className="btn" onClick={() => void load()}>
            Retry
          </button>
        </p>
      ) : null}

      {tab === "explore" ? (
        <div className="workspace">
          <div className="map-pane">
            {loading ? <div className="map-skel" /> : null}
            <Suspense fallback={<div className="map-skel" />}>
              <MapView
                theme={theme}
                states={geoStates}
                cities={geoCities}
                selectedState={filters.state}
                onSelectState={(code) => {
                  setFilters((f) => ({ ...f, state: code }));
                }}
                onSelectCity={setSelectedCity}
              />
            </Suspense>
            <div className="legend">
              <strong>Current antidepressant use</strong>
              <div className="ramp" />
              <div className="legend-scale">
                <span>8%</span>
                <span>16.6% US</span>
                <span>26%</span>
              </div>
              <p className="muted">
                Fills: Perlis 2026 rates on Census 2025 cartographic polygons (1:5,000,000).
                Circles: city proxy midpoint, sized by Census 2025 population.
              </p>
            </div>
          </div>

          <aside className="side">
            <section>
              <h2>Filters</h2>
              <div className="filters">
                <label>
                  State
                  <select
                    value={filters.state ?? ""}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, state: e.target.value || null }))
                    }
                  >
                    <option value="">United States</option>
                    {states.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Generation / age
                  <select
                    value={filters.generation ?? ""}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, generation: e.target.value || null }))
                    }
                  >
                    <option value="">All (national)</option>
                    <option value="18-44">18–44 · Gen Z / Millennials</option>
                    <option value="45-64">45–64 · Gen X / younger Boomers</option>
                    <option value="65-74">65–74 · Baby Boomers</option>
                    <option value="75+">75+ · older Boomers / Silent</option>
                  </select>
                </label>
                <label>
                  Sex
                  <select
                    value={filters.sex ?? ""}
                    onChange={(e) => setFilters((f) => ({ ...f, sex: e.target.value || null }))}
                  >
                    <option value="">All</option>
                    <option value="women">Women</option>
                    <option value="men">Men</option>
                  </select>
                </label>
                <label>
                  Race / ethnicity
                  <select
                    value={filters.race ?? ""}
                    onChange={(e) => setFilters((f) => ({ ...f, race: e.target.value || null }))}
                  >
                    <option value="">All</option>
                    <option value="white_non_hispanic">White, non-Hispanic</option>
                    <option value="black_non_hispanic">Black, non-Hispanic</option>
                    <option value="hispanic">Hispanic</option>
                    <option value="asian_non_hispanic">Asian, non-Hispanic</option>
                    <option value="american_indian_alaska_native_non_hispanic">
                      American Indian / Alaska Native
                    </option>
                    <option value="other_multiple_races_non_hispanic">Other / multiple races</option>
                  </select>
                </label>
              </div>
              <div className="sql-actions">
                <button type="button" className="btn" onClick={() => setFilters(EMPTY_FILTERS)}>
                  Reset
                </button>
                <button type="button" className="btn" onClick={() => void saveFilters()}>
                  Save filters
                </button>
              </div>
            </section>

            <section className="stat-grid">
              <div>
                <span className="muted">Perlis current AD</span>
                <strong>{formatPct(selectedState?.current_antidepressant_pct ?? 16.6)}</strong>
              </div>
              <div>
                <span className="muted">NHIS med. for depression</span>
                <strong>{formatPct(nhisOverall?.pct ?? 11.4)}</strong>
              </div>
              <div>
                <span className="muted">Cities indexed</span>
                <strong>{visibleCities.length}</strong>
              </div>
            </section>

            <Suspense fallback={<p className="muted">Loading chart…</p>}>
              <AdaptiveChart columns={chartBundle.columns} rows={chartBundle.rows} theme={theme} />
            </Suspense>
            <p className="muted">{chartBundle.note}</p>

            {selectedState ? (
              <section>
                <h2>{selectedState.name}</h2>
                <p>
                  Current {formatPct(selectedState.current_antidepressant_pct)} · lifetime{" "}
                  {formatPct(selectedState.lifetime_antidepressant_pct)}
                </p>
                {selectedState.source_url ? (
                  <a href={selectedState.source_url} target="_blank" rel="noreferrer">
                    Perlis 2026 source
                  </a>
                ) : null}
                <p className="muted">{selectedState.notes}</p>
              </section>
            ) : null}

            {cityDetail ? (
              <section>
                <h2>
                  {cityDetail.name}, {cityDetail.state_code}
                </h2>
                <p>
                  Population {formatPop(cityDetail.population)} · proxy{" "}
                  {formatPct(cityDetail.proxy_pct_low)}–{formatPct(cityDetail.proxy_pct_high)} (mid{" "}
                  {formatPct(cityDetail.proxy_midpoint)})
                </p>
                <p className="muted">{cityDetail.notes}</p>
                <p className="muted">
                  Neighborhood medication rates are not published in standardized public sources.
                  The neighborhood layer is ready in PostGIS when aggregate tract/ZCTA proxies exist.
                </p>
                {cityDetail.source_url ? (
                  <a href={cityDetail.source_url} target="_blank" rel="noreferrer">
                    Rate source
                  </a>
                ) : null}
              </section>
            ) : null}

            <section>
              <h2>Saved searches</h2>
              <ul className="saved">
                {searches.map((s) => (
                  <li key={s.id}>
                    <button type="button" className="linkish" onClick={() => void applySearch(s)}>
                      {s.name}
                    </button>
                    <span className="muted">{s.kind}</span>
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </div>
      ) : (
        <div className="sql-page">
          <Suspense fallback={<p className="muted">Loading SQL console…</p>}>
            <SqlConsole
              key={sqlSeed ?? "default"}
              theme={theme}
              schemaHints={schema.hints}
              tables={schema.tables}
              initialSql={sqlSeed}
              onRun={(sql) => api.query(sql)}
              onSave={async (name, sql) => {
                await api.saveSearch({ name, kind: "sql", query: sql });
                setSearches(await api.searches());
              }}
            />
          </Suspense>
        </div>
      )}

      <footer className="foot">
        NHIS 2023 medication for depression is a different metric from Perlis 2026 current
        antidepressant use. City ranges are proxies. SSRI share is not isolated.
      </footer>
    </div>
  );
}
