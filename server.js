const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// CORS Configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
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
const orderRoutes = require('./routes/orders');
const stockTransferRoutes = require('./routes/stock-transfers');

app.get('/', (req, res) => {
  res.json({ message: 'AnekaBuana Store API - Toko Inventory System' });
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
app.use('/api/orders', orderRoutes);
app.use('/api/stock-transfers', stockTransferRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// Start server - localhost only
app.listen(PORT, 'localhost', () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
