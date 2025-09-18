/***** 명령 수신 (POST) -> DB에 로그만 기록 *****/

import { NextResponse } from "next/server";
import { logRow } from "@/lib/logger";
import { sendCommand } from "@/lib/serial"; // 시리얼 브릿지 사용
import { broadcast } from "@/lib/ws-hub"; // (선택) 서버도 WS로 알림

const ALLOWED = new Set(["led", "set_speed", "direction", "lock", "estop"]);

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { type, ...rest } = body || {};

    if (!type || !ALLOWED.has(String(type))) {
      const row = logRow({
        level: "warn",
        action: "cmd.invalid",
        payload: body,
        status_code: 422,
      });
      broadcast({ type: "log", row }); // 즉시 UI도 알림
      return NextResponse.json(
        { message: "invalid command type", allow: [...ALLOWED], row },
        { status: 422 }
      );
    }

    // 시리얼로 실제 전송 (STM32는 JSON 라인으로 받도록)
    const ok = sendCommand({ type, ...rest });

    const row = logRow({
      level: ok ? "info" : "error",
      action: `cmd.${type}`,
      payload: rest,
      status_code: ok ? 202 : 500,
    });

    broadcast({ type: "log", row }); // 즉시 UI 반영
    return NextResponse.json({ ok, row }, { status: ok ? 202 : 500 });
  } catch (err: any) {
    const row = logRow({
      level: "error",
      action: "cmd.exception",
      payload: { error: String(err) },
      status_code: 500,
    });
    broadcast({ type: "log", row });
    return NextResponse.json({ message: "server error", row }, { status: 500 });
  }
}
