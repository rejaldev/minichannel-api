# Aneka Buana - Backend API

REST API untuk sistem Point of Sale Aneka Buana menggunakan Express.js + Prisma ORM + PostgreSQL.

## Quick Start

```bash
npm install
npm start
```

**URL:** http://localhost:5000

## Tech Stack

- **Runtime:** Node.js
- **Framework:** Express.js
- **ORM:** Prisma
- **Database:** PostgreSQL (Railway)
- **Authentication:** JWT (jsonwebtoken + bcryptjs)
- **CORS:** Enabled untuk frontend

## Project Structure

```
backend/
├── prisma/
│   ├── schema.prisma      # Database schema
│   └── migrations/        # Database migrations
├── routes/
│   ├── auth.js            # Authentication endpoints
│   ├── products.js        # Product management
│   ├── categories.js      # Category management
│   ├── transactions.js    # Transaction endpoints
│   ├── cabang.js          # Branch management
│   ├── settings.js        # Printer settings API
│   └── sync.js            # Desktop sync endpoints
├── middleware/
│   └── auth.js            # JWT authentication middleware
├── lib/
│   └── prisma.js          # Prisma client instance
├── server.js              # Main server file
└── package.json
```

## API Endpoints

### Authentication

```
POST   /api/auth/login              # User login
POST   /api/auth/register           # Register new user
GET    /api/auth/users              # Get all users (OWNER only)
PUT    /api/auth/users/:id          # Update user (OWNER only)
DELETE /api/auth/users/:id          # Delete user (OWNER only)
```

### Products

```
GET    /api/products                # Get all products with filters
GET    /api/products/:id            # Get product by ID
POST   /api/products                # Create new product
PUT    /api/products/:id            # Update product
DELETE /api/products/:id            # Delete product
GET    /api/products/:id/stock      # Get product stock by cabang
```

### Categories

```
GET    /api/categories              # Get all categories
POST   /api/categories              # Create category
PUT    /api/categories/:id          # Update category
DELETE /api/categories/:id          # Delete category
```

### Transactions

```
GET    /api/transactions            # Get all transactions with filters
GET    /api/transactions/:id        # Get transaction by ID
POST   /api/transactions            # Create new transaction
GET    /api/transactions/summary    # Get transaction summary
```

### Settings

```
GET    /api/settings/printer?cabangId=xxx    # Get printer settings by branch
PUT    /api/settings/printer                 # Update printer settings
```

#### Printer Settings Payload

```json
{
  "cabangId": "default",
  "autoPrintEnabled": true,
  "printerName": "POS-58",
  "paperWidth": 80,
  "showPreview": false,
  "printCopies": 1,
  "storeName": "ANEKABUANA STORE",
  "branchName": "Cabang Pusat",
  "address": "Jl. Contoh No. 123",
  "phone": "021-12345678",
  "footerText1": "Terima kasih atas kunjungan Anda",
  "footerText2": "Barang yang sudah dibeli tidak dapat dikembalikan"
}
```

#### Validations

- `paperWidth`: Must be 58 or 80
- `printCopies`: Must be between 1-5
- `cabangId`: Required

### Cabang (Branch)

```
GET    /api/cabang                  # Get all branches
POST   /api/cabang                  # Create branch
PUT    /api/cabang/:id              # Update branch
DELETE /api/cabang/:id              # Delete branch
```

## Authentication

All protected routes require JWT token in Authorization header:

```bash
Authorization: Bearer <token>
```

### User Roles

- **OWNER** - Full access to all features
- **MANAGER** - Manage products, view reports
- **KASIR** - POS transactions only

## Database Setup

### 1. Configure Environment

Create `.env` file:

```env
DATABASE_URL="postgresql://username:password@host:port/database"
JWT_SECRET="your-secret-key"
PORT=5000
```

### 2. Generate Prisma Client

```bash
npx prisma generate
```

### 3. Run Migrations

```bash
npx prisma migrate dev
```

### 4. Open Prisma Studio (Optional)

```bash
npx prisma studio
```

**URL:** http://localhost:5555

## Database Schema

### Main Tables

- `users` - User accounts with roles
- `products` - Product master data
- `product_variants` - Product variants (size, color, etc)
- `categories` - Product categories
- `cabang` - Branch/store locations
- `stocks` - Multi-branch stock management
- `transactions` - Transaction records
- `transaction_items` - Transaction line items
- `settings` - General app settings (key-value)
- `printer_settings` - Printer configuration per branch

### Relationships

```
products → product_variants (1:N)
products → categories (N:1)
product_variants → stocks (1:N, per cabang)
transactions → transaction_items (1:N)
transactions → cabang (N:1)
cabang → printer_settings (1:1)
cabang → users (1:N)
```

## Recent Updates

### v1.2.1 (Nov 15, 2025)

- Created comprehensive API usage documentation
- Identified unused endpoints for potential cleanup
- All sync endpoints actively used by desktop POS

### v1.1.0 (Nov 13, 2025)

- Added printer settings API (`/api/settings/printer`)
- Database migration: `printer_settings` table
- Per-branch printer configuration
- Validation for paper width and print copies
- Auto-create default settings on first GET

### v1.0.0

- Complete REST API for POS system
- JWT authentication with role-based access
- Multi-branch stock management
- Transaction tracking and reporting
- PostgreSQL on Railway

## Available Scripts

```bash
# Development
npm start              # Start server with nodemon (port 5000)

# Database
npx prisma generate    # Generate Prisma Client
npx prisma migrate dev # Run migrations
npx prisma studio      # Open database GUI
npx prisma db push     # Push schema without migration

# Production
npm run prod           # Start with PM2 (ecosystem.config.js)
pm2 logs backend       # View PM2 logs
pm2 restart backend    # Restart server
```

## Security Features

- Password hashing with bcryptjs
- JWT token expiration (24 hours)
- CORS configuration for trusted origins
- SQL injection protection via Prisma
- Role-based access control

## CORS Configuration

Allowed origins:

- `http://localhost:3000` (Frontend dashboard)
- `http://localhost:3001` (Desktop POS)

## Environment Variables

```env
DATABASE_URL=postgresql://...     # PostgreSQL connection string
JWT_SECRET=secret                 # JWT signing key
PORT=5000                         # Server port
NODE_ENV=development              # Environment
```

## Error Handling

Standard error responses:

```json
{
  "error": "Error message",
  "details": "Additional details (dev only)"
}
```

HTTP Status Codes:

- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `401` - Unauthorized (invalid/missing token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `500` - Internal Server Error

## Learn More

- [Express.js Documentation](https://expressjs.com/)
- [Prisma Documentation](https://www.prisma.io/docs)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [JWT Documentation](https://jwt.io/)

---

**Last Updated:** November 15, 2025  
**Version:** 1.2.1  
**Port:** 5000  
**Status:** Production Ready
