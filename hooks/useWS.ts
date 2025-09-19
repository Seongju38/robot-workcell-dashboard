"use client";
import { useEffect, useRef, useState } from "react";

type Message = any; // {type:'telemetry'|'log'|..., data?:..., row?:...}

const DEFAULT_URL =
  (typeof window !== "undefined" && (window as any).__WS_URL__) ||
  process.env.NEXT_PUBLIC_WS_URL ||
  "ws://localhost:7071";

export function useWS(url: string = DEFAULT_URL) {
  const wsRef = useRef<WebSocket | null>(null);
  const [data, setData] = useState<Message | null>(null);
  const [ready, setReady] = useState<number>(WebSocket.CLOSED);
  const timerRef = useRef<any>(null);
  const textBufRef = useRef<string>("");

  useEffect(() => {
    let alive = true;
    let retry = 1000;

    async function toText(payload: any): Promise<string | null> {
      if (typeof payload === "string") return payload;
      if (payload instanceof Blob) return await payload.text();
      if (payload instanceof ArrayBuffer)
        return new TextDecoder().decode(payload);
      if (ArrayBuffer.isView(payload))
        return new TextDecoder().decode(payload as any);
      console.warn("[ws] unknown payload type:", payload);
      return null;
    }

    async function handleMessage(evt: MessageEvent) {
      const raw = await toText(evt.data);
      console.debug(
        "[ws] onmessage type=",
        typeof evt.data,
        "len=",
        raw?.length
      );
      if (raw == null) return;

      // NDJSON 누적
      textBufRef.current += raw;
      const lines = textBufRef.current.split(/\r?\n/);
      textBufRef.current = lines.pop() ?? "";

      for (const line of lines) {
        const s = line.trim();
        if (!s) continue;
        if (s[0] !== "{") {
          console.debug("[ws] skip non-json line:", s.slice(0, 80));
          continue;
        }
        try {
          const msg = JSON.parse(s);
          setData(msg);
          console.debug("[ws] parsed:", msg);
        } catch (e) {
          console.warn("[ws] JSON parse fail:", s);
        }
      }
    }

    function connect() {
      if (!alive) return;
      console.info("[ws] connecting to", url);
      const ws = new WebSocket(url);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;
      setReady(ws.readyState);

      ws.onopen = () => {
        setReady(ws.readyState);
        retry = 1000;
        console.info("[ws] OPEN");
        timerRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send('{"type":"ping"}');
        }, 15000);
      };

      ws.onmessage = (evt) => {
        handleMessage(evt);
      };

      ws.onerror = (err) => {
        console.error("[ws] ERROR", err);
      };

      ws.onclose = (evt) => {
        console.warn("[ws] CLOSE code=", evt.code, "reason=", evt.reason);
        setReady(WebSocket.CLOSED);
        clearInterval(timerRef.current);
        if (!alive) return;
        setTimeout(connect, retry);
        retry = Math.min(retry * 1.5, 10000);
      };
    }

    connect();
    return () => {
      alive = false;
      clearInterval(timerRef.current);
      wsRef.current?.close();
    };
  }, [url]);

  const send = (payload: any) => {
    const s = wsRef.current;
    const out = typeof payload === "string" ? payload : JSON.stringify(payload);
    console.debug("[ws] send:", out);
    if (s && s.readyState === WebSocket.OPEN) s.send(out);
    else console.warn("[ws] cannot send, not open");
  };

  return { data, send, readyState: ready };
}
