import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";
import { broadcast } from "./ws-hub";
import { logRow } from "@/lib/logger";

const PATH = process.env.SERIAL_PATH || "COM4";
const BAUD = Number(process.env.SERIAL_BAUD || 115200);

declare global {
  // eslint-disable-next-line no-var
  var __SERIAL__:
    | {
        port: SerialPort | null;
        ready: boolean;
        write: (line: string) => void;
      }
    | undefined;
}

function openSerial() {
  const port = new SerialPort({ path: PATH, baudRate: BAUD });
  const parser = port.pipe(new ReadlineParser({ delimiter: "\n" }));

  let ready = false;

  port.on("open", () => {
    ready = true;
    console.log(`Serial open ${PATH} @ ${BAUD}`);
    broadcast({
      type: "log",
      row: logRow({
        level: "info",
        action: "serial.open",
        payload: { path: PATH, baud: BAUD },
        status_code: 200,
      }),
    });
  });

  port.on("error", (err) => {
    console.error("Serial error:", err);
    broadcast({
      type: "log",
      row: logRow({
        level: "error",
        action: "serial.error",
        payload: { error: String(err) },
        status_code: 500,
      }),
    });
  });

  port.on("close", () => {
    ready = false;
    console.log("Serial closed");
    broadcast({
      type: "log",
      row: logRow({
        level: "warn",
        action: "serial.close",
        payload: {},
        status_code: 200,
      }),
    });
  });

  // STM32 → PC : 한 줄(JSON 권장)
  // serial.ts - parser.on('data') 안
  parser.on("data", (line: string) => {
    const raw = line.trim();
    if (!raw) return;

    let msg: any = raw;
    try {
      msg = JSON.parse(raw);
    } catch {
      /* 텍스트도 허용 */
    }

    // ── 1) 텔레메트리: mm→cm, us→각도
    if (msg?.type === "telemetry") {
      const mm = Number(msg?.data?.distance_mm ?? msg?.data?.distance);
      const us = Number(msg?.data?.servo_us ?? msg?.data?.pwm_us);

      const distance_cm = Number.isFinite(mm)
        ? Math.round((mm / 10) * 10) / 10
        : undefined;

      const pwm = Number.isFinite(us)
        ? Math.max(0, Math.min(180, Math.round(((us - 500) * 180) / 2000)))
        : undefined;

      const ts = Number(msg?.data?.ts ?? Date.now());

      const norm = { distance_cm, pwm, ts };
      // 콘솔에도 찍어 진단
      console.log("[telemetry]", norm);
      broadcast({ type: "telemetry", data: norm });
      return;
    }

    // ── 2) ACK/이벤트는 그대로 로그로
    if (msg?.type === "ack" || msg?.type === "event") {
      broadcast({
        type: "log",
        row: logRow({
          level: "info",
          action: `stm32.${msg.type}`,
          payload: msg,
          status_code: 200,
        }),
      });
      return;
    }

    // ── 3) 텍스트 라인도 ‘대충’ 파싱해 차트에 뿌리기(옵션)
    const m = raw.match(/Dist:\s*(\d+)\s*mm/i);
    if (m) {
      const cm = Math.round((Number(m[1]) / 10) * 10) / 10;
      const norm = { distance_cm: cm, ts: Date.now() };
      console.log("[telemetry:parsed]", norm);
      broadcast({ type: "telemetry", data: norm });
    }

    // 그 외 라인은 로그로
    broadcast({
      type: "log",
      row: logRow({
        level: "info",
        action: "stm32.line",
        payload: raw,
        status_code: 200,
      }),
    });
  });

  const write = (line: string) => {
    if (!ready) throw new Error("serial not ready");
    port.write(line.endsWith("\n") ? line : line + "\n");
  };

  return { port, ready: () => ready, write };
}

// 싱글톤
export const serial =
  global.__SERIAL__ ??
  (global.__SERIAL__ = (() => {
    try {
      const s = openSerial();
      return {
        port: s.port,
        get ready() {
          return s.ready();
        },
        write: s.write,
      };
    } catch (e) {
      console.error("Failed to open serial:", e);
      return { port: null, ready: false, write: (_: string) => {} };
    }
  })());

// 명령 전송 헬퍼 (JSON 라인)
export function sendCommand(cmd: any) {
  const line = typeof cmd === "string" ? cmd : JSON.stringify(cmd);
  try {
    serial.write(line);
    broadcast({
      type: "log",
      row: logRow({
        level: "info",
        action: "cmd.tx",
        payload: line,
        status_code: 202,
      }),
    });
    return true;
  } catch (e) {
    broadcast({
      type: "log",
      row: logRow({
        level: "error",
        action: "cmd.tx.fail",
        payload: String(e),
        status_code: 500,
      }),
    });
    return false;
  }
}
