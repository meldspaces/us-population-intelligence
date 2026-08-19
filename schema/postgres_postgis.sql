-- =============================================================================
-- US Population Intelligence / Global Population Intelligence
-- Hierarchical PostGIS schema (maximize modern PostGIS capabilities)
-- Hierarchy: Country → State/Province → City → Neighborhood
-- Designed for US granularity now + international expansion later.
-- Aggregate public statistics only. Every data point must carry source links.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;   -- optional advanced topology
-- CREATE EXTENSION IF NOT EXISTS ltree;          -- optional for path queries

-- ---------------------------------------------------------------------------
-- 1. COUNTRY
-- ---------------------------------------------------------------------------
CREATE TABLE countries (
  id              SERIAL PRIMARY KEY,
  iso2            CHAR(2) UNIQUE NOT NULL,          -- US, CA, GB ...
  iso3            CHAR(3) UNIQUE,
  name            TEXT NOT NULL,
  name_official   TEXT,
  population      BIGINT,
  geom            GEOMETRY(MultiPolygon, 4326),     -- national boundary
  centroid        GEOMETRY(Point, 4326),
  source_boundary TEXT,                             -- e.g. Natural Earth / geoBoundaries
  source_pop      TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_countries_geom ON countries USING GIST (geom);
CREATE INDEX idx_countries_iso2 ON countries(iso2);

-- ---------------------------------------------------------------------------
-- 2. STATE / PROVINCE (ADM1)
-- ---------------------------------------------------------------------------
CREATE TABLE states_provinces (
  id              SERIAL PRIMARY KEY,
  country_id      INT NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  code            TEXT NOT NULL,                    -- US: CA, NY, TX ; CA: ON, QC ; etc.
  name            TEXT NOT NULL,
  name_local      TEXT,
  fips            TEXT,                             -- US FIPS if applicable
  population      BIGINT,
  -- Medication / intelligence rates (US focused for now)
  current_antidepressant_pct   NUMERIC(5,2),
  lifetime_antidepressant_pct  NUMERIC(5,2),
  medication_depression_pct    NUMERIC(5,2),        -- NHIS-style
  geom            GEOMETRY(MultiPolygon, 4326),
  centroid        GEOMETRY(Point, 4326),
  source_boundary TEXT,
  source_rates    TEXT,
  source_url      TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (country_id, code)
);

CREATE INDEX idx_states_country ON states_provinces(country_id);
CREATE INDEX idx_states_code    ON states_provinces(code);
CREATE INDEX idx_states_geom    ON states_provinces USING GIST (geom);
CREATE INDEX idx_states_rate    ON states_provinces(current_antidepressant_pct);

-- ---------------------------------------------------------------------------
-- 3. CITY / PLACE (ADM2-ish or incorporated place)
-- ---------------------------------------------------------------------------
CREATE TABLE cities (
  id              SERIAL PRIMARY KEY,
  country_id      INT NOT NULL REFERENCES countries(id),
  state_id        INT REFERENCES states_provinces(id),
  name            TEXT NOT NULL,
  name_local      TEXT,
  state_code      CHAR(2),                          -- denormalized for convenience (US)
  rank_national   INT,                              -- US rank by population
  population      BIGINT,
  population_year INT DEFAULT 2025,
  -- Proxy medication rates (city-level estimates)
  proxy_pct_low   NUMERIC(5,2),
  proxy_pct_high  NUMERIC(5,2),
  proxy_midpoint  NUMERIC(5,2) GENERATED ALWAYS AS (
                    ROUND((COALESCE(proxy_pct_low,0) + COALESCE(proxy_pct_high,0))/2.0, 1)
                  ) STORED,
  notes           TEXT,
  source_pop      TEXT DEFAULT 'Census Vintage 2025',
  source_proxy    TEXT,
  source_url      TEXT,
  lat             DOUBLE PRECISION,
  lon             DOUBLE PRECISION,
  geom            GEOMETRY(Point, 4326),            -- city centroid / representative point
  boundary        GEOMETRY(MultiPolygon, 4326),     -- optional full place boundary (TIGER Places)
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_cities_country   ON cities(country_id);
CREATE INDEX idx_cities_state     ON cities(state_id);
CREATE INDEX idx_cities_statecode ON cities(state_code);
CREATE INDEX idx_cities_rank      ON cities(rank_national);
CREATE INDEX idx_cities_pop       ON cities(population DESC NULLS LAST);
CREATE INDEX idx_cities_geom      ON cities USING GIST (geom);
CREATE INDEX idx_cities_boundary  ON cities USING GIST (boundary);
CREATE INDEX idx_cities_rate      ON cities(proxy_midpoint);

-- ---------------------------------------------------------------------------
-- 4. NEIGHBORHOOD (or Census Tract / ZCTA proxy)
--    Public medication rates almost never exist at this level.
--    Schema supports future data or ACS-derived proxies.
-- ---------------------------------------------------------------------------
CREATE TABLE neighborhoods (
  id              SERIAL PRIMARY KEY,
  city_id         INT NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  name_local      TEXT,
  type            TEXT DEFAULT 'neighborhood',      -- neighborhood | census_tract | zcta | other
  geoid           TEXT,                             -- Census GEOID or local ID
  population      BIGINT,
  -- Future rate fields (currently sparse / null for medication)
  proxy_pct       NUMERIC(5,2),
  notes           TEXT,
  source          TEXT,
  source_url      TEXT,
  geom            GEOMETRY(MultiPolygon, 4326),
  centroid        GEOMETRY(Point, 4326),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_neigh_city  ON neighborhoods(city_id);
CREATE INDEX idx_neigh_geom  ON neighborhoods USING GIST (geom);
CREATE INDEX idx_neigh_type  ON neighborhoods(type);

-- ---------------------------------------------------------------------------
-- 5. DEMOGRAPHICS (flexible, linked to any geo level if needed later)
-- ---------------------------------------------------------------------------
CREATE TABLE demographics (
  id              SERIAL PRIMARY KEY,
  source_name     TEXT NOT NULL,
  source_url      TEXT,
  metric          TEXT NOT NULL,                    -- medication_for_depression, current_antidepressant, etc.
  year            INT,
  geo_level       TEXT,                             -- country | state | city | neighborhood | national
  geo_id          INT,                              -- optional FK-style reference
  category        TEXT NOT NULL,                    -- sex | age_generation | race_ethnicity | region | urbanization
  subcategory     TEXT NOT NULL,
  generations     TEXT[],
  pct             NUMERIC(5,2),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_demo_category ON demographics(category);
CREATE INDEX idx_demo_year     ON demographics(year);
CREATE INDEX idx_demo_metric   ON demographics(metric);

-- ---------------------------------------------------------------------------
-- 6. HEAT-MAP / QUERY HELPER VIEWS (PostGIS maximized)
-- ---------------------------------------------------------------------------

-- City points ready for bubble / heat map
CREATE OR REPLACE VIEW v_cities_heatmap AS
SELECT
  c.id,
  c.name,
  c.state_code,
  sp.name AS state_name,
  co.iso2 AS country,
  c.population,
  c.proxy_pct_low,
  c.proxy_pct_high,
  c.proxy_midpoint,
  c.notes,
  c.source_pop,
  c.source_proxy,
  ST_AsGeoJSON(c.geom)::json AS geometry,
  c.geom
FROM cities c
LEFT JOIN states_provinces sp ON sp.id = c.state_id
LEFT JOIN countries co ON co.id = c.country_id
WHERE c.geom IS NOT NULL;

-- State choropleth ready
CREATE OR REPLACE VIEW v_states_choropleth AS
SELECT
  sp.id,
  sp.code,
  sp.name,
  co.iso2 AS country,
  sp.current_antidepressant_pct,
  sp.lifetime_antidepressant_pct,
  sp.medication_depression_pct,
  sp.source_rates,
  sp.source_url,
  ST_AsGeoJSON(sp.geom)::json AS geometry,
  sp.geom
FROM states_provinces sp
JOIN countries co ON co.id = sp.country_id
WHERE sp.geom IS NOT NULL;

-- Example spatial queries that leverage PostGIS fully:
-- 1. Cities within a state polygon
-- SELECT c.* FROM cities c
-- JOIN states_provinces sp ON ST_Within(c.geom, sp.geom)
-- WHERE sp.code = 'CA';

-- 2. Nearest cities to a point (user location or query)
-- SELECT name, proxy_midpoint, ST_Distance(geom::geography, ST_MakePoint(-118.24, 34.05)::geography) AS meters
-- FROM cities ORDER BY geom <-> ST_SetSRID(ST_MakePoint(-118.24, 34.05), 4326) LIMIT 10;

-- 3. Aggregate rate by state using city points (if desired)
-- SELECT sp.name, AVG(c.proxy_midpoint) FROM cities c
-- JOIN states_provinces sp ON c.state_id = sp.id GROUP BY sp.name;

COMMENT ON TABLE countries IS 'Top-level geography. Prepare for global expansion.';
COMMENT ON TABLE states_provinces IS 'ADM1 (US states, Canadian provinces, etc.). Primary choropleth layer for rates.';
COMMENT ON TABLE cities IS 'Incorporated places / major cities. Primary heat-map point layer for US medication proxies.';
COMMENT ON TABLE neighborhoods IS 'Neighborhoods, census tracts, or ZCTAs. Medication rates rarely published at this level; schema ready for future aggregate data.';
