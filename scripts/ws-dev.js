const { WebSocketServer } = require("ws");

const PORT = process.env.WS_PORT ? Number(process.env.WS_PORT) : 7071;
const wss = new WebSocketServer({ port: PORT });

function broadcast(obj) {
  const msg = JSON.stringify(obj);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(msg);
  }
}

wss.on("connection", (ws) => {
  console.log("WS client connected");
  ws.on("close", () => console.log("WS client disconnected"));
});

console.log(`✅ WS dev server running ws://localhost:${PORT}`);

// ---- 가짜 텔레메트리: 300ms마다 거리/PWM 전송 ----
let t = 0;
setInterval(() => {
  t += 0.3;
  const distance = 25 + Math.sin(t) * 15 + Math.random() * 2; // 25±15cm + 노이즈
  const pwm = Math.floor(120 + Math.sin(t * 0.7) * 40);
  broadcast({
    type: "telemetry",
    data: { distance_cm: Number(distance.toFixed(2)), pwm, ts: Date.now() },
  });
}, 300);

// ---- 샘플 로그 푸시: 3초마다 1건 ----
setInterval(() => {
  broadcast({
    type: "log",
    row: {
      id: Date.now(),
      ts: new Date().toISOString().replace("T", " ").slice(0, 19),
      level: Math.random() < 0.1 ? "warn" : "info",
      action: "telemetry.tick",
      payload: "{}",
    },
  });
}, 3000);
