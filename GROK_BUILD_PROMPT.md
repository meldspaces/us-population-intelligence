# Grok Build Prompt for US Population Intelligence Dashboard

Build a modern, queryable web app / API for the US Population Intelligence dataset.

## Requirements
- Backend: Postgres + PostGIS (or SQLite for prototype) with the schema in schema/postgres_postgis.sql
- Load data from data/*.json
- Expose SQL query endpoint and REST API for filtered queries (by city, state, age/generation, sex, race)
- Frontend: Hyper-modern adaptive JS charts (Chart.js / Observable / D3 or similar) that automatically choose best visualization (bar, choropleth map if geo available, line for trends, pie for composition) based on the query result shape and user filters.
- Support natural language or structured filters that translate to SQL.
- Responsive, dark/light mode, high-visibility design.
- Include all collected data: top 50 cities proxies, NHIS 2023 demographics with generation labels, Perlis state rates, sources and caveats.

## Data Sources Summary
- Census Vintage 2025 populations
- NHIS 2023 medication for depression (sex, age, race, region, urbanization)
- Perlis et al. 2026 current antidepressant rates by state and demographics
- Pulse Survey metro examples (Seattle high, etc.)

Make charts adapt: e.g. if querying by generation → grouped bars; by state → map or ranked bars; intersections → heatmaps or faceted views.

Start by creating the DB load scripts, API routes, and a sample dashboard page.