import fs from "node:fs/promises";
import path from "node:path";
import { pool } from "./db.js";
import { serverLog } from "./logger.js";

const DATA_DIR = path.join(process.cwd(), "data");
const SCHEMA_PATH = path.join(process.cwd(), "schema", "postgres_postgis.sql");

type StateRate = {
  state: string;
  name: string;
  fips: string;
  census_region: string;
  current_pct: number;
  lifetime_pct: number;
};

type CityRow = {
  rank: number;
  city: string;
  state: string;
  population_2025: number;
  lat: number;
  lon: number;
  proxy_pct_low: number;
  proxy_pct_high: number;
  proxy_kind: string;
  notes: string;
  source_pop: string;
  source_pop_url: string;
  source_proxy: string;
  source_proxy_url: string;
};

type NhisFile = {
  source: string;
  source_url: string;
  metric: string;
  overall: number;
  by_sex: Record<string, number>;
  by_age_generation: Array<{ age_group: string; generations: string[]; pct: number }>;
  by_race: Record<string, number>;
  by_region: Record<string, number>;
  by_urbanization: Record<string, number>;
  notes: string;
};

type PerlisDemo = {
  source: string;
  source_url: string;
  metric: string;
  year: number;
  overall: number;
  by_sex: Record<string, number | null>;
  by_age: Array<{ age_group: string; pct: number }>;
  by_race: Record<string, number>;
  notes: string;
};

async function readJson<T>(file: string): Promise<T> {
  const raw = await fs.readFile(path.join(DATA_DIR, file), "utf8");
  return JSON.parse(raw) as T;
}

async function applySchema(): Promise<void> {
  const sql = await fs.readFile(SCHEMA_PATH, "utf8");
  await pool.query(sql);
}

async function loadCountry(): Promise<number> {
  const result = await pool.query<{ id: number }>(
    `INSERT INTO countries (iso2, iso3, name, name_official, source_boundary, notes)
     VALUES ('US', 'USA', 'United States', 'United States of America',
             'U.S. Census Bureau Cartographic Boundary Files 2025, states 1:5,000,000 (cb_2025_us_state_5m), unioned at load',
             'Standalone US index; schema is ready for additional ISO countries.')
     ON CONFLICT (iso2) DO UPDATE SET
       name = EXCLUDED.name,
       source_boundary = EXCLUDED.source_boundary,
       notes = EXCLUDED.notes,
       updated_at = now()
     RETURNING id`,
  );
  return result.rows[0].id;
}

const CENSUS_CB_PATH = path.join(DATA_DIR, "geo", "cb_us_state_5m.geojson");
const CENSUS_CB_SOURCE =
  "U.S. Census Bureau Cartographic Boundary Files 2025 (cb_2025_us_state_5m, 1:5,000,000). Public domain. https://www.census.gov/geographies/mapping-files/time-series/geo/cartographic-boundary.html";

type CensusStateFeature = {
  properties: {
    NAME?: string;
    STUSPS?: string;
    STATEFP?: string;
    GEOID?: string;
  };
  geometry: { type: string; coordinates: unknown };
};

async function loadCensusStatePolygons(): Promise<Map<string, CensusStateFeature["geometry"]>> {
  const geoRaw = await fs.readFile(CENSUS_CB_PATH, "utf8");
  const geo = JSON.parse(geoRaw) as { features: CensusStateFeature[] };
  const byCode = new Map<string, CensusStateFeature["geometry"]>();
  for (const feature of geo.features) {
    const code = feature.properties.STUSPS?.toUpperCase();
    if (!code || !feature.geometry) continue;
    byCode.set(code, feature.geometry);
  }
  if (byCode.size < 51) {
    throw new Error(`Census cartographic file expected 50 states + DC, got ${byCode.size} STUSPS codes`);
  }
  serverLog("info", "Loaded Census cartographic boundary polygons", { states: byCode.size });
  return byCode;
}

