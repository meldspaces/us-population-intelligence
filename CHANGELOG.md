# Changelog

## 1.0.0 — 2026-08-25

- PostGIS schema applied on boot (countries, states, cities, neighborhoods, demographics, saved searches).
- ETL loads complete Perlis 2026 Supplemental Table 3 (50 states + DC), Census Vintage 2025 top 50 cities with geometries, NHIS 2023 demographics.
- State choropleth polygons from official Census Cartographic Boundary Files 2025 (`cb_2025_us_state_5m`, 1:5,000,000).
- REST + GeoJSON endpoints, read-only SQL console, adaptive charts, saved searches.
- Map-first UI: state choropleth, city bubbles, filters, source links, proxy caveats.
- Railway deploy against existing git-linked `us-population-intelligence` service plus a dedicated PostGIS database.
