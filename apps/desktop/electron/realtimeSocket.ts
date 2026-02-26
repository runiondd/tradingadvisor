/**
 * Real-time stocks WebSocket: wss://socket.massive.com/stocks
 * Auth and subscribe per Polygon/Massive WebSocket API.
 */

const WS_URL = "wss://socket.massive.com/stocks";

let ws: WebSocket | null = null;
let sender: ((data: unknown) => void) | null = null;
let apiKey: string | null = null;
const subscribed = new Set<string>();

export function setRealtimeSender(send: (data: unknown) => void): void {
  sender = send;
}

function getSender(): (data: unknown) => void {
  if (!sender) return () => {};
  return sender;
}

function connect(key: string): void {
  if (ws?.readyState === WebSocket.OPEN) return;
  apiKey = key;
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    ws?.send(JSON.stringify({ action: "auth", params: key }));
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data as string);
      getSender()(data);
      const authOk =
        (Array.isArray(data) && data[0]?.status === "auth_success") ||
        (data?.status === "auth_success");
      if (authOk && subscribed.size > 0) {
        const params = Array.from(subscribed)
          .flatMap((s) => [`Q.${s}`, `T.${s}`])
          .join(",");
        ws?.send(JSON.stringify({ action: "subscribe", params }));
      }
    } catch {
      getSender()(event.data);
    }
  };

  ws.onerror = () => {
    getSender()( { type: "realtime_error", message: "WebSocket error" });
  };

  ws.onclose = () => {
    ws = null;
    getSender()( { type: "realtime_closed" });
  };
}

function ensureSubscribed(symbol: string): void {
  if (!ws || ws.readyState !== WebSocket.OPEN || !apiKey) return;
  const params = [`Q.${symbol}`, `T.${symbol}`].join(",");
  ws.send(JSON.stringify({ action: "subscribe", params }));
}

export function subscribe(symbol: string, key: string): void {
  const s = symbol.trim().toUpperCase();
  if (!s) return;
  subscribed.add(s);
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    connect(key);
  } else {
    ensureSubscribed(s);
  }
}

export function unsubscribe(symbol: string): void {
  subscribed.delete(symbol.trim().toUpperCase());
  if (ws?.readyState === WebSocket.OPEN && subscribed.size >= 0) {
    const s = symbol.trim().toUpperCase();
    const params = [`Q.${s}`, `T.${s}`].join(",");
    ws.send(JSON.stringify({ action: "unsubscribe", params }));
  }
}

export function close(): void {
  if (ws) {
    ws.close();
    ws = null;
  }
  subscribed.clear();
  apiKey = null;
}
