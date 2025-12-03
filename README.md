# Aneka Buana - Backend API

REST API untuk sistem Point of Sale Aneka Buana.

## Quick Start

```bash
npm install
npm start
```

**URL:** http://localhost:5000

## Tech Stack

- Node.js + Express.js
- Prisma ORM + PostgreSQL
- JWT Authentication
- Socket.IO (real-time sync)

## API Endpoints

### Authentication
```
POST   /api/auth/login         # Login
POST   /api/auth/register      # Register (Owner only)
GET    /api/auth/users         # Get all users
PUT    /api/auth/users/:id     # Update user
DELETE /api/auth/users/:id     # Delete user
```

### Products
```
GET    /api/products           # Get all products
GET    /api/products/:id       # Get product by ID
POST   /api/products           # Create product
PUT    /api/products/:id       # Update product
DELETE /api/products/:id       # Delete product
GET    /api/products/barcode/:sku  # Get by SKU
```

### Transactions
```
GET    /api/transactions       # Get transactions
POST   /api/transactions       # Create transaction
GET    /api/transactions/summary           # Summary
GET    /api/transactions/reports/sales-trend      # Sales trend
GET    /api/transactions/reports/top-products     # Top products
GET    /api/transactions/reports/branch-performance  # Branch stats
```

### Settings
```
GET    /api/settings/printer?cabangId=xxx  # Get printer settings
PUT    /api/settings/printer               # Update printer settings
```

### Cabang & Categories
```
GET/POST/PUT/DELETE  /api/cabang      # Branch management
GET/POST/PUT/DELETE  /api/categories  # Category management
```

### Returns
```
GET    /api/returns            # Get all returns
POST   /api/returns            # Create return
PUT    /api/returns/:id        # Update return status
```

### Sync (Desktop)
```
GET    /api/sync/health        # Health check
GET    /api/sync/products/delta?updatedAfter=xxx  # Delta sync
POST   /api/sync/transactions  # Sync transaction
```

## User Roles

| Role | Access |
|------|--------|
| OWNER | Full access, all branches |
| MANAGER | Products, reports, optional branch |
| KASIR | POS only, **required** branch assignment |

## Database

```bash
npx prisma generate    # Generate client
npx prisma migrate dev # Run migrations
npx prisma studio      # Open GUI
```

## Environment Variables

```env
DATABASE_URL=postgresql://...
JWT_SECRET=your-secret
PORT=5000
```

---
**Port:** 5000