async function loadStates(countryId: number): Promise<Map<string, number>> {
  const rates = await readJson<{
    primary_source: { url: string; name: string };
    states: StateRate[];
  }>("state_rates.json");
  const geomByCode = await loadCensusStatePolygons();

  const ids = new Map<string, number>();
  for (const state of rates.states) {
    const geometry = geomByCode.get(state.state) ?? null;
    const geomJson = geometry ? JSON.stringify(geometry) : null;
    const result = await pool.query<{ id: number }>(
      `INSERT INTO states_provinces (
         country_id, code, name, fips, current_antidepressant_pct, lifetime_antidepressant_pct,
         geom, centroid, source_boundary, source_rates, source_url, notes
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         CASE WHEN $7::text IS NULL THEN NULL
              ELSE ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($7), 4326)), 3))
         END,
         CASE WHEN $7::text IS NULL THEN NULL
              ELSE ST_PointOnSurface(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($7), 4326)))
         END,
         $8, $9, $10, $11
       )
       ON CONFLICT (country_id, code) DO UPDATE SET
         name = EXCLUDED.name,
         fips = EXCLUDED.fips,
         current_antidepressant_pct = EXCLUDED.current_antidepressant_pct,
         lifetime_antidepressant_pct = EXCLUDED.lifetime_antidepressant_pct,
         geom = EXCLUDED.geom,
         centroid = EXCLUDED.centroid,
         source_boundary = EXCLUDED.source_boundary,
         source_rates = EXCLUDED.source_rates,
         source_url = EXCLUDED.source_url,
         notes = EXCLUDED.notes,
         updated_at = now()
       RETURNING id`,
      [
        countryId,
        state.state,
        state.name,
        state.fips,
        state.current_pct,
        state.lifetime_pct,
        geomJson,
        CENSUS_CB_SOURCE,
        "Perlis et al. BMJ Mental Health 2026 Supplemental Table 3",
        rates.primary_source.url,
        `Census region: ${state.census_region}. Current ${state.current_pct}%; lifetime ${state.lifetime_pct}%. Self-reported antidepressant use (not SSRI-only). Polygon: Census CB 2025 5m.`,
      ],
    );
    ids.set(state.state, result.rows[0].id);
  }

  await pool.query(
    `UPDATE countries SET
       geom = sub.geom,
       centroid = ST_Centroid(sub.geom),
       updated_at = now()
     FROM (
       SELECT ST_Multi(ST_Union(geom)) AS geom
       FROM states_provinces
       WHERE country_id = $1 AND geom IS NOT NULL
     ) sub
     WHERE countries.id = $1 AND sub.geom IS NOT NULL`,
    [countryId],
  );

  return ids;
}

async function loadCities(countryId: number, stateIds: Map<string, number>): Promise<void> {
  const cities = await readJson<CityRow[]>("top50_cities.json");
  for (const city of cities) {
    const stateId = stateIds.get(city.state) ?? null;
    await pool.query(
      `INSERT INTO cities (
         country_id, state_id, name, state_code, rank_national, population, population_year,
         proxy_pct_low, proxy_pct_high, notes, source_pop, source_proxy, source_url,
         lat, lon, geom
       ) VALUES (
         $1, $2, $3, $4, $5, $6, 2025,
         $7, $8, $9, $10, $11, $12,
         $13, $14, ST_SetSRID(ST_MakePoint($14, $13), 4326)
       )
       ON CONFLICT (country_id, name, state_code) DO UPDATE SET
         state_id = EXCLUDED.state_id,
         rank_national = EXCLUDED.rank_national,
         population = EXCLUDED.population,
         proxy_pct_low = EXCLUDED.proxy_pct_low,
         proxy_pct_high = EXCLUDED.proxy_pct_high,
         notes = EXCLUDED.notes,
         source_pop = EXCLUDED.source_pop,
         source_proxy = EXCLUDED.source_proxy,
         source_url = EXCLUDED.source_url,
         lat = EXCLUDED.lat,
         lon = EXCLUDED.lon,
         geom = EXCLUDED.geom,
         updated_at = now()`,
      [
        countryId,
        stateId,
        city.city,
        city.state,
        city.rank,
        city.population_2025,
        city.proxy_pct_low,
        city.proxy_pct_high,
        `${city.notes} [${city.proxy_kind}]`,
        city.source_pop,
        city.source_proxy,
        city.source_proxy_url,
        city.lat,
        city.lon,
      ],
    );
  }
}

