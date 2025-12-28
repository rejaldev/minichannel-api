import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { createServer } from 'http';
import { Server } from 'socket.io';
import 'dotenv/config';

// Import routes
import auth from './routes/auth';
import products from './routes/products';
import transactions from './routes/transactions';
import cabang from './routes/cabang';
import settings from './routes/settings';
import sync from './routes/sync';
import returns from './routes/returns';
import stockTransfers from './routes/stock-transfers';
import backup from './routes/backup';
import stock from './routes/stock';
import channels from './routes/channels';

// Import socket helper
import { initSocket } from './lib/socket';

const app = new Hono();
const PORT = parseInt(process.env.PORT || '5000');

// CORS Configuration
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3100',
  'http://localhost:3500',
  'http://localhost:4000',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3100',
  'http://127.0.0.1:3500',
  'http://127.0.0.1:4000',
  process.env.CORS_ORIGIN,
].filter(Boolean) as string[];

app.use('*', cors({
  origin: (origin) => {
    if (!origin) return origin;
    // Allow Vercel preview deployments
    if (origin.endsWith('.vercel.app')) return origin;
    // Allow custom domains ending with ziqrishahab.com
    if (origin.endsWith('.ziqrishahab.com') || origin === 'https://ziqrishahab.com') return origin;
    // Allow configured origins
    if (allowedOrigins.includes(origin)) return origin;
    return null;
  },
  credentials: true,
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}));

// Logger middleware
app.use('*', logger());

// Root endpoint
app.get('/', (c) => {
  return c.json({ message: 'MiniChannel API - Toko Inventory System (Hono)' });
});

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'OK', timestamp: new Date() });
});

// API Routes
app.route('/api/auth', auth);
app.route('/api/products', products);
app.route('/api/transactions', transactions);
app.route('/api/cabang', cabang);
app.route('/api/settings', settings);
app.route('/api/sync', sync);
app.route('/api/returns', returns);
app.route('/api/stock-transfers', stockTransfers);
app.route('/api/backup', backup);
app.route('/api/stock', stock);
app.route('/api/channels', channels);

// Error handling
app.onError((err, c) => {
  console.error('Error:', err);
  return c.json({ error: err.message || 'Internal server error' }, 500);
});

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not Found' }, 404);
});

// Create HTTP server with Socket.io
const server = createServer(async (req, res) => {
  // Let Hono handle the request
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') {
      headers[key] = value;
    } else if (Array.isArray(value)) {
      headers[key] = value.join(', ');
    }
  }
  const request = new Request(url.toString(), {
    method: req.method,
    headers,
  });
  const response = await app.fetch(request);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  const body = await response.text();
  res.end(body);
});

// Initialize Socket.io
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true
  }
});

// Initialize socket helper
initSocket(io);

// Socket.io connection handler
io.on('connection', (socket) => {
  console.log('[WebSocket] Client connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('[WebSocket] Client disconnected:', socket.id);
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🔌 WebSocket server ready`);
  console.log(`📦 Using Hono + TypeScript`);
});

export default app;
