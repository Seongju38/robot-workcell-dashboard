import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";
import { broadcast } from "./ws-hub";
import { logRow } from "@/lib/logger";

const PATH = process.env.SERIAL_PATH || "COM4";
const BAUD = Number(process.env.SERIAL_BAUD || 9600);

declare global {
  // eslint-disable-next-line no-var
  var __SERIAL__: {
    port: SerialPort | null;
    ready: boolean;
    write: (line: string) => void;
  } | undefined;
}

function openSerial() {
  const port = new SerialPort({ path: PATH, baudRate: BAUD });
  const parser = port.pipe(new ReadlineParser({ delimiter: "\n" }));

  let ready = false;

  port.on("open", () => {
    ready = true;
    console.log(`Serial open ${PATH} @ ${BAUD}`);
    broadcast({ type: "log", row: logRow({
      level: "info",
      action: "serial.open",
      payload: { path: PATH, baud: BAUD },
      status_code: 200
    })});
  });

  port.on("error", (err) => {
    console.error("Serial error:", err);
    broadcast({ type: "log", row: logRow({
      level: "error",
      action: "serial.error",
      payload: { error: String(err) },
      status_code: 500
    })});
  });

  port.on("close", () => {
    ready = false;
    console.log("Serial closed");
    broadcast({ type: "log", row: logRow({
      level: "warn",
      action: "serial.close",
      payload: {},
      status_code: 200
    })});
  });

  // STM32 → PC : 한 줄(JSON 권장)
  parser.on("data", (line: string) => {
    const raw = line.trim();
    if (!raw) return;
    let msg: any = raw;
    try { msg = JSON.parse(raw); } catch { /* 텍스트 라인도 허용 */ }

    // 텔레메트리 표준화: {type:'telemetry', data:{distance_cm, pwm, ts}}
    if (msg?.type === "telemetry") {
      // DB 로그 적당히 샘플링하고 싶으면 여기서 조건부 logRow
      broadcast({ type: "telemetry", data: msg.data });
      return;
    }

    // ACK/이벤트 로그도 브로드캐스트
    if (msg?.type === "ack" || msg?.type === "event") {
      broadcast({ type: "log", row: logRow({
        level: "info",
        action: `stm32.${msg.type}`,
        payload: msg,
        status_code: 200
      })});
      return;
    }

    // 포맷 불명 텍스트 라인도 로그로 살짝
    broadcast({ type: "log", row: logRow({
      level: "info",
      action: "stm32.line",
      payload: raw,
      status_code: 200
    })});
  });

  const write = (line: string) => {
    if (!ready) throw new Error("serial not ready");
    port.write(line.endsWith("\n") ? line : line + "\n");
  };

  return { port, ready: () => ready, write };
}

// 싱글톤
export const serial = global.__SERIAL__ ?? (global.__SERIAL__ = (() => {
  try {
    const s = openSerial();
    return {
      port: s.port,
      get ready() { return s.ready(); },
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
    broadcast({ type: "log", row: logRow({
      level: "info",
      action: "cmd.tx",
      payload: line,
      status_code: 202
    })});
    return true;
  } catch (e) {
    broadcast({ type: "log", row: logRow({
      level: "error",
      action: "cmd.tx.fail",
      payload: String(e),
      status_code: 500
    })});
    return false;
  }
}
