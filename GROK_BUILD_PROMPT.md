# Grok Build Prompt – US / Global Population Intelligence (Hierarchical + Heat-Map)

Build a modern, queryable web application + API on top of the hierarchical PostGIS database.

## Geography Hierarchy (required)
Country → State/Province → City → Neighborhood

Schema is already designed for this hierarchy and for future international expansion.

## Primary Visualization Goal
Interactive **United States heat map / choropleth** that can zoom from national → state → city (and later neighborhood when data exists).

- State level: choropleth colored by current antidepressant rate (Perlis 2026)
- City level: point / bubble map sized & colored by proxy medication midpoint rate
- Adaptive: when the user drills into a city that has neighborhood polygons, switch to that layer

## Technical Requirements
- Backend: Postgres + **latest PostGIS** (use spatial indexes, ST_Within, ST_DWithin, <-> KNN, ST_AsGeoJSON, geography type where distance matters)
- Load via the ETL described in `/etl`
- Expose:
  - Parameterized SQL (read-only)
  - REST + GeoJSON endpoints for each hierarchy level
  - Natural-language or structured filters that translate to spatial + attribute queries
- Frontend: MapLibre GL JS (or equivalent) + adaptive Chart.js / Observable Plot / D3 charts
- Dark/light mode, high visibility, mobile responsive

## Data Rules (non-negotiable)
- Aggregate public statistics only
- Every rate and population figure must display its source link
- Clearly label all medication figures as **proxies** (SSRIs are the majority class but not isolated)

## Start Here
1. Run the hierarchical schema
2. Implement ETL that populates countries (US), states_provinces (with rates + optional polygons), cities (with points + rates)
3. Build the map page that defaults to the US state choropleth and city bubbles, with drill-down
4. Add filters for generation, sex, race that re-query and update both map and charts

This is the foundation for a scalable population-intelligence layer that begins with US antidepressant/medication proxies and can expand globally.
