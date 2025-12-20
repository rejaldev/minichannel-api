# 🔧 MiniChannel - Backend API

REST API untuk Point of Sale system dengan real-time synchronization dan advanced search capabilities.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Setup database
npx prisma generate
npx prisma migrate dev

# Seed initial data (optional)
npm run seed

# Start development server
npm run dev
```

**API URL:** http://localhost:5100  
**API Docs:** http://localhost:5100/api

## 🛠 Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| **Node.js** | 20 LTS | Runtime environment |
| **Express.js** | 5.1.0 | Web framework |
| **Prisma ORM** | 6.19.0 | Database ORM |
| **PostgreSQL** | 18 | Primary database (port 3900) |
| **Socket.io** | 4.8.1 | Real-time WebSocket |
| **JWT** | 9.0.2 | Authentication tokens |
| **bcryptjs** | 2.4.3 | Password hashing |
| **Winston** | 3.17.1 | Logging framework |
| **PM2** | Latest | Process manager (production) |

## 📡 API Endpoints

### 🔐 Authentication (`/api/auth`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/login` | User login (returns access + refresh token) | ❌ |
| POST | `/register` | Register new user (OWNER only) | ✅ |
| POST | `/refresh` | Refresh access token | ❌ (refresh token in cookie) |
| POST | `/logout` | Logout & clear tokens | ✅ |
| GET | `/users` | Get all users | ✅ (OWNER) |
| GET | `/users/:id` | Get user by ID | ✅ |
| PUT | `/users/:id` | Update user (role, branch, status) | ✅ (OWNER) |
| DELETE | `/users/:id` | Delete user | ✅ (OWNER) |

**Login Response:**
```json
{
  "user": {
    "id": "uuid",
    "username": "kasir1",
    "name": "Kasir Satu",
    "role": "KASIR",
    "cabangId": "uuid",
    "status": "active"
  },
  "token": "eyJhbGc...",
  "refreshToken": "eyJhbGc..." // Also set as HttpOnly cookie
}
```

### 📦 Products (`/api/products`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/` | Get all products with variants & stock | ✅ |
| GET | `/:id` | Get product by ID | ✅ |
| GET | `/barcode/:sku` | Get product by SKU/barcode | ✅ |
| POST | `/` | Create product with variants | ✅ (MANAGER+) |
| PUT | `/:id` | Update product & variants | ✅ (MANAGER+) |
| DELETE | `/:id` | Delete product | ✅ (MANAGER+) |

**Product Search Query Params:**
- `search` - Smart search dengan multi-keyword & variant filtering
- `categoryId` - Filter by category
- `cabangId` - Filter by branch stock

**Search Algorithm Features:**
- 7-phase filtering with relevance scoring
- Multi-keyword parsing (text + numbers)
- Word boundary matching for exact numbers
- Variant-level filtering
- Pre-product keyword validation
- Dynamic threshold filtering (20-40% of top score)

**Example Search:**
```bash
# Exact match with context
GET /api/products?search=Baju SD 7

# Response: Only products with "Baju", "SD", and variant with "7"
# (e.g., "Baju Sekolah - SD 7", NOT "Baju Pramuka - Panjang 7")
```

### 💳 Transactions (`/api/transactions`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/` | Get transactions with filters | ✅ |
| GET | `/:id` | Get transaction by ID | ✅ |
| POST | `/` | Create transaction (POS checkout) | ✅ |
| GET | `/summary` | Daily/weekly/monthly summary | ✅ |
| GET | `/reports/sales-trend` | Sales trend chart data | ✅ (MANAGER+) |
| GET | `/reports/top-products` | Top selling products | ✅ (MANAGER+) |
| GET | `/reports/branch-performance` | Branch comparison | ✅ (OWNER) |
| GET | `/reports/payment-methods` | Payment breakdown | ✅ (MANAGER+) |
| POST | `/export/csv` | Export to CSV | ✅ (MANAGER+) |
| POST | `/export/pdf` | Export to PDF | ✅ (MANAGER+) |

**Transaction Filters:**
- `startDate` & `endDate` - Date range
- `cabangId` - Branch filter
- `userId` - Kasir filter
- `paymentMethod` - Cash, Transfer, QRIS, Debit
- `page` & `limit` - Pagination

