let socket: WebSocket | null = null;
let reconnectDelay = 1000;
const MAX_DELAY = 30000;

type PaymentUpdateEvent = {
  type: "payment_update";
  ts: number;
  data: { totalCash: number; totalCard: number; totalSales: number };
};

export function connectRealtime(onPayment: (ev: PaymentUpdateEvent) => void) {
  if (typeof window === "undefined") return;
  if (socket && socket.readyState === WebSocket.OPEN) return;
  const base = process.env.NEXT_PUBLIC_API_URL || "";
  try {
    const urlObj = new URL(base);
    const wsUrl = `${urlObj.protocol === "https:" ? "wss" : "ws"}://${urlObj.host}/ws`;
    socket = new WebSocket(wsUrl);
  } catch {
    return;
  }
  socket.onopen = () => {
    reconnectDelay = 1000;
  };
  socket.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data as string);
      if (data && data.type === "payment_update") {
        onPayment(data as PaymentUpdateEvent);
      }
    } catch {
      // ignore
    }
  };
  socket.onclose = () => scheduleReconnect(onPayment);
  socket.onerror = () => {
    try {
      socket?.close();
    } catch {
      // ignore
    }
  };
}

function scheduleReconnect(onPayment: (ev: PaymentUpdateEvent) => void) {
  if (typeof window === "undefined") return;
  setTimeout(() => {
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_DELAY);
    connectRealtime(onPayment);
  }, reconnectDelay);
}

