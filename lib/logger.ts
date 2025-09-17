/***** 로그 편의 함수 *****/

import { db } from "./db";

type Level = "info" | "warn" | "error";

export function logRow({
  level = "info",
  source,
  action,
  payload,
  status_code,
}: {
  level?: Level;
  source?: string;
  action?: string;
  payload?: unknown;
  status_code?: number;
}) {
  const stmt = db.prepare(
    `INSERT INTO robot_logs (level, source, action, payload, status_code)
     VALUES (@level, @source, @action, @payload, @status_code)`
  );
  stmt.run({
    level,
    source: source ?? "api",
    action: action ?? null,
    payload: payload ? JSON.stringify(payload) : null,
    status_code: status_code ?? null,
  });
}

export function getLogs(limit = 100) {
  const stmt = db.prepare(
    `SELECT id, ts, level, source, action, payload, status_code
     FROM robot_logs
     ORDER BY id DESC
     LIMIT ?`
  );
  return stmt.all(limit);
}