**Create Transaction Body:**
```json
{
  "cabangId": "uuid",
  "items": [
    {
      "variantId": "uuid",
      "quantity": 2,
      "price": 50000
    }
  ],
  "payments": [
    {
      "method": "CASH",
      "amount": 75000
    },
    {
      "method": "QRIS",
      "amount": 25000
    }
  ],
  "totalAmount": 100000,
  "totalPaid": 100000,
  "change": 0
}
```

### 🔄 Returns & Refunds (`/api/returns`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/` | Get all returns | ✅ (MANAGER+) |
| POST | `/` | Create return request | ✅ |
| PUT | `/:id` | Update return status (approve/reject) | ✅ (MANAGER+) |

**Return Status Flow:**
```
PENDING → APPROVED → COMPLETED
        ↘ REJECTED
```

### 🏢 Branches (`/api/cabang`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/` | Get all branches | ✅ |
| POST | `/` | Create branch | ✅ (OWNER) |
| PUT | `/:id` | Update branch | ✅ (OWNER) |
| DELETE | `/:id` | Delete branch | ✅ (OWNER) |

### 📂 Categories (`/api/categories`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/` | Get all categories | ✅ |
| POST | `/` | Create category | ✅ (MANAGER+) |
| PUT | `/:id` | Update category | ✅ (MANAGER+) |
| DELETE | `/:id` | Delete category | ✅ (MANAGER+) |

### 📦 Stock Transfers (`/api/stock-transfers`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/` | Get all transfers | ✅ |
| POST | `/` | Create transfer request | ✅ (MANAGER+) |
| PUT | `/:id` | Update status (approve/reject) | ✅ (MANAGER+) |

**Transfer Status Flow:**
```
PENDING → APPROVED → COMPLETED
        ↘ REJECTED
```

### ⚙️ Settings (`/api/settings`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/printer?cabangId=xxx` | Get printer settings | ✅ |
| PUT | `/printer` | Update printer settings | ✅ (MANAGER+) |
| POST | `/backup/manual` | Manual database backup | ✅ (OWNER) |
| POST | `/backup/auto` | Enable auto backup (daily 00:00) | ✅ (OWNER) |
| GET | `/backup/list` | List all backups | ✅ (OWNER) |
| POST | `/backup/restore/:id` | Restore from backup | ✅ (OWNER) |

**Printer Settings:**
```json
{
  "cabangId": "uuid",
  "headerText": "ANEKA BUANA",
  "footerText": "Terima kasih!",
  "paperSize": "80mm", // or "58mm"
  "autoPrint": true
}
```

### 🔄 Sync (Desktop App) (`/api/sync`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/health` | Health check | ❌ |
| GET | `/products/delta?updatedAfter=xxx` | Delta sync products | ✅ |
| POST | `/transactions` | Upload offline transactions | ✅ |
| GET | `/settings` | Sync settings | ✅ |

## 🔐 Authentication & Authorization

### JWT Tokens

**Access Token:**
- Expiry: 15 minutes
- Stored in: `Authorization: Bearer <token>` header
- Payload: `{ userId, username, role, cabangId }`

**Refresh Token:**
- Expiry: 7 days
- Stored in: HttpOnly cookie (`refreshToken`)
- Used to: Get new access token via `/api/auth/refresh`

**Token Refresh Flow:**
```
1. Access token expires (401 error)
2. Frontend auto-calls /api/auth/refresh with cookie
3. Backend validates refresh token
4. Returns new access token
5. Frontend retries original request
```

### Role-Based Access Control

| Role | Permissions |
|------|-------------|
| **OWNER** | Full system access, all branches, user management |
| **MANAGER** | Product CRUD, reports, settings (optional branch assignment) |
| **ADMIN** | Limited admin features (future use) |
| **KASIR** | POS only, view stock, **must** have branch assigned |

**Middleware:** `middleware/auth.js`
```javascript
// Require authentication
router.use(authMiddleware);

// Require specific role
router.post('/products', requireRole(['MANAGER', 'OWNER']), ...);

// Require branch assignment (for KASIR)
router.get('/stock', requireBranch, ...);
```

## 🗄 Database Schema

### Key Tables

**Users:**
```prisma
model User {
  id         String   @id @default(uuid())
  username   String   @unique
  password   String   // bcrypt hashed
  name       String
  role       UserRole
  cabangId   String?  // Required for KASIR
  status     String   @default("active")
  loginAttempts Int   @default(0)
  lockUntil  DateTime?
}
```

