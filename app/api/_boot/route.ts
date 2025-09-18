export const runtime = "nodejs";

import "@/lib/ws-hub"; // 이 import가 createWSS()를 1회 실행
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ ok: true });
}
