# Grok Build Prompt
## US Population Intelligence Index + Queryable UI

**Repo**: https://github.com/meldspaces/us-population-intelligence  
**Purpose**: Standalone hierarchical population & medication-proxy intelligence index with a modern queryable UI (SQL + adaptive auto-charts + heat maps + saved searches).  
This may later be incorporated into a larger “territory intel” system, but treat it as a complete, self-contained product for now.

---

### 1. Core Data Model (already designed)

Hierarchical geography (PostGIS):
```
Country
 └── State / Province
      └── City
           └── Neighborhood
```

- Schema file: `schema/postgres_postgis.sql`
- Maximizes modern PostGIS: MultiPolygon for countries/states/neighborhoods, Point for cities, GIST indexes, generated columns, GeoJSON-ready views (`v_cities_heatmap`, `v_states_choropleth`).
- Prepared for future international expansion (ISO country codes, flexible state/province codes).

Key tables:
- `countries`
- `states_provinces` (includes current & lifetime antidepressant rates)
- `cities` (population + proxy medication rate ranges + midpoint)
- `neighborhoods` (geometry ready; note that public medication rates almost never exist at this level)
- `demographics` (sex, age/generation, race/ethnicity, region, urbanization)

---

### 2. Data Rules (non-negotiable)

- **Aggregate public statistics only**. Never collect or store individual-level data.
- Every rate, population figure, and geometry source **must** display its full source link / citation.
- All medication figures are **proxies** (NHIS “medication for depression”, Perlis “current antidepressant use”, Household Pulse, etc.). SSRIs form the majority of antidepressant prescriptions but are not isolated in these public sources.
- Clearly surface caveats in the UI.

Primary sources already in the repo:
- Census Vintage 2025 (city populations)
- NHIS 2023 Data Brief 528 (medication for depression by demographics)
- Perlis et al., BMJ Mental Health 2026 (state antidepressant rates + supplemental table)
- Household Pulse Survey (selected metro examples)
- Full list in `data/SOURCES.md` and metadata fields inside the JSON files.

---

### 3. What to Build

#### A. Backend / Data Layer
1. Apply `schema/postgres_postgis.sql`.
2. Implement (or complete) the ETL described in `etl/README.md`:
   - Load countries (start with United States)
   - Load states_provinces + Perlis rates
   - Load cities with accurate lat/lon → `ST_SetSRID(ST_MakePoint(lon, lat), 4326)`
   - Optional: load state polygons from public Cartographic Boundary / geoBoundaries files for true choropleth
3. Expose:
   - Safe, parameterized, read-only SQL endpoint
   - REST + GeoJSON endpoints for each hierarchy level
   - Ability to save and re-run named searches (saved searches)

#### B. Frontend / UI (highest priority)
- **Hero view**: Interactive United States heat map / choropleth
  - State choropleth colored by current antidepressant rate
  - City bubble / point map sized & colored by proxy midpoint rate
  - Smooth drill-down (national → state → city → neighborhood when geometry exists)
- **Adaptive charts**: Automatically choose the best visualization based on query result shape (ranked bars, grouped bars by generation, pie/donut for sex/race composition, heatmaps for intersections, etc.).
- **SQL console**: Direct SQL with schema hints and result → auto-chart.
- **Saved searches**: Users can name, save, and re-run filter combinations or SQL snippets.
- Modern, high-visibility design (dark/light mode, responsive).
- Always show source links and proxy caveats next to any rate number.

Recommended stack suggestions (you may choose better):
- Map: MapLibre GL JS
- Charts: Observable Plot, Chart.js, or ECharts (adaptive logic required)
- Backend: whatever pairs cleanly with Postgres + PostGIS (Node, Python/FastAPI, etc.)

---

### 4. Starting Instructions for Grok Build

1. Clone the repo and inspect `schema/`, `data/`, and `etl/`.
2. Stand up a local Postgres + PostGIS instance and apply the schema.
3. Write / finish the ETL so cities have real geometries and states have rates.
4. Build the map-first dashboard that defaults to the US heat map.
5. Add the SQL interface + adaptive chart engine + saved-search feature.
6. Surface every data source link and the “proxy” disclaimer prominently.

---

### 5. Success Criteria

- A user can open the app and immediately see geographic patterns in antidepressant/medication-for-depression prevalence across the United States.
- They can filter by generation, sex, race, state, or city and watch both the map and charts update.
- They can write or load a SQL query and get both a table and an intelligently chosen chart.
- They can save interesting queries/filters for later.
- Everything remains fully sourced and clearly labeled as aggregate proxy data.

This is a clean, modern population-intelligence index focused on high-quality spatial + demographic insight.
