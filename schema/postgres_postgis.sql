-- US Population Intelligence
-- Postgres + PostGIS schema optimized for heat maps and choropleths
-- Aggregate public statistics only. Every source cited in data/SOURCES.md and JSON metadata.
-- Primary sources:
--   Census Vintage 2025 (populations)
--   NHIS 2023 Data Brief 528 (medication for depression)
--   Perlis et al. BMJ Mental Health 2026 (state antidepressant rates)

CREATE EXTENSION IF NOT EXISTS postgis;

-- City points for heat / bubble map
CREATE TABLE cities (
  id              SERIAL PRIMARY KEY,
  rank            INT NOT NULL,
  name            TEXT NOT NULL,
  state           CHAR(2) NOT NULL,
  population_2025 BIGINT,
  proxy_pct_low   NUMERIC(5,2),
  proxy_pct_high  NUMERIC(5,2),
  notes           TEXT,
  source_pop      TEXT DEFAULT 'Census Vintage 2025',
  source_proxy    TEXT,
  lat             DOUBLE PRECISION,
  lon             DOUBLE PRECISION,
  geom            GEOMETRY(Point, 4326)
);

CREATE INDEX idx_cities_state ON cities(state);
CREATE INDEX idx_cities_rank  ON cities(rank);
CREATE INDEX idx_cities_pop   ON cities(population_2025 DESC);
CREATE INDEX idx_cities_geom  ON cities USING GIST (geom);

-- Demographics (sex, age/generation, race, region, urbanization)
CREATE TABLE demographics (
  id              SERIAL PRIMARY KEY,
  source_name     TEXT NOT NULL,
  source_url      TEXT,
  metric          TEXT NOT NULL,
  year            INT,
  category        TEXT NOT NULL,   -- sex | age_generation | race_ethnicity | region | urbanization
  subcategory     TEXT NOT NULL,
  generations     TEXT[],
  pct             NUMERIC(5,2),
  notes           TEXT
);

CREATE INDEX idx_demo_category ON demographics(category);

-- State-level rates for choropleth
CREATE TABLE state_rates (
  state                       CHAR(2) PRIMARY KEY,
  current_antidepressant_pct  NUMERIC(5,2),
  lifetime_antidepressant_pct NUMERIC(5,2),
  source_name                 TEXT,
  source_url                  TEXT,
  notes                       TEXT
);

-- Helper view for heat-map ready city features
CREATE OR REPLACE VIEW cities_geojson_ready AS
SELECT
  id, rank, name, state, population_2025,
  proxy_pct_low, proxy_pct_high,
  ROUND((proxy_pct_low + proxy_pct_high)/2.0, 1) AS proxy_midpoint,
  notes, source_pop, source_proxy,
  ST_AsGeoJSON(geom)::json AS geometry
FROM cities
WHERE geom IS NOT NULL;

-- Example heat-map query (points sized/colored by rate):
-- SELECT name, state, proxy_midpoint, ST_AsGeoJSON(geom)
-- FROM cities_geojson_ready ORDER BY proxy_midpoint DESC;
