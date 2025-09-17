import { useEffect, useRef, useState } from 'react';
export function useWS(url = 'ws://localhost:7071') {
    const [data, setData] = useState<any>(null);
    const wsRef = useRef<WebSocket | null>(null);
    useEffect(() => {
        const ws = new WebSocket(url);
        wsRef.current = ws;
        ws.onmessage = (e) => setData(JSON.parse(e.data));
        return () => ws.close();
    }, [url]);
    return { data, ws: wsRef.current };
}
