-- US Population Intelligence / Global-ready Population Intelligence
-- Postgres + PostGIS (latest features) hierarchical schema
-- Dimensions: Country → State/Province → City → Neighborhoods
-- Prepared for international expansion (municipalities, etc.)
-- All data: aggregate public statistics only + full source links in SOURCES.md / JSON metadata

CREATE EXTENSION IF NOT EXISTS postgis;
-- Optional for advanced topology later: CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- ==========================================================
-- 1. Countries
-- ==========================================================
CREATE TABLE countries (
  country_code   CHAR(2) PRIMARY KEY,          -- ISO 3166-1 alpha-2
  country_code3  CHAR(3),
  name           TEXT NOT NULL,
  population     BIGINT,
  geom           GEOMETRY(MultiPolygon, 4326),
  source         TEXT,
  source_url     TEXT,
  updated_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_countries_geom ON countries USING GIST (geom);

-- ==========================================================
-- 2. States / Provinces (admin level 1)
-- ==========================================================
CREATE TABLE states_provinces (
  id             SERIAL PRIMARY KEY,
  country_code   CHAR(2) NOT NULL REFERENCES countries(country_code),
  state_code     VARCHAR(10) NOT NULL,         -- e.g. US-CA, or CA for US, or ON for Canada
  name           TEXT NOT NULL,
  fips           VARCHAR(5),                   -- US FIPS
  population     BIGINT,
  current_antidepressant_pct NUMERIC(5,2),
  med_for_depression_pct     NUMERIC(5,2),
  geom           GEOMETRY(MultiPolygon, 4326),
  source_pop     TEXT,
  source_rate    TEXT,
  source_url     TEXT,
  UNIQUE (country_code, state_code)
);
CREATE INDEX idx_states_country ON states_provinces(country_code);
CREATE INDEX idx_states_geom ON states_provinces USING GIST (geom);
CREATE INDEX idx_states_rate ON states_provinces(current_antidepressant_pct DESC NULLS LAST);

-- ==========================================================
-- 3. Cities / Municipalities (admin level 2 / places)
-- ==========================================================
CREATE TABLE cities (
  id              SERIAL PRIMARY KEY,
  country_code    CHAR(2) NOT NULL REFERENCES countries(country_code),
  state_id        INT REFERENCES states_provinces(id),
  state_code      VARCHAR(10),
  name            TEXT NOT NULL,
  rank_national   INT,
  population      BIGINT,
  population_year INT DEFAULT 2025,
  proxy_pct_low   NUMERIC(5,2),
  proxy_pct_high  NUMERIC(5,2),
  proxy_midpoint  NUMERIC(5,2) GENERATED ALWAYS AS (
                    CASE WHEN proxy_pct_low IS NOT NULL AND proxy_pct_high IS NOT NULL
                         THEN ROUND((proxy_pct_low + proxy_pct_high)/2.0, 1)
                         ELSE NULL END
                  ) STORED,
  lat             DOUBLE PRECISION,
  lon             DOUBLE PRECISION,
  geom            GEOMETRY(Point, 4326),
  notes           TEXT,
  source_pop      TEXT DEFAULT 'Census Vintage 2025',
  source_proxy    TEXT,
  source_url      TEXT
);
CREATE INDEX idx_cities_country_state ON cities(country_code, state_code);
CREATE INDEX idx_cities_rank ON cities(rank_national);
CREATE INDEX idx_cities_pop ON cities(population DESC NULLS LAST);
CREATE INDEX idx_cities_geom ON cities USING GIST (geom);
CREATE INDEX idx_cities_rate ON cities(proxy_midpoint DESC NULLS LAST);

-- ==========================================================
-- 4. Neighborhoods / Tracts / ZCTAs (finest practical level)
-- Note: Public medication/SSRI rates almost never available at neighborhood scale.
-- Table prepared for future data or for Census tract / ZCTA proxies + boundary storage.
-- ==========================================================
CREATE TABLE neighborhoods (
  id              SERIAL PRIMARY KEY,
  city_id         INT REFERENCES cities(id),
  country_code    CHAR(2) REFERENCES countries(country_code),
  state_code      VARCHAR(10),
  name            TEXT NOT NULL,
  neighborhood_type TEXT,                      -- 'neighborhood' | 'census_tract' | 'zcta' | 'municipality'
  geoid           TEXT,                        -- Census GEOID or equivalent
  population      BIGINT,
  proxy_pct       NUMERIC(5,2),                -- rarely available
  geom            GEOMETRY(MultiPolygon, 4326),
  source          TEXT,
  source_url      TEXT,
  notes           TEXT DEFAULT 'Medication rates rarely published at this granularity; geometry for future join or ACS health proxies.'
);
CREATE INDEX idx_neigh_city ON neighborhoods(city_id);
CREATE INDEX idx_neigh_geom ON neighborhoods USING GIST (geom);

-- ==========================================================
-- 5. Demographics (flexible, can be attached to any level via scope)
-- ==========================================================
CREATE TABLE demographics (
  id              SERIAL PRIMARY KEY,
  scope_level     TEXT NOT NULL,               -- 'country' | 'state' | 'city' | 'neighborhood' | 'national'
  scope_id        TEXT,                        -- FK-like reference (country_code, state_code, city id, etc.)
  source_name     TEXT NOT NULL,
  source_url      TEXT,
  metric          TEXT NOT NULL,
  year            INT,
  category        TEXT NOT NULL,               -- sex | age_generation | race_ethnicity | region | urbanization
  subcategory     TEXT NOT NULL,
  generations     TEXT[],
  pct             NUMERIC(5,2),
  notes           TEXT
);
CREATE INDEX idx_demo_scope ON demographics(scope_level, scope_id);
CREATE INDEX idx_demo_category ON demographics(category);

-- ==========================================================
-- Heat-map / choropleth ready views (PostGIS maximized)
-- ==========================================================
CREATE OR REPLACE VIEW v_cities_heatmap AS
SELECT
  id, name, state_code, country_code, population,
  proxy_pct_low, proxy_pct_high, proxy_midpoint,
  lat, lon,
  ST_AsGeoJSON(geom)::json AS geometry,
  notes, source_pop, source_proxy
FROM cities
WHERE geom IS NOT NULL;

CREATE OR REPLACE VIEW v_states_choropleth AS
SELECT
  state_code, name, country_code,
  current_antidepressant_pct, med_for_depression_pct,
  ST_AsGeoJSON(geom)::json AS geometry,
  source_rate, source_url
FROM states_provinces
WHERE geom IS NOT NULL;

-- Example queries for adaptive charts:
-- City heat/bubble: SELECT * FROM v_cities_heatmap ORDER BY proxy_midpoint DESC;
-- State choropleth: SELECT * FROM v_states_choropleth ORDER BY current_antidepressant_pct DESC;
-- Spatial join example: cities within a state polygon, etc.
