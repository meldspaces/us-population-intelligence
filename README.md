# US Population Intelligence Index

Standalone hierarchical population and medication-proxy index with a map-first query UI.

**Live (Railway):** https://us-population-intelligence-production.up.railway.app

Hierarchy: Country → State/Province → City → Neighborhood (PostGIS). Neighborhood rates are almost never published; the schema is ready for future aggregate tract/ZCTA proxies.

## What you can do

- Open a United States choropleth of **current antidepressant use** (Perlis et al. 2026, Supplemental Table 3).
- Overlay the top 50 Census Vintage 2025 cities as bubbles (size = population, color = proxy midpoint).
- Filter by generation/age, sex, and race using **NHIS 2023** national rates (those intersections are not published at state/city level).
- Run read-only SQL; results get an adaptive chart plus a table.
- Save filter combinations or SQL snippets and re-run them.

## Data rules

- Aggregate public statistics only. No individual-level data.
- Every rate carries a source URL in the database and UI.
- Medication figures are **proxies** (medication for depression, current antidepressant use, Household Pulse mental-health Rx). SSRIs dominate antidepressants but are not isolated in these sources.

Primary sources: [SOURCES.md](SOURCES.md).

## Stack

- Postgres 16 + PostGIS
- Node / Express API (`server/`)
- Vite + React + MapLibre GL + ECharts (`client/`)
- ETL on boot from `data/` + `schema/postgres_postgis.sql`

## Local development

```bash
cp .env.example .env
docker compose up -d
npm install
npm run dev
```

- UI: http://127.0.0.1:5173
- API: http://127.0.0.1:8080/api/health

`DATABASE_URL` must point at PostGIS. The API applies the schema and loads data on startup.

## Production

The Railway service `us-population-intelligence` (project `meld`) serves the app. It reads `DATABASE_URL` from the dedicated `PostGIS` service on the private network. First boot runs ETL.
