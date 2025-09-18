import { WebSocketServer, WebSocket } from "ws";

const PORT = Number(process.env.WS_PORT || 7071);

declare global {
  // Next 서버는 모듈 캐시를 공유하므로 싱글톤 보장용
  // eslint-disable-next-line no-var
  var __WS__: { wss: WebSocketServer } | undefined;
}

function createWSS() {
  const wss = new WebSocketServer({ port: PORT });
  wss.on("connection", () => console.log("WS client connected"));
  console.log(`✅ WS hub running ws://localhost:${PORT}`);
  return { wss };
}

export const ws = global.__WS__ ?? (global.__WS__ = createWSS());

export function broadcast(obj: any) {
  const msg = JSON.stringify(obj);
  for (const client of ws.wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  }
}