**Products & Variants:**
```prisma
model Product {
  id          String   @id @default(uuid())
  name        String
  description String?
  categoryId  String?
  productType String   @default("variant") // variant or single
  variants    Variant[]
}

model Variant {
  id         String   @id @default(uuid())
  productId  String
  sku        String   @unique
  name       String   // e.g., "SD 7", "Merah - XL"
  stock      Stock[]
}
```

**Transactions:**
```prisma
model Transaction {
  id            String   @id @default(uuid())
  cabangId      String
  userId        String   // Kasir
  totalAmount   Decimal
  totalPaid     Decimal
  change        Decimal  @default(0)
  items         TransactionItem[]
  payments      Payment[]
  createdAt     DateTime @default(now())
}
```

**Stock:**
```prisma
model Stock {
  id         String   @id @default(uuid())
  variantId  String
  cabangId   String
  quantity   Int
  minStock   Int      @default(5)
  price      Decimal  // Selling price (per branch)
}
```

### Migrations

```bash
# Create migration
npx prisma migrate dev --name add_feature

# Apply migrations (production)
npx prisma migrate deploy

# Reset database (dev only)
npx prisma migrate reset

# Generate Prisma Client
npx prisma generate
```

### Seeding

```bash
# Seed all data
npm run seed

# Seed specific data
node prisma/seed-products.js
node prisma/clear-transactions.js
```

## 🚦 Real-time Events (Socket.io)

**Emitted Events:**
- `product:created` - New product added
- `product:updated` - Product/stock updated
- `product:deleted` - Product removed
- `transaction:created` - New transaction
- `stock:updated` - Stock quantity changed
- `sync:required` - Force refresh all data

**Client Connection:**
```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:5100', {
  auth: { token: 'Bearer xxx' }
});

socket.on('product:updated', (product) => {
  // Update UI
});
```

## 🔧 Configuration

### Environment Variables

Create `.env` in backend root:

```env
# Server
PORT=5100
NODE_ENV=development
CORS_ORIGIN=http://localhost:3100

# Database (PostgreSQL)
DATABASE_URL=postgresql://postgres:password@localhost:3900/anekabuana?schema=public

# JWT Secrets
JWT_SECRET=your-super-secret-key-change-in-production
JWT_REFRESH_SECRET=your-refresh-secret-change-in-production
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Logging
LOG_LEVEL=info
LOG_DIR=./backend/logs

# Backup
BACKUP_DIR=./backend/backups
BACKUP_RETENTION_DAYS=7
```

### CORS Configuration

**Development:**
```javascript
// server.js
const corsOptions = {
  origin: ['http://localhost:3100'],
  credentials: true
};
```

**Production:**
```javascript
const corsOptions = {
  origin: process.env.CORS_ORIGIN.split(','),
  credentials: true
};
```

## 🛡 Security Features

### Password Security
- bcrypt hashing with 10 salt rounds
- Minimum 6 characters required
- No password in API responses

### Account Protection
- Max 5 login attempts
- 15-minute lockout after failed attempts
- Auto-unlock after timeout

### Token Security
- Access token: 15 minutes expiry
- Refresh token: 7 days expiry, HttpOnly cookie
- Auto token refresh on client side
- Token blacklist on logout (optional implementation)

### API Security
- Rate limiting (100 req/15min per IP)
- CORS whitelist
- Input validation with Prisma
- SQL injection protection (Prisma ORM)
- XSS protection (no direct HTML rendering)

### Logging & Monitoring
- Winston logger with daily rotation
- Error logs: `backend/logs/error.log`
- Combined logs: `backend/logs/combined.log`
- Sensitive data masking (passwords, tokens)

## 🚀 Deployment

### Development
```bash
npm run dev
# Port: 5100
```

### Production (PM2)

**Install PM2:**
```bash
npm install -g pm2
```

**Start with ecosystem file:**
```bash
pm2 start ecosystem.config.js
```

**ecosystem.config.js:**
```javascript
module.exports = {
  apps: [{
    name: 'minichannel-backend',
    script: './server.js',
    instances: 2, // CPU cores
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 5100
    },
    error_file: './backend/logs/pm2-error.log',
    out_file: './backend/logs/pm2-out.log'
  }]
};
```

