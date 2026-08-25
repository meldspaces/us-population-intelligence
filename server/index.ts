import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { pool, withClient } from "./db.js";
import { runEtl } from "./etl.js";
import { serverLog } from "./logger.js";
import { applyRowLimit, assertReadOnlySql } from "./sqlGuard.js";

const PORT = Number(process.env.PORT ?? 8080);
const SQL_ROW_LIMIT = 1000;
const PUBLIC_DIR = path.join(process.cwd(), "dist", "public");

const app = express();
app.disable("x-powered-by");
app.use(cors());
app.use(express.json({ limit: "256kb" }));

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    void fn(req, res, next).catch(next);
  };
}

app.get(
  "/api/health",
  asyncHandler(async (_req, res) => {
    const ping = await pool.query("SELECT 1 AS ok, PostGIS_Version() AS postgis");
    res.json({ data: { ok: true, postgis: ping.rows[0]?.postgis ?? null } });
  }),
);

app.get(
  "/api/meta",
  asyncHandler(async (_req, res) => {
    const stats = await pool.query(
      `SELECT
         (SELECT count(*)::int FROM states_provinces) AS states,
         (SELECT count(*)::int FROM cities) AS cities,
         (SELECT avg(current_antidepressant_pct)::numeric(5,2) FROM states_provinces) AS mean_state_rate,
         (SELECT min(current_antidepressant_pct)::numeric(5,2) FROM states_provinces) AS min_state_rate,
         (SELECT max(current_antidepressant_pct)::numeric(5,2) FROM states_provinces) AS max_state_rate`,
    );
    res.json({
      data: {
        title: "US Population Intelligence Index",
        caveat:
          "All medication figures are aggregate public proxies (antidepressant use or medication for depression). SSRIs are the majority antidepressant class but are not isolated in these sources. No individual-level data are collected or stored.",
        sources: [
          {
            name: "U.S. Census Bureau Vintage 2025 city populations",
            url: "https://www.census.gov/data/tables/time-series/demo/popest/2020s-total-cities-and-towns.html",
          },
          {
            name: "CDC/NCHS NHIS 2023 Data Brief 528",
            url: "https://www.cdc.gov/nchs/products/databriefs/db528.htm",
          },
          {
            name: "Perlis et al. 2026 50-state antidepressant survey",
            url: "https://mentalhealth.bmj.com/content/29/1/e302287",
          },
          {
            name: "Household Pulse Survey mental health care",
            url: "https://www.cdc.gov/nchs/covid19/pulse/mental-health-care.htm",
          },
          {
            name: "Census Cartographic Boundary Files 2025 (states, 1:5,000,000)",
            url: "https://www.census.gov/geographies/mapping-files/time-series/geo/cartographic-boundary.html",
          },
        ],
        stats: stats.rows[0],
      },
    });
  }),
);

app.get(
  "/api/geo/states",
  asyncHandler(async (_req, res) => {
    const result = await pool.query(
      `SELECT jsonb_build_object(
         'type', 'FeatureCollection',
         'features', COALESCE(jsonb_agg(feat ORDER BY rate DESC NULLS LAST), '[]'::jsonb)
       ) AS fc
       FROM (
         SELECT jsonb_build_object(
           'type', 'Feature',
           'id', sp.id,
           'geometry', ST_AsGeoJSON(sp.geom)::jsonb,
           'properties', jsonb_build_object(
             'id', sp.id,
             'code', sp.code,
             'name', sp.name,
             'current_antidepressant_pct', sp.current_antidepressant_pct,
             'lifetime_antidepressant_pct', sp.lifetime_antidepressant_pct,
             'source_rates', sp.source_rates,
             'source_url', sp.source_url,
             'notes', sp.notes
           )
         ) AS feat,
         sp.current_antidepressant_pct AS rate
         FROM states_provinces sp
         WHERE sp.geom IS NOT NULL
       ) q`,
    );
    res.json({ data: result.rows[0].fc });
  }),
);

app.get(
  "/api/geo/cities",
  asyncHandler(async (req, res) => {
    const state = typeof req.query.state === "string" ? req.query.state.toUpperCase() : null;
    const result = await pool.query(
      `SELECT jsonb_build_object(
         'type', 'FeatureCollection',
         'features', COALESCE(jsonb_agg(feat ORDER BY population DESC NULLS LAST), '[]'::jsonb)
       ) AS fc
       FROM (
         SELECT jsonb_build_object(
           'type', 'Feature',
           'id', c.id,
           'geometry', ST_AsGeoJSON(c.geom)::jsonb,
           'properties', jsonb_build_object(
             'id', c.id,
             'name', c.name,
             'state_code', c.state_code,
             'state_name', sp.name,
             'population', c.population,
             'proxy_pct_low', c.proxy_pct_low,
             'proxy_pct_high', c.proxy_pct_high,
             'proxy_midpoint', c.proxy_midpoint,
             'notes', c.notes,
             'source_pop', c.source_pop,
             'source_proxy', c.source_proxy,
             'source_url', c.source_url
           )
         ) AS feat,
         c.population
         FROM cities c
         LEFT JOIN states_provinces sp ON sp.id = c.state_id
         WHERE c.geom IS NOT NULL
           AND ($1::text IS NULL OR c.state_code = $1)
       ) q`,
      [state],
    );
    res.json({ data: result.rows[0].fc });
  }),
);

app.get(
  "/api/states",
  asyncHandler(async (_req, res) => {
    const result = await pool.query(
      `SELECT id, code, name, fips, current_antidepressant_pct, lifetime_antidepressant_pct,
              source_rates, source_url, notes
       FROM states_provinces
       ORDER BY current_antidepressant_pct DESC NULLS LAST`,
    );
    res.json({ data: result.rows });
  }),
);

