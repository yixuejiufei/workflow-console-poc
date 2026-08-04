import { useEffect, useRef, useState, useCallback } from 'react';

export interface WorkflowEvent {
  type: string;
  event_type: string;
  node_name?: string | null;
  timestamp?: number;
  data?: Record<string, any>;
  run_id?: string | null;
  error?: string | null;
}

export function useWorkflowEvents(baseUrl: string = '') {
  const [events, setEvents] = useState<WorkflowEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const clearEvents = useCallback(() => setEvents([]), []);

  useEffect(() => {
    const wsUrl = `${baseUrl.replace(/^http/, 'ws').replace(/\/$/, '')}/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
    };

    ws.onmessage = (message) => {
      try {
        const data = JSON.parse(message.data);
        setEvents((prev) => [...prev.slice(-199), data as WorkflowEvent]);
      } catch {
        // ignore non-json messages like pong
      }
    };

    ws.onclose = () => {
      setConnected(false);
    };

    ws.onerror = () => {
      setConnected(false);
    };

    const ping = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send('ping');
      }
    }, 30000);

    return () => {
      clearInterval(ping);
      ws.close();
    };
  }, [baseUrl]);

  return { events, connected, clearEvents };
}
