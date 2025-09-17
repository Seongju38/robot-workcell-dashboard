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

  useEffect(() => {
    let alive = true;
    let retry = 1000;

    function connect() {
      if (!alive) return;
      const ws = new WebSocket(url);
      wsRef.current = ws;
      setReady(ws.readyState);

      ws.onopen = () => {
        setReady(ws.readyState);
        retry = 1000;
        // heartbeat
        timerRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send('{"type":"ping"}');
        }, 15000);
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          setData(msg);
        } catch {
          setData(evt.data);
        }
      };

      ws.onerror = () => {
        // noop: close에서 재접속 처리
      };

      ws.onclose = () => {
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
    if (s && s.readyState === WebSocket.OPEN) {
      s.send(typeof payload === "string" ? payload : JSON.stringify(payload));
    }
  };

  return { data, send, readyState: ready };
}
