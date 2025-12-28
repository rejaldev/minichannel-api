# MiniChannel API

REST API backend for Point of Sale and inventory management system built with Hono and TypeScript.

[![Hono](https://img.shields.io/badge/Hono-4.7-E36002?logo=hono)](https://hono.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178c6?logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6.8-2D3748?logo=prisma)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16+-4169e1?logo=postgresql)](https://postgresql.org/)

## Quick Start

```bash
npm install
cp .env.example .env
npx prisma generate
npx prisma migrate dev
npm run dev
```

## Tech Stack

- **Hono** - Web Framework
- **TypeScript** - Type Safety
- **Prisma** - Database ORM
- **PostgreSQL** - Database
- **Socket.io** - Real-time Updates
- **JWT** - Authentication
- **Vitest** - Testing

## Project Structure

```
src/
├── index.ts            # Server Entry Point
├── lib/
│   ├── prisma.ts       # Database Client
│   ├── jwt.ts          # Token Utils
│   └── socket.ts       # WebSocket Setup
├── middleware/
│   └── auth.ts         # Authentication
├── routes/
│   ├── auth.ts         # Auth & Users
│   ├── products.ts     # Products & Categories
│   ├── stock.ts        # Stock Management
│   ├── transactions.ts # POS Transactions
│   ├── returns.ts      # Returns & Refunds
│   ├── cabang.ts       # Branch Management
│   ├── settings.ts     # System Settings
│   └── backup.ts       # Backup & Restore
└── test/
    └── setup.ts        # Test Configuration

prisma/
├── schema.prisma       # Database Schema
└── migrations/         # Migration History
```

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | User login |
| POST | `/api/auth/register` | Create user (Owner only) |
| GET | `/api/auth/me` | Get current user |
| GET | `/api/auth/users` | List all users (Owner only) |

### Products

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/products` | List products |
| GET | `/api/products/:id` | Get product detail |
| POST | `/api/products` | Create product |
| PUT | `/api/products/:id` | Update product |
| DELETE | `/api/products/:id` | Delete product |
| GET | `/api/products/categories` | List categories |
| POST | `/api/products/categories` | Create category |

### Stock

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/stock/adjustments` | List adjustments |
| POST | `/api/stock/adjustment` | Create adjustment |
| GET | `/api/stock/alerts/low` | Low stock alerts |
| POST | `/api/stock/alert` | Set stock alert |

### Transactions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/transactions` | List transactions |
| GET | `/api/transactions/:id` | Get transaction detail |
| POST | `/api/transactions` | Create transaction |
| PUT | `/api/transactions/:id/cancel` | Cancel transaction |
| GET | `/api/transactions/reports/summary` | Sales summary |

### Returns

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/returns` | List returns |
| GET | `/api/returns/:id` | Get return detail |
| POST | `/api/returns` | Create return |
| PATCH | `/api/returns/:id/approve` | Approve return |
| PATCH | `/api/returns/:id/reject` | Reject return |

### Branches

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/cabang` | List branches |
| POST | `/api/cabang` | Create branch |
| PUT | `/api/cabang/:id` | Update branch |
| DELETE | `/api/cabang/:id` | Delete branch |

## Environment Variables

```env
DATABASE_URL="postgresql://user:password@localhost:5432/minichannel"
JWT_SECRET="your-secret-key"
JWT_EXPIRES_IN="7d"
PORT=5000
CORS_ORIGIN="http://localhost:3000"
```

## Scripts

```bash
npm run dev       # Development server
npm run build     # Build TypeScript
npm run start     # Production server
npm run test      # Run tests (watch)
npm run test:run  # Run tests (once)
```

## Testing

```bash
npm run test:run
```

Test coverage includes:
- JWT token generation and validation
- Authentication middleware
- Route handlers (auth, products, stock, transactions, returns)

## Database

Generate Prisma client:
```bash
npx prisma generate
```

Run migrations:
```bash
npx prisma migrate dev
```

Open Prisma Studio:
```bash
npx prisma studio
```

## License

MIT
