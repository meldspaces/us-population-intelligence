import { useMemo, useState, type JSX } from "react";
import { AdaptiveChart } from "./AdaptiveChart";
import type { QueryResult, Theme } from "../types";

type Props = {
  theme: Theme;
  schemaHints: string[];
  tables: Array<{ table_name: string; comment: string | null }>;
  onRun: (sql: string) => Promise<QueryResult>;
  onSave: (name: string, sql: string) => Promise<void>;
  initialSql?: string;
};

const STARTER = `SELECT name, code, current_antidepressant_pct, lifetime_antidepressant_pct
FROM states_provinces
ORDER BY current_antidepressant_pct DESC`;

export function SqlConsole({
  theme,
  schemaHints,
  tables,
  onRun,
  onSave,
  initialSql,
}: Props): React.JSX.Element {
  const [sql, setSql] = useState(initialSql ?? STARTER);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const previewCols = useMemo(() => result?.columns ?? [], [result]);

  async function run(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const next = await onRun(sql);
      setResult(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Query failed");
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  async function save(): Promise<void> {
    const name = window.prompt("Name this SQL search");
    if (!name) return;
    await onSave(name.trim(), sql);
  }

  return (
    <div className="sql-wrap">
      <div className="sql-grid">
        <label className="sql-editor">
          <span>Read-only SQL</span>
          <textarea
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            spellCheck={false}
            rows={10}
          />
        </label>
        <aside className="schema-hints">
          <h3>Schema</h3>
          <ul>
            {tables.map((t) => (
              <li key={t.table_name}>
                <code>{t.table_name}</code>
                {t.comment ? <span className="muted"> — {t.comment}</span> : null}
              </li>
            ))}
          </ul>
          <h3>Guards</h3>
          <ul>
            {schemaHints.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        </aside>
      </div>
      <div className="sql-actions">
        <button type="button" className="btn primary" onClick={() => void run()} disabled={busy}>
          {busy ? "Running…" : "Run query"}
        </button>
        <button type="button" className="btn" onClick={() => void save()}>
          Save search
        </button>
        {result ? (
          <span className="muted">
            {result.rowCount ?? result.rows.length} rows · {result.ms} ms
          </span>
        ) : null}
      </div>
      {error ? <p className="error">{error}</p> : null}
      {result ? (
        <>
          <AdaptiveChart columns={result.columns} rows={result.rows} theme={theme} />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {previewCols.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.slice(0, 80).map((row, i) => (
                  <tr key={i}>
                    {previewCols.map((c) => (
                      <td key={c}>{formatCell(row[c])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
