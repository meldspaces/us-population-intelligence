# ETL Pipeline – US / Global Population Intelligence

## Goals
- Load hierarchical geography: Country → State/Province → City → Neighborhood
- Populate PostGIS geometries (Points for cities, MultiPolygons for higher admin levels)
- Ingest all rate / demographic JSON with full source attribution
- Support US heat maps now and international expansion later

## Recommended Stack
- Python 3.11+
- pandas / geopandas
- psycopg2 or SQLAlchemy + geoalchemy2
- shapely / pyproj

## Suggested Load Order
1. countries (start with United States; later Natural Earth / geoBoundaries)
2. states_provinces (US states + Perlis rates + optional TIGER / geoBoundaries polygons)
3. cities (top 50/100 + lat/lon from Census Gazetteer or public centroids + proxy rates)
4. neighborhoods (optional / placeholder – Census tracts or city open-data neighborhoods when available)
5. demographics (NHIS, generations, etc.)

## Geometry Sources (public domain / open license)
- US Census TIGER/Line & Cartographic Boundary Files (2025)
- Census Gazetteer Files (lat/lon for places)
- geoBoundaries (CC-BY) for international ADM0/ADM1
- Natural Earth (for country polygons)
- City open data portals or Geopolypedia for selected neighborhood boundaries

## Notes on Neighborhoods
Public *medication / antidepressant* rates at true neighborhood level are essentially non-existent.
Possible future proxies: ACS health-related variables, CDC PLACES model-based estimates at census-tract or ZCTA level (clearly labeled as prevalence, not Rx rates).

## Heat-map readiness
After load, the views `v_cities_heatmap` and `v_states_choropleth` produce GeoJSON FeatureCollections ready for MapLibre / Leaflet / Observable.
