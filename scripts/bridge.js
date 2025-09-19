const { WebSocketServer } = require("ws");
const { SerialPort, ReadlineParser } = require("serialport");

const WS_PORT = 7072;                                 // 프론트가 붙는 포트
const SERIAL  = process.env.SERIAL_PATH || "COM4";     
const BAUD    = 115200;

const wss = new WebSocketServer({ port: WS_PORT }, () =>
  console.log("WS on ws://localhost:" + WS_PORT)
);

// 연결 직후 테스트 프레임 (서버 정상 송신 여부 확인용)
wss.on("connection", (ws) => {
  console.log("WS client connected");
//   ws.send(JSON.stringify({ type: "hello", ts: Date.now() }) + "\n");
  ws.on("message", (buf) => {
    try { console.log("WS in:", buf.toString()); } catch {}
  });
});

const sp = new SerialPort({ path: SERIAL, baudRate: BAUD }, (err) => {
  if (err) console.error("Serial open error:", err.message);
});
sp.on("open", () => console.log("Serial OPEN:", SERIAL, BAUD));
sp.on("error", (e) => console.error("Serial error:", e));

// \n 기준으로 라인 자르기
const parser = sp.pipe(new ReadlineParser({ delimiter: "\n" }));
parser.on("data", (line) => {
  const s = (line || "").toString().trim();
  if (!s) return;
  // JSON 라인만 전송
  if (s[0] !== "{") { 
    // console.log("skip:", s); // 필요시 켬
    return; 
  }
  // 콘솔에도 찍어서 실제 들어오는지 육안확인
  console.log("SERIAL>", s);

  // 모든 WS 클라이언트에게 송신
  const payload = s + "\n";
  wss.clients.forEach((ws) => {
    if (ws.readyState === 1) ws.send(payload);
  });
});