app.get(
  "/api/cities",
  asyncHandler(async (req, res) => {
    const state = typeof req.query.state === "string" ? req.query.state.toUpperCase() : null;
    const result = await pool.query(
      `SELECT c.id, c.name, c.state_code, sp.name AS state_name, c.rank_national, c.population,
              c.proxy_pct_low, c.proxy_pct_high, c.proxy_midpoint, c.notes, c.source_pop,
              c.source_proxy, c.source_url, c.lat, c.lon
       FROM cities c
       LEFT JOIN states_provinces sp ON sp.id = c.state_id
       WHERE $1::text IS NULL OR c.state_code = $1
       ORDER BY c.rank_national NULLS LAST, c.population DESC NULLS LAST`,
      [state],
    );
    res.json({ data: result.rows });
  }),
);

app.get(
  "/api/demographics",
  asyncHandler(async (req, res) => {
    const category = typeof req.query.category === "string" ? req.query.category : null;
    const metric = typeof req.query.metric === "string" ? req.query.metric : null;
    const result = await pool.query(
      `SELECT id, source_name, source_url, metric, year, geo_level, category, subcategory,
              generations, pct, notes
       FROM demographics
       WHERE ($1::text IS NULL OR category = $1)
         AND ($2::text IS NULL OR metric = $2)
       ORDER BY metric, category, pct DESC NULLS LAST`,
      [category, metric],
    );
    res.json({ data: result.rows });
  }),
);

app.get(
  "/api/schema",
  asyncHandler(async (_req, res) => {
    const tables = await pool.query(
      `SELECT c.relname AS table_name, obj_description(c.oid) AS comment
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r'
       ORDER BY c.relname`,
    );
    const columns = await pool.query(
      `SELECT table_name, column_name, data_type, udt_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
       ORDER BY table_name, ordinal_position`,
    );
    res.json({
      data: {
        tables: tables.rows,
        columns: columns.rows,
        hints: [
          "states_provinces.current_antidepressant_pct — Perlis 2026 current use",
          "cities.proxy_midpoint — generated midpoint of city proxy range",
          "demographics — NHIS 2023 medication-for-depression and Perlis national slices",
          "Read-only: SELECT / WITH / EXPLAIN only; 1000-row cap",
        ],
      },
    });
  }),
);

app.post(
  "/api/query",
  asyncHandler(async (req, res) => {
    const sqlRaw = typeof req.body?.sql === "string" ? req.body.sql : "";
    let sql: string;
    try {
      sql = applyRowLimit(assertReadOnlySql(sqlRaw), SQL_ROW_LIMIT);
    } catch (err) {
      res.status(400).json({
        error: "invalid_sql",
        message: err instanceof Error ? err.message : "Invalid SQL",
      });
      return;
    }

    const started = Date.now();
    const result = await withClient(async (client) => {
      await client.query("BEGIN");
      try {
        await client.query("SET TRANSACTION READ ONLY");
        await client.query("SET LOCAL statement_timeout = '8000'");
        const queryResult = await client.query(sql);
        await client.query("COMMIT");
        return queryResult;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    });

    res.json({
      data: {
        columns: result.fields.map((f) => f.name),
        rows: result.rows,
        rowCount: result.rowCount,
        ms: Date.now() - started,
      },
    });
  }),
);

app.get(
  "/api/searches",
  asyncHandler(async (_req, res) => {
    const result = await pool.query(
      `SELECT id, name, kind, query, filters, description, created_at
       FROM saved_searches
       ORDER BY created_at DESC`,
    );
    res.json({ data: result.rows });
  }),
);

app.post(
  "/api/searches",
  asyncHandler(async (req, res) => {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const kind = req.body?.kind === "filters" ? "filters" : "sql";
    const query = typeof req.body?.query === "string" ? req.body.query : null;
    const description = typeof req.body?.description === "string" ? req.body.description : null;
    const filters = req.body?.filters ?? null;
    if (!name) {
      res.status(400).json({ error: "invalid_request", message: "Name is required" });
      return;
    }
    if (kind === "sql" && query) {
      try {
        assertReadOnlySql(query);
      } catch (err) {
        res.status(400).json({
          error: "invalid_sql",
          message: err instanceof Error ? err.message : "Invalid SQL",
        });
        return;
      }
    }
    const result = await pool.query(
      `INSERT INTO saved_searches (name, kind, query, filters, description)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, kind, query, filters, description, created_at`,
      [name, kind, query, filters ? JSON.stringify(filters) : null, description],
    );
    res.status(201).json({ data: result.rows[0] });
  }),
);

app.delete(
  "/api/searches/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "invalid_request", message: "Invalid id" });
      return;
    }
    await pool.query(`DELETE FROM saved_searches WHERE id = $1`, [id]);
    res.json({ data: { ok: true } });
  }),
);

app.use((req, res, next) => {
  if (req.path.startsWith("/api")) {
    res.status(404).json({ error: "not_found", message: "Unknown API route" });
    return;
  }
  next();
});

if (fs.existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR));
  app.get(/.*/, (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, "index.html"));
  });
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : "Unexpected error";
  serverLog("error", "Request failed", { error: message });
  res.status(500).json({ error: "server_error", message: "Query failed. Check SQL or try again." });
});

async function boot(): Promise<void> {
  await runEtl();
  app.listen(PORT, () => {
    serverLog("info", "Server listening", { port: PORT });
  });
}

boot().catch((err: unknown) => {
  serverLog("error", "Boot failed", { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
