const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const { Server } = require('socket.io');
require('dotenv').config();
const { initBackupScheduler } = require('./lib/backup-scheduler');

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 5000;

// CORS Configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3100',
      'http://localhost:3500',
      'http://localhost:4000',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3100',
      'http://127.0.0.1:3500',
      'http://127.0.0.1:4000',
      process.env.CORS_ORIGIN, // From .env
    ].filter(Boolean);

    // Allow any Vercel deployment URL
    if (origin.endsWith('.vercel.app') || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

// Initialize Socket.io
const io = new Server(httpServer, {
  cors: {
    origin: [
      'http://localhost:3000', 
      'http://localhost:3500',
      'http://localhost:4000', 
      'http://127.0.0.1:3000', 
      'http://127.0.0.1:3500',
      'http://127.0.0.1:4000'
    ],
    credentials: true
  }
});

// Initialize socket helper
const socketHelper = require('./lib/socket');
socketHelper.initSocket(io);

// Make io accessible to routes
app.set('io', io);

// Socket.io connection handler
io.on('connection', (socket) => {
  console.log('[WebSocket] Client connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('[WebSocket] Client disconnected:', socket.id);
  });
});

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// Routes
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const transactionRoutes = require('./routes/transactions');
const cabangRoutes = require('./routes/cabang');
const settingsRoutes = require('./routes/settings');
const syncRoutes = require('./routes/sync');
const returnRoutes = require('./routes/returns');
const stockTransferRoutes = require('./routes/stock-transfers');
const backupRoutes = require('./routes/backup');
const stockRoutes = require('./routes/stock');
const channelRoutes = require('./routes/channels');

app.get('/', (req, res) => {
  res.json({ message: 'MiniChannel API - Toko Inventory System' });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/cabang', cabangRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/returns', returnRoutes);
app.use('/api/stock-transfers', stockTransferRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/channels', channelRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// Initialize backup scheduler
initBackupScheduler();

// Start server - bind to 0.0.0.0 for cloud deployment
const HOST = process.env.HOST || '0.0.0.0';
httpServer.listen(PORT, HOST, () => {
  console.log(`🚀 Server running on http://${HOST}:${PORT}`);
  console.log(`🔌 WebSocket server ready`);
});
