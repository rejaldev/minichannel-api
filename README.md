# MiniChannel Backend

REST API untuk MiniChannel POS System.

## Tech Stack

- Hono 4.11 (Web Framework)
- Prisma 6.19 (ORM)
- PostgreSQL 18
- Socket.io 4.8 (Real-time)
- TypeScript 5.9

## Quick Start

```bash
npm install
cp .env.example .env
npx prisma migrate dev
npm run dev
```

Server: http://localhost:5100

## API Endpoints

- `/api/auth` - Authentication
- `/api/products` - Products & import/export
- `/api/stock` - Stock adjustments & alerts
- `/api/transactions` - POS transactions
- `/api/cabang` - Branch management
- `/api/settings` - System settings
- `/api/backup` - Backup & restore

## Build

```bash
npm run build
npm start
```
