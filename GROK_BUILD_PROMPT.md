# Grok Build Prompt – US Population Intelligence (Heat-Map Ready)

Build a modern, queryable web application + API for the US Population Intelligence dataset, with **primary emphasis on an interactive heat map / choropleth of the United States**.

## Core Requirements

### Backend
- Postgres + **PostGIS** (required for spatial queries and heat maps).
- Schema: `schema/postgres_postgis.sql`
- Load all JSON from `/data` via ETL scripts (Python preferred: pandas + psycopg2 or SQLAlchemy + geoalchemy2).
- Expose:
  - Raw SQL endpoint (parameterized, read-only)
  - REST API for filtered queries (city, state, generation, sex, race, rate range)
  - Spatial endpoints that return GeoJSON FeatureCollections ready for maps

### Heat Map / Choropleth (Priority Feature)
Two complementary views:
1. **City point heat map / bubble map**
   - Points from `cities.geom` (SRID 4326)
   - Color and/or size by midpoint of `proxy_pct_low` / `proxy_pct_high` or a user-selected rate field
   - Tooltips: city, state, population, proxy range, notes, sources
2. **State-level choropleth**
   - Use `state_rates` table joined to public US state polygons (or pre-load a simple state GeoJSON)
   - Color scale by current antidepressant rate (Perlis 2026)

Use a modern mapping library (MapLibre GL JS, Leaflet + heat plugins, or Observable Plot + D3 geo) that supports both point density and choropleth. Adaptive: if the query returns geometry, default to map; otherwise fall back to ranked bars / faceted charts.

### Adaptive Charts
- Hyper-modern JS (Chart.js, Observable Plot, D3, or ECharts)
- Auto-select visualization based on result shape:
  - Generation / age → grouped or stacked bars
  - Sex or race → horizontal bars or pie
  - State or city ranking → sorted bars or map
  - Intersections → heatmaps or small-multiples
- Dark/light mode, high contrast, responsive

### Data Notes (must surface in UI)
- All figures are **aggregate public statistics only**. No individual data.
- Rates are **proxies** (medication for depression / current antidepressant use). SSRIs form the majority of antidepressant prescriptions but are not isolated in these surveys.
- Full source links must be displayed (see `data/SOURCES.md` and metadata fields in every JSON).

### Suggested Start
1. Implement ETL that populates `cities` with `ST_SetSRID(ST_MakePoint(lon, lat), 4326)` and loads state rates.
2. Create a sample dashboard page with the US heat map as the hero view.
3. Add filter controls that re-query and re-render the map or charts adaptively.

Primary goal: a beautiful, queryable intelligence layer that lets a user immediately see geographic patterns in antidepressant/medication-for-depression prevalence across the top US cities and states.
