/***** 명령 수신 (POST) -> DB에 로그만 기록 *****/

import { NextResponse } from "next/server";
import { logRow } from "@/lib/logger";

const ALLOWED = new Set(["led", "set_speed", "direction", "lock", "estop"]);

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { type, ...rest } = body || {};

    if (!type || !ALLOWED.has(String(type))) {
      logRow({
        level: "warn",
        action: "cmd.invalid",
        payload: body,
        status_code: 422,
      });
      return NextResponse.json(
        { message: "invalid command type", allow: [...ALLOWED] },
        { status: 422 }
      );
    }

    // (1단계) 시리얼 없음: DB에 로그만 남김
    logRow({
      level: "info",
      action: `cmd.${type}`,
      payload: rest,
      status_code: 202,
    });

    // 프론트에서 바로 쓸 수 있게 echo
    return NextResponse.json(
      { ok: true, type, received: rest },
      { status: 202 }
    );
  } catch (err: any) {
    logRow({
      level: "error",
      action: "cmd.exception",
      payload: { error: String(err) },
      status_code: 500,
    });
    return NextResponse.json({ message: "server error" }, { status: 500 });
  }
}
