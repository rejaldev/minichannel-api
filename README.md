# MiniChannel API

REST API backend for MiniChannel - Multi-tenant Point of Sale and inventory management system with marketplace integration.

[![Hono](https://img.shields.io/badge/Hono-4.11-E36002?logo=hono)](https://hono.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6?logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6.19-2D3748?logo=prisma)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16+-4169e1?logo=postgresql)](https://postgresql.org/)
[![Socket.io](https://img.shields.io/badge/Socket.io-4.8-010101?logo=socket.io)](https://socket.io/)

## Features

- 🏪 **Multi-tenant Architecture** - Each store with independent settings
- 🏢 **Multi-branch Management** - Unlimited branches per store
- 📦 **Inventory Management** - Real-time stock tracking & alerts
- 💰 **POS System** - Fast transaction processing with split payment
- 🔄 **Stock Transfers** - Inter-branch inventory movement
- 🛒 **Marketplace Integration** - Tokopedia, Shopee sync (coming soon)
- 👥 **Role-based Access Control** - Owner, Manager, Kasir roles
- 🔌 **Real-time Updates** - Socket.io for live data sync
- 🧾 **Receipt Management** - Customizable thermal printer receipts
- 📊 **Reporting** - Sales, inventory, and performance analytics

## Quick Start

### Development

```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env

# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev

# Start development server (with hot reload)
npm run dev
```

Server runs at: **http://localhost:5100**

### Production

```bash
# Install & build
npm install          # Runs: prisma generate && tsc

# Run migrations
npx prisma migrate deploy

# Start production server
npm start            # Runs: node dist/index.js
```

## Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| **Hono** | 4.11 | Web Framework (fast, lightweight) |
| **TypeScript** | 5.9 | Type Safety |
| **Prisma** | 6.19 | Database ORM |
| **PostgreSQL** | 16+ | Database |
| **Socket.io** | 4.8 | Real-time Updates |
| **JWT** | 9.0 | Authentication |
| **Vitest** | 4.0 | Testing |

## Project Structure

```
backend/
├── src/
│   ├── index.ts              # Server Entry Point
│   ├── lib/
│   │   ├── prisma.ts         # Database Client
│   │   ├── jwt.ts            # Token Utils
│   │   └── socket.ts         # WebSocket Setup
│   ├── middleware/
│   │   └── auth.ts           # Authentication & RBAC
│   └── routes/
│       ├── auth.ts           # Auth & Users
│       ├── products.ts       # Products, Categories, Import
│       ├── stock.ts          # Stock Adjustments & Alerts
│       ├── stock-transfers.ts# Inter-branch Transfers
│       ├── transactions.ts   # POS Transactions
│       ├── returns.ts        # Returns & Refunds
│       ├── cabang.ts         # Branch Management
│       ├── channels.ts       # Sales Channels (Marketplace)
│       ├── settings.ts       # System Settings
│       ├── sync.ts           # Data Sync
│       └── backup.ts         # Backup & Restore
├── dist/                     # Compiled JavaScript (production)
├── prisma/
│   ├── schema.prisma         # Database Schema (18 tables)
│   └── migrations/           # Migration History
├── uploads/                  # Temporary file uploads
├── backups/                  # Database backups
└── package.json
```

## API Endpoints

### Authentication

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| POST | `/api/auth/login` | User login | Public |
| POST | `/api/auth/register` | Create user | Owner |
| GET | `/api/auth/me` | Get current user | Auth |
| GET | `/api/auth/users` | List all users | Owner |
| PUT | `/api/auth/users/:id` | Update user | Owner |
| DELETE | `/api/auth/users/:id` | Delete user | Owner |

### Products

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/api/products` | List products | Auth |
| GET | `/api/products/:id` | Get product detail | Auth |
| POST | `/api/products` | Create product | Owner/Manager |
| PUT | `/api/products/:id` | Update product | Owner/Manager |
| DELETE | `/api/products/:id` | Delete product | Owner/Manager |
| POST | `/api/products/import` | Import from Excel | Owner/Manager |
| GET | `/api/products/export/template` | Download template | Owner/Manager |
| GET | `/api/products/categories` | List categories | Auth |
| POST | `/api/products/categories` | Create category | Owner/Manager |
| PUT | `/api/products/categories/:id` | Update category | Owner/Manager |
| DELETE | `/api/products/categories/:id` | Delete category | Owner/Manager |

### Stock

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/api/stock/adjustments` | List adjustments | Auth |
| POST | `/api/stock/adjustment` | Create adjustment | Auth |
| GET | `/api/stock/alerts/low` | Low stock alerts | Auth |
| POST | `/api/stock/alert` | Set stock alert | Owner/Manager |

### Stock Transfers

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/api/stock-transfers` | List transfers | Auth |
| POST | `/api/stock-transfers` | Create transfer | Auth |
| PUT | `/api/stock-transfers/:id/receive` | Receive transfer | Auth |

### Transactions

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/api/transactions` | List transactions | Auth |
| GET | `/api/transactions/:id` | Get transaction detail | Auth |
| POST | `/api/transactions` | Create transaction | Auth |
| PUT | `/api/transactions/:id/cancel` | Cancel transaction | Owner/Manager |
| GET | `/api/transactions/reports/summary` | Sales summary | Owner/Manager |
| GET | `/api/transactions/reports/daily` | Daily report | Owner/Manager |

### Returns

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/api/returns` | List returns | Auth |
| GET | `/api/returns/:id` | Get return detail | Auth |
| POST | `/api/returns` | Create return | Auth |
| PATCH | `/api/returns/:id/approve` | Approve return | Manager+ |
| PATCH | `/api/returns/:id/reject` | Reject return | Manager+ |

### Branches

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/api/cabang` | List branches | Auth |
| POST | `/api/cabang` | Create branch | Owner |
| PUT | `/api/cabang/:id` | Update branch | Owner |
| DELETE | `/api/cabang/:id` | Delete branch | Owner |

### Sales Channels

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/api/channels` | List channels | Auth |
| POST | `/api/channels` | Create channel | Owner/Manager |
| GET | `/api/channels/stats/summary` | Channel statistics | Owner/Manager |

### Settings

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/api/settings/:key` | Get setting | Auth |
| PUT | `/api/settings/:key` | Update setting | Owner |
| GET | `/api/settings/printer` | Printer settings | Auth |
| PUT | `/api/settings/printer` | Update printer | Owner/Manager |

### Backup

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/api/backup/list` | List backups | Owner |
| POST | `/api/backup/database` | Create backup | Owner |
| POST | `/api/backup/restore` | Restore backup | Owner |

## Environment Variables

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/minichannel"

# JWT
JWT_SECRET="your-secret-key-min-32-characters"
JWT_EXPIRES_IN="7d"

# Server
PORT=5100
NODE_ENV=development

# CORS
CORS_ORIGIN="http://localhost:3100"
```

## Scripts

```bash
# Development
npm run dev          # Start with hot reload (tsx watch)

# Production
npm run build        # Compile TypeScript → dist/
npm start            # Run compiled JavaScript

# Database
npm run db:push      # Quick schema sync (dev only)
npm run db:migrate   # Run migrations (production safe)

# Testing
npm run test         # Run tests (watch mode)
npm run test:run     # Run tests once
npm run test:coverage # Run with coverage

# Type Check
npm run typecheck    # Check TypeScript errors
```

## Deployment

### PM2 (VPS)

```bash
# Setup
git pull origin main
cd backend
cp .env.production .env
npm install

# Database
npx prisma migrate deploy

# Start/Restart
pm2 start ecosystem.config.js
pm2 save

# Logs
pm2 logs anekabuana-backend
```

### Railway

Automatically deploys via `Procfile`:
```
web: npm run start
```

### Docker (Coming Soon)

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
COPY prisma ./prisma
RUN npx prisma generate
EXPOSE 5100
CMD ["node", "dist/index.js"]
```

## Testing

```bash
npm run test:run
```

Test coverage includes:
- ✅ JWT token generation and validation
- ✅ Authentication middleware (RBAC)
- ✅ Route handlers (auth, products, stock, transactions, returns)

## Database Schema

18 tables including:
- `users` - User accounts with roles (OWNER, MANAGER, ADMIN, KASIR)
- `cabang` - Branch/store locations
- `categories` - Product categories
- `products` - Master products (SINGLE/VARIANT)
- `product_variants` - SKU-based variants
- `stocks` - Stock per branch per variant
- `transactions` - Sales records
- `returns` - Return/refund records
- `sales_channels` - Marketplace channels
- And more...

```bash
# View schema
npx prisma studio
```

## Real-time Events (Socket.io)

| Event | Payload | Description |
|-------|---------|-------------|
| `product:created` | Product | New product added |
| `product:updated` | Product | Product modified |
| `product:deleted` | { id } | Product removed |
| `stock:updated` | Stock | Stock changed |
| `category:updated` | Category | Category modified |

## License

MIT
