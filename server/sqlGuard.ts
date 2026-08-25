const FORBIDDEN =
  /\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|copy|call|do\s+\$|execute|listen|notify|vacuum|reindex|cluster|load\s+|security\s+label|set\s+role|set\s+session|pg_sleep|dblink|lo_|into\s+outfile|pg_read_|pg_write_)\b/i;

export function assertReadOnlySql(sql: string): string {
  const trimmed = sql.trim().replace(/;+\s*$/u, "");
  if (!trimmed) {
    throw new Error("Query is empty");
  }
  if (trimmed.includes(";")) {
    throw new Error("Multiple statements are not allowed");
  }
  if (!/^(with|select|explain)\b/i.test(trimmed)) {
    throw new Error("Only SELECT, WITH, or EXPLAIN queries are allowed");
  }
  if (FORBIDDEN.test(trimmed)) {
    throw new Error("Query contains a disallowed keyword");
  }
  return trimmed;
}

export function applyRowLimit(sql: string, limit: number): string {
  if (/^explain\b/i.test(sql)) {
    return sql;
  }
  if (/\blimit\s+\d+/i.test(sql)) {
    return sql;
  }
  return `SELECT * FROM (${sql}) AS guarded_query LIMIT ${limit}`;
}
