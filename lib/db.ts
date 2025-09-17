/***** SQLite 초기화  + 유틸 *****/

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// DB 파일 위치 (추후 .env로 바꾸기)
const DB_PATH =
  process.env.DATABASE_PATH || path.join(process.cwd(), "var", "robot.db");

// var 폴더 없으면 생성
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

export const db = new Database(DB_PATH);

// 단일 테이블 스키마
db.exec(`
CREATE TABLE IF NOT EXISTS robot_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts DATETIME DEFAULT (datetime('now','localtime')),
  level TEXT CHECK(level IN ('info','warn','error')) NOT NULL,
  source TEXT,
  action TEXT,
  payload TEXT,
  status_code INTEGER
);
`);
