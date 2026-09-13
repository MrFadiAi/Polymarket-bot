import { useState, useEffect, useCallback, useRef } from 'react';
import type { BotState, BotConfig, LogEntry, DashboardData } from '../types';

interface WebSocketMessage {
  type: 'state' | 'log' | 'config' | 'full';
  payload: unknown;
}

// Connect to same host:port when served by bot, or port 3001 for dev.
// v3.2: forward ?token= from the page URL — browser WebSockets cannot set
// auth headers, so the query param is the only token channel.
const dashToken = new URLSearchParams(window.location.search).get('token');
const wsBase = window.location.port === '5173'
  ? `ws://${window.location.hostname}:3001`
  : `ws://${window.location.host}`;
const WS_URL = dashToken ? `${wsBase}/?token=${encodeURIComponent(dashToken)}` : wsBase;
const MAX_LOGS = 200;

export function useWebSocket() {
  const [state, setState] = useState<BotState | null>(null);
  const [config, setConfig] = useState<BotConfig | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        console.log('[Dashboard] Connected to bot');
        setConnected(true);
        setError(null);
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);

          switch (message.type) {
            case 'full': {
              const data = message.payload as DashboardData;
              if (data.state) setState(data.state);
              if (data.config) setConfig(data.config);
              if (data.logs) setLogs(data.logs.slice(0, MAX_LOGS));
              break;
            }
            case 'state':
              setState(message.payload as BotState);
              break;
            case 'config':
              setConfig(message.payload as BotConfig);
              break;
            case 'log':
              setLogs((prev) => {
                const newLogs = [message.payload as LogEntry, ...prev];
                return newLogs.slice(0, MAX_LOGS);
              });
              break;
          }
        } catch (e) {
          console.error('[Dashboard] Failed to parse message:', e);
        }
      };

      ws.onclose = () => {
        console.log('[Dashboard] Disconnected, reconnecting...');
        setConnected(false);
        wsRef.current = null;

        reconnectTimeoutRef.current = window.setTimeout(() => {
          connect();
        }, 3000);
      };

      ws.onerror = () => {
        setError('Connection failed. Is the bot running?');
        setConnected(false);
      };

      wsRef.current = ws;
    } catch (e) {
      setError(`Failed to connect: ${e}`);
    }
  }, []);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  const sendCommand = (command: string, payload: unknown): boolean => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'command', command, payload }));
      setCommandError(null);
      return true;
    }
    console.error('[Dashboard] Cannot send command, WebSocket not connected');
    // Silent failures are unacceptable for emergency controls — surface it
    setCommandError(`"${command}" was NOT sent — dashboard is not connected to the bot`);
    window.setTimeout(() => setCommandError(null), 5000);
    return false;
  };

  return { state, config, logs, connected, error, commandError, sendCommand };
}
