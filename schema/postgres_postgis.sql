-- Suggested Postgres + PostGIS schema for US Population Intelligence
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE cities (
  id SERIAL PRIMARY KEY,
  rank INT,
  name TEXT NOT NULL,
  state CHAR(2),
  population_2025 BIGINT,
  proxy_pct_low NUMERIC,
  proxy_pct_high NUMERIC,
  notes TEXT,
  geom GEOMETRY(Point, 4326)  -- add lat/lon later
);

CREATE TABLE demographics (
  id SERIAL PRIMARY KEY,
  source TEXT,
  category TEXT, -- sex, age, race, region, generation
  subcategory TEXT,
  pct NUMERIC,
  year INT
);

CREATE TABLE state_rates (
  state CHAR(2) PRIMARY KEY,
  current_antidepressant_pct NUMERIC,
  source TEXT
);

-- Indexes for query performance
CREATE INDEX idx_cities_state ON cities(state);
CREATE INDEX idx_cities_pop ON cities(population_2025);
