/**
 * Dashboard Server - Express + WebSocket server for real-time monitoring
 *
 * Usage:
 *   import { startDashboard } from './src/dashboard/server.js';
 *   startDashboard(3001);
 *   startDashboard({ port: 3001, host: '127.0.0.1', token: 'secret' });
 *
 * Security defaults (v3.2): binds 127.0.0.1 (override with the `host`
 * option or DASHBOARD_HOST env) and — when DASHBOARD_TOKEN (or the `token`
 * option) is set — requires that token on /api/* requests and the
 * WebSocket upgrade. Browser WebSockets cannot set headers, so the token
 * rides the URL query: ws://host:port/?token=... Static files and /health
 * stay open (the app shell contains no data).
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { dashboardEmitter } from './state-emitter.js';
import type { WebSocketMessage } from './types.js';
import { loadHistory, getSession, getHistorySummary } from './session-history.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let server: http.Server | null = null;
let wss: WebSocketServer | null = null;

export interface DashboardOptions {
  port?: number;
  /** Bind address. Default 127.0.0.1 (localhost only). Use '0.0.0.0' to expose. */
  host?: string;
  /** When set, required on /api/* and the WebSocket upgrade. */
  token?: string;
}

const LOCAL_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

function broadcast(message: WebSocketMessage): void {
  if (!wss) return;
  const data = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

export function startDashboard(options: number | DashboardOptions = 3001): http.Server {
  const port = typeof options === 'number' ? options : (options.port ?? 3001);
  const host = (typeof options === 'object' && options.host) || process.env.DASHBOARD_HOST || '127.0.0.1';
  const token = (typeof options === 'object' && options.token) || process.env.DASHBOARD_TOKEN || null;

  server = http.createServer((req, res) => {
    // CORS: reflect localhost origins only (dev on :5173 needs it); remote
    // origins get no CORS header at all instead of the old blanket '*'.
    const origin = req.headers.origin;
    if (origin && LOCAL_ORIGIN_RE.test(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://localhost:${port}`);

    // v3.2 auth: /api/* requires the token when one is configured.
    // Static files and /health stay open — the app shell has no data.
    if (token && url.pathname.startsWith('/api/')) {
      const provided = url.searchParams.get('token')
        ?? (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
      if (!provided) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Token required' }));
        return;
      }
      if (provided !== token) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid token' }));
        return;
      }
    }

    if (url.pathname === '/api/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(dashboardEmitter.getFullData()));
      return;
    }

    if (url.pathname === '/api/state') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(dashboardEmitter.getState()));
      return;
    }

    if (url.pathname === '/api/config') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(dashboardEmitter.getConfig()));
      return;
    }

    if (url.pathname === '/api/logs') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(dashboardEmitter.getLogs()));
      return;
    }

    // History API endpoints
    if (url.pathname === '/api/history') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(loadHistory()));
      return;
    }

    if (url.pathname.startsWith('/api/history/')) {
      const sessionId = url.pathname.replace('/api/history/', '');
      const session = getSession(sessionId);
      if (session) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(session));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Session not found' }));
      }
      return;
    }

    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
      return;
    }

    // Serve static files from dashboard/dist
    const distPath = path.resolve(__dirname, '../../dashboard/dist');
    let filePath = path.join(distPath, url.pathname === '/' ? 'index.html' : url.pathname);

    // Check if file exists
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      const mimeTypes: Record<string, string> = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
      };
      const contentType = mimeTypes[ext] || 'application/octet-stream';

      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    // SPA fallback - serve index.html for all other routes
    const indexPath = path.join(distPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      fs.createReadStream(indexPath).pipe(res);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  // v3.2 auth: manual upgrade so the token can be checked before the WS
  // handshake completes (browser WebSockets cannot send auth headers).
  wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    if (token) {
      const u = new URL(req.url || '/', `http://localhost:${port}`);
      if (u.searchParams.get('token') !== token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
    }
    wss!.handleUpgrade(req, socket, head, (ws) => wss!.emit('connection', ws, req));
  });

  wss.on('connection', (ws) => {
    console.log('[Dashboard] Client connected');

    // Send full state on connect
    ws.send(JSON.stringify({
      type: 'full',
      payload: dashboardEmitter.getFullData(),
    } as WebSocketMessage));

    // Handle incoming messages (commands)
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === 'command') {
          console.log(`[Dashboard] Command received: ${message.command}`, message.payload);
          dashboardEmitter.emit('command', { command: message.command, payload: message.payload });
        }
      } catch (e) {
        console.error('[Dashboard] Failed to parse message:', e);
      }
    });

    ws.on('close', () => {
      console.log('[Dashboard] Client disconnected');
    });

    ws.on('error', (err) => {
      console.error('[Dashboard] WebSocket error:', err.message);
    });
  });

  // Subscribe to state changes
  dashboardEmitter.on('state', (state) => {
    broadcast({ type: 'state', payload: state });
  });

  dashboardEmitter.on('log', (entry) => {
    broadcast({ type: 'log', payload: entry });
  });

  dashboardEmitter.on('config', (config) => {
    broadcast({ type: 'config', payload: config });
  });

  server.listen(port, host, () => {
    const shownUrl = `http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`;
    console.log(`[Dashboard] Server running at ${shownUrl}${token ? ' (API/WS token required)' : ''}`);
    if (host === '0.0.0.0') {
      console.log('[Dashboard] ⚠️  Bound to ALL interfaces — anyone on your network can reach this dashboard.');
    }
  });

  return server;
}

export function stopDashboard(): Promise<void> {
  return new Promise((resolve) => {
    if (wss) {
      wss.close();
      wss = null;
    }
    if (server) {
      server.close(() => {
        server = null;
        resolve();
      });
    } else {
      resolve();
    }
  });
}

export { dashboardEmitter };
