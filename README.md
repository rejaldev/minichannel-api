# MiniChannel Backend

[![Hono](https://img.shields.io/badge/Hono-4.11-E36002?logo=hono)](https://hono.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6?logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6.19-2D3748?logo=prisma)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18-4169e1?logo=postgresql)](https://postgresql.org/)
[![Socket.io](https://img.shields.io/badge/Socket.io-4.8-010101?logo=socket.io)](https://socket.io/)

REST API untuk MiniChannel - Omnichannel POS System.

## Features

- Multi-cabang stock management
- Real-time sync dengan Socket.io
- Excel import/export produk (base64 encoded)
- Stock alerts per variant
- Split payment transactions
- Auto backup dengan retention policy

## Quick Start

```bash
# Install
npm install

# Setup database
cp .env.example .env
npx prisma generate
npx prisma migrate dev

# Development
npm run dev
```

Server: http://localhost:5100

## Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| Hono | 4.11 | Web Framework |
| Prisma | 6.19 | Database ORM |
| PostgreSQL | 18 | Database |
| Socket.io | 4.8 | Real-time |
| XLSX | 0.18 | Excel processing |
| JWT | 9.0 | Authentication |

## Project Structure

```
src/
├── index.ts           # Entry point
├── routes/
│   ├── auth.ts        # Authentication
│   ├── products.ts    # Products & import/export
│   ├── stock.ts       # Stock adjustments
│   ├── transactions.ts # POS transactions
│   └── ...
├── middleware/
│   └── auth.ts        # JWT & RBAC
└── lib/
    ├── prisma.ts      # Database client
    ├── socket.ts      # WebSocket setup
    └── jwt.ts         # Token utils
```

## API Endpoints

| Prefix | Description |
|--------|-------------|
| `/api/auth` | Authentication & users |
| `/api/products` | Products, categories, import/export |
| `/api/stock` | Stock adjustments & alerts |
| `/api/stock-transfers` | Inter-branch transfers |
| `/api/transactions` | POS transactions |
| `/api/returns` | Returns & refunds |
| `/api/cabang` | Branch management |
| `/api/settings` | System settings |
| `/api/backup` | Backup & restore |

## Build & Deploy

```bash
# Build
npm run build

# Production
npm start

# PM2
pm2 start ecosystem.config.js
```

## Environment Variables

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/minichannel
JWT_SECRET=your-secret-key
PORT=5100
```