**PM2 Commands:**
```bash
pm2 start ecosystem.config.js
pm2 stop minichannel-backend
pm2 restart minichannel-backend
pm2 logs minichannel-backend
pm2 monit
pm2 save
pm2 startup # Auto-start on reboot
```

### Database (PostgreSQL)

**Docker:**
```bash
docker run --name minichannel-db \
  -e POSTGRES_PASSWORD=yourpassword \
  -e POSTGRES_DB=anekabuana \
  -p 3900:5432 \
  -d postgres:18
```

**Manual:**
```bash
# Install PostgreSQL 18
# Create database
createdb anekabuana

# Run migrations
npx prisma migrate deploy
```

### Backup Strategy

**Automated Backup:**
- Daily backup at 00:00 (if enabled)
- Retention: 7 days (auto-cleanup)
- Format: SQL dump + JSON export
- Location: `backend/backups/`

**Manual Backup:**
```bash
# Via API
curl -X POST http://localhost:5100/api/settings/backup/manual \
  -H "Authorization: Bearer <token>"

# Via Prisma
npx prisma db push --schema=./prisma/schema.prisma

# Via PostgreSQL
pg_dump -U postgres anekabuana > backup.sql
```

## 🐛 Troubleshooting

### Database Connection Failed
```bash
# Check PostgreSQL is running
psql -U postgres -h localhost -p 3900

# Test connection
npx prisma db pull

# Reset connection
npx prisma generate
```

### Port Already in Use
```bash
# Find process using port 5100
netstat -ano | findstr :5100

# Kill process (Windows)
taskkill /PID <PID> /F

# Or change PORT in .env
PORT=5200
```

### Migration Errors
```bash
# Reset database (dev only)
npx prisma migrate reset

# Force deploy (production)
npx prisma migrate deploy --skip-generate

# Resolve migration conflicts
npx prisma migrate resolve --applied "migration_name"
```

### Socket.io Connection Failed
- Check CORS settings match frontend URL
- Verify Socket.io versions compatible (4.7.2 ↔ 4.8.1)
- Check firewall blocking WebSocket (port 5100)
- Enable Socket.io debug: `DEBUG=socket.io* npm run dev`

### JWT Token Issues
```bash
# Check token expiry
jwt decode <token>

# Clear refresh token cookie
# Clear browser cookies for localhost:5100

# Regenerate secrets
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## 📁 Project Structure

```
backend/
├── server.js              # Express app entry point
├── ecosystem.config.js    # PM2 configuration
├── package.json           # Dependencies
├── prisma.config.ts       # Prisma config (optional)
│
├── lib/                   # Core utilities
│   ├── prisma.js         # Prisma client instance
│   ├── jwt.js            # JWT helpers (sign, verify)
│   └── socket.js         # Socket.io setup
│
├── middleware/            # Express middleware
│   └── auth.js           # Auth middleware (verify JWT, check roles)
│
├── routes/                # API route handlers
│   ├── auth.js           # Authentication endpoints
│   ├── products.js       # Product CRUD + search
│   ├── transactions.js   # Transaction + reports
│   ├── returns.js        # Return & refund
│   ├── cabang.js         # Branch management
│   ├── settings.js       # System settings + backup
│   ├── stock-transfers.js # Stock transfer
│   ├── orders.js         # Order management (future)
│   └── sync.js           # Desktop app sync
│
├── prisma/                # Database schema & migrations
│   ├── schema.prisma     # Prisma schema definition
│   ├── seed.js           # Seed users & branches
│   ├── seed-products.js  # Seed products & variants
│   ├── clear-transactions.js # Clear test data
│   └── migrations/       # Migration history
│       └── YYYYMMDD_*/
│
├── backend/               # Runtime files
│   ├── logs/             # Winston logs (gitignored)
│   │   ├── error.log
│   │   ├── combined.log
│   │   └── access.log
│   └── backups/          # Database backups (gitignored)
│
└── uploads/               # File uploads (future)
```

## 🔗 Related Repositories

- **Frontend Dashboard**: https://github.com/rejaldev/anekabuana
- **Main Project**: https://github.com/rejaldev/minichannel (private monorepo)

## 🤝 Contributing

This is a private project. For bug reports or feature requests:
- Open an issue: https://github.com/rejaldev/anekabuana-api/issues
- Submit a PR with detailed description

## 📝 License

© 2025 MiniChannel. All rights reserved.

---

**Built with ❤️ using Node.js 20 + Express 5 + Prisma ORM**
