/***** 로그 조회 (GET) *****/

import { NextResponse } from "next/server";
import { getLogs } from "@/lib/logger";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit") || "100");
  const rows = getLogs(Number.isFinite(limit) ? limit : 100);
  return NextResponse.json(rows);
}