async function insertDemo(row: {
  source_name: string;
  source_url: string;
  metric: string;
  year: number;
  geo_level: string;
  category: string;
  subcategory: string;
  generations?: string[];
  pct: number | null;
  notes: string;
}): Promise<void> {
  if (row.pct === null && row.metric !== "generation_definition") return;
  const exists = await pool.query(
    `SELECT 1 FROM demographics
     WHERE source_name = $1 AND metric = $2 AND year = $3
       AND category = $4 AND subcategory = $5
     LIMIT 1`,
    [row.source_name, row.metric, row.year, row.category, row.subcategory],
  );
  if (exists.rows.length > 0) {
    await pool.query(
      `UPDATE demographics SET pct = $1, notes = $2, source_url = $3, generations = $4
       WHERE source_name = $5 AND metric = $6 AND year = $7
         AND category = $8 AND subcategory = $9`,
      [
        row.pct,
        row.notes,
        row.source_url,
        row.generations ?? null,
        row.source_name,
        row.metric,
        row.year,
        row.category,
        row.subcategory,
      ],
    );
    return;
  }
  await pool.query(
    `INSERT INTO demographics (
       source_name, source_url, metric, year, geo_level, category, subcategory, generations, pct, notes
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      row.source_name,
      row.source_url,
      row.metric,
      row.year,
      row.geo_level,
      row.category,
      row.subcategory,
      row.generations ?? null,
      row.pct,
      row.notes,
    ],
  );
}

async function loadDemographics(): Promise<void> {
  const nhis = await readJson<NhisFile>("demographics_nhis_2023.json");
  const gens = await readJson<{ definitions: Array<{ name: string; birth_years: string; ages: string }> }>(
    "generations.json",
  );
  const perlis = await readJson<PerlisDemo>("perlis_national_demographics_2026.json");

  await insertDemo({
    source_name: nhis.source,
    source_url: nhis.source_url,
    metric: "medication_for_depression",
    year: 2023,
    geo_level: "national",
    category: "overall",
    subcategory: "adults_18_plus",
    pct: nhis.overall,
    notes: nhis.notes,
  });
  for (const [k, v] of Object.entries(nhis.by_sex)) {
    await insertDemo({
      source_name: nhis.source,
      source_url: nhis.source_url,
      metric: "medication_for_depression",
      year: 2023,
      geo_level: "national",
      category: "sex",
      subcategory: k,
      pct: v,
      notes: nhis.notes,
    });
  }
  for (const row of nhis.by_age_generation) {
    await insertDemo({
      source_name: nhis.source,
      source_url: nhis.source_url,
      metric: "medication_for_depression",
      year: 2023,
      geo_level: "national",
      category: "age_generation",
      subcategory: row.age_group,
      generations: row.generations,
      pct: row.pct,
      notes: nhis.notes,
    });
  }
  for (const [k, v] of Object.entries(nhis.by_race)) {
    await insertDemo({
      source_name: nhis.source,
      source_url: nhis.source_url,
      metric: "medication_for_depression",
      year: 2023,
      geo_level: "national",
      category: "race_ethnicity",
      subcategory: k,
      pct: v,
      notes: nhis.notes,
    });
  }
  for (const [k, v] of Object.entries(nhis.by_region)) {
    await insertDemo({
      source_name: nhis.source,
      source_url: nhis.source_url,
      metric: "medication_for_depression",
      year: 2023,
      geo_level: "national",
      category: "region",
      subcategory: k,
      pct: v,
      notes: nhis.notes,
    });
  }
  for (const [k, v] of Object.entries(nhis.by_urbanization)) {
    await insertDemo({
      source_name: nhis.source,
      source_url: nhis.source_url,
      metric: "medication_for_depression",
      year: 2023,
      geo_level: "national",
      category: "urbanization",
      subcategory: k,
      pct: v,
      notes: nhis.notes,
    });
  }

  await insertDemo({
    source_name: perlis.source,
    source_url: perlis.source_url,
    metric: "current_antidepressant",
    year: perlis.year,
    geo_level: "national",
    category: "overall",
    subcategory: "adults",
    pct: perlis.overall,
    notes: perlis.notes,
  });
  for (const [k, v] of Object.entries(perlis.by_sex)) {
    await insertDemo({
      source_name: perlis.source,
      source_url: perlis.source_url,
      metric: "current_antidepressant",
      year: perlis.year,
      geo_level: "national",
      category: "sex",
      subcategory: k,
      pct: v,
      notes: perlis.notes,
    });
  }
  for (const row of perlis.by_age) {
    await insertDemo({
      source_name: perlis.source,
      source_url: perlis.source_url,
      metric: "current_antidepressant",
      year: perlis.year,
      geo_level: "national",
      category: "age_generation",
      subcategory: row.age_group,
      pct: row.pct,
      notes: perlis.notes,
    });
  }
  for (const [k, v] of Object.entries(perlis.by_race)) {
    await insertDemo({
      source_name: perlis.source,
      source_url: perlis.source_url,
      metric: "current_antidepressant",
      year: perlis.year,
      geo_level: "national",
      category: "race_ethnicity",
      subcategory: k,
      pct: v,
      notes: perlis.notes,
    });
  }

  for (const def of gens.definitions) {
    await insertDemo({
      source_name: "Generation definitions (Pew-style bands used in this index)",
      source_url: "https://www.cdc.gov/nchs/products/databriefs/db528.htm",
      metric: "generation_definition",
      year: 2026,
      geo_level: "national",
      category: "generation",
      subcategory: def.name,
      generations: [def.name],
      pct: null,
      notes: `Birth years ${def.birth_years}; ages ${def.ages} as of 2026.`,
    });
  }
}

async function seedSavedSearches(): Promise<void> {
  const seeds = [
    {
      name: "Highest current antidepressant states",
      kind: "sql",
      query: `SELECT name, code, current_antidepressant_pct, lifetime_antidepressant_pct, source_url
FROM states_provinces
ORDER BY current_antidepressant_pct DESC NULLS LAST`,
      description: "Ranked Perlis 2026 current use by state",
    },
    {
      name: "City proxy midpoints vs population",
      kind: "sql",
      query: `SELECT name, state_code, population, proxy_pct_low, proxy_pct_high, proxy_midpoint, notes
FROM cities
ORDER BY proxy_midpoint DESC NULLS LAST`,
      description: "Top-50 cities by proxy midpoint",
    },
    {
      name: "NHIS medication for depression by group",
      kind: "sql",
      query: `SELECT category, subcategory, pct, generations, source_url
FROM demographics
WHERE metric = 'medication_for_depression'
ORDER BY category, pct DESC NULLS LAST`,
      description: "CDC NHIS 2023 demographic breakdown",
    },
    {
      name: "National demographic filters",
      kind: "filters",
      filters: { generation: "18-44", sex: "women", race: "white_non_hispanic" },
      description: "NHIS slices commonly used as a starting point",
    },
  ];

  for (const seed of seeds) {
    const exists = await pool.query(`SELECT 1 FROM saved_searches WHERE name = $1 LIMIT 1`, [seed.name]);
    if (exists.rows.length > 0) continue;
    await pool.query(
      `INSERT INTO saved_searches (name, kind, query, filters, description)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        seed.name,
        seed.kind,
        seed.query ?? null,
        seed.filters ? JSON.stringify(seed.filters) : null,
        seed.description,
      ],
    );
  }
}

export async function runEtl(): Promise<void> {
  serverLog("info", "ETL starting");
  await applySchema();
  const countryId = await loadCountry();
  const stateIds = await loadStates(countryId);
  await loadCities(countryId, stateIds);
  await loadDemographics();
  await seedSavedSearches();
  const counts = await pool.query(
    `SELECT
       (SELECT count(*) FROM states_provinces) AS states,
       (SELECT count(*) FROM cities) AS cities,
       (SELECT count(*) FROM demographics) AS demographics`,
  );
  serverLog("info", "ETL complete", counts.rows[0] as Record<string, unknown>);
}

const isDirect = process.argv[1]?.includes("etl");
if (isDirect) {
  runEtl()
    .then(async () => {
      await pool.end();
    })
    .catch(async (err: unknown) => {
      serverLog("error", "ETL failed", { error: err instanceof Error ? err.message : String(err) });
      await pool.end();
      process.exit(1);
    });
}
