# 🔧 MiniChannel - Backend API

REST API untuk Point of Sale system dengan real-time synchronization, advanced search, dan comprehensive inventory management.

[![Node.js](https://img.shields.io/badge/Node.js-20_LTS-339933?logo=node.js)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5.1.0-000000?logo=express)](https://expressjs.com/)
[![Prisma](https://img.shields.io/badge/Prisma-6.19.0-2D3748?logo=prisma)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18-4169e1?logo=postgresql)](https://postgresql.org/)
[![Socket.io](https://img.shields.io/badge/Socket.io-4.8.1-010101?logo=socket.io)](https://socket.io/)

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env with your database credentials

# Generate Prisma client & run migrations
npx prisma generate
npx prisma migrate dev

# Seed initial data (optional)
npm run seed

# Start development server
npm run dev
```

**API URL:** [http://localhost:5100](http://localhost:5100)  
**Socket.io:** [ws://localhost:5100](ws://localhost:5100)

## 🛠 Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| **Node.js** | 20 LTS | Runtime environment |
| **Express.js** | 5.1.0 | Web framework & routing |
| **Prisma ORM** | 6.19.0 | Database ORM & migrations |
| **PostgreSQL** | 18 | Primary database (default port: 3900) |
| **Socket.io** | 4.8.1 | Real-time WebSocket communication |
| **JWT** | 9.0.2 | Token-based authentication |
| **bcryptjs** | 2.4.3 | Password hashing |
| **Winston** | 3.17.1 | Structured logging |
| **node-cron** | 3.0.3 | Scheduled tasks (backup automation) |
| **PM2** | Latest | Process manager (production) |

## 📁 Project Structure

```
backend/
├── routes/
│   ├── auth.js              # Authentication & user management
│   ├── products.js          # Product CRUD & smart search
│   ├── cabang.js            # Branch management
│   ├── stock.js             # Stock adjustments & alerts
│   ├── transactions.js      # POS transactions
│   ├── returns.js           # Return & refund
│   ├── settings.js          # System configuration
│   ├── backup.js            # Backup & export
│   └── sync.js              # Real-time sync endpoints
├── middleware/
│   └── auth.js              # JWT authentication middleware
├── lib/
│   ├── socket.js            # Socket.io server setup
│   ├── jwt.js               # Token generation & validation
│   ├── prisma.js            # Prisma client instance
│   └── backup-scheduler.js  # Cron jobs for auto-backup
├── prisma/
│   ├── schema.prisma        # Database schema
│   ├── migrations/          # Migration history
│   └── seed.js              # Seed data script
├── uploads/                 # File uploads directory
├── backups/                 # Database backups directory
├── logs/                    # Winston log files
├── server.js                # Express app entry point
└── ecosystem.config.js      # PM2 configuration
```

## 📡 API Endpoints

### 🔐 Authentication (`/api/auth`)

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "kasir1",
  "password": "password123"
}

Response 200:
{
  "user": {
    "id": "uuid",
    "username": "kasir1",
    "name": "Kasir Satu",
    "role": "KASIR",
    "cabangId": "uuid",
    "status": "active"
  },
  "token": "eyJhbGc...",  // Access token (expires in 15min)
  "refreshToken": "eyJhbGc..."  // Refresh token (7 days)
}
```

#### Refresh Token
```http
POST /api/auth/refresh
Cookie: refreshToken=eyJhbGc...

Response 200:
{
  "token": "eyJhbGc..."  // New access token
}
```

#### Get All Users (OWNER only)
```http
GET /api/auth/users
Authorization: Bearer <token>

Response 200:
[
  {
    "id": "uuid",
    "username": "kasir1",
    "name": "Kasir Satu",
    "role": "KASIR",
    "cabangId": "uuid",
    "cabang": { "name": "Cabang Utama" },
    "status": "active",
    "createdAt": "2024-01-01T00:00:00Z"
  }
]
```

#### Create User (OWNER only)
```http
POST /api/auth/register
Authorization: Bearer <token>
Content-Type: application/json

{
  "username": "kasir2",
  "password": "password123",
  "name": "Kasir Dua",
  "role": "KASIR",
  "cabangId": "uuid"
}
```

#### Update User (OWNER only)
```http
PUT /api/auth/users/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Kasir Dua Updated",
  "role": "ADMIN",
  "cabangId": "uuid",
  "status": "active"
}
```

#### Delete User (OWNER only)
```http
DELETE /api/auth/users/:id
Authorization: Bearer <token>
```

---

### 📦 Products (`/api/products`)

#### Get Products with Advanced Search
```http
GET /api/products?search=Baju SD 7&categoryId=uuid&cabangId=uuid
Authorization: Bearer <token>

Query Parameters:
- search: Smart search query (optional)
- categoryId: Filter by category (optional)
- cabangId: Filter by branch stock availability (optional)
- isActive: Filter by active status (default: all)

Response 200:
[
  {
    "id": "uuid",
    "name": "Baju Sekolah",
    "description": "Baju sekolah berkualitas",
    "category": { "id": "uuid", "name": "Seragam" },
    "productType": "VARIANT",
    "isActive": true,
    "variants": [
      {
        "id": "uuid",
        "sku": "BJS-SD-7",
        "variantName": "Ukuran",
        "variantValue": "SD 7",
        "stocks": [
          {
            "id": "uuid",
            "quantity": 15,
            "price": 50000,
            "cabang": { "id": "uuid", "name": "Cabang Utama" }
          }
        ]
      }
    ]
  }
]
```

**Search Algorithm (7-Phase Filtering):**

1. **Multi-keyword Parsing**
   - Split query: "Baju SD 7" → ["Baju", "SD", "7"]
   - Detect text keywords: ["Baju", "SD"]
   - Detect number keywords: ["7"]

2. **Word Boundary Matching**
   - Use regex `\b7\b` untuk exact number match
   - Avoid false positives (e.g., "7" won't match "17" or "27")

3. **Variant-Level Filtering**
   - Filter variants yang match dengan number keywords
   - Number keyword harus exact match di variant value

4. **Pre-Product Keyword Validation**
   - Product name harus contain semua text keywords
   - Skip product jika tidak match

5. **Relevance Scoring**
   - Exact match di nama: +100 points
   - Starts with di nama: +50 points
   - Contains di nama: +30 points
   - Exact match di variant: +80 points
   - Starts with di variant: +40 points
   - Contains di variant: +20 points

6. **Dynamic Threshold Filtering**
   - Ambil top score dari semua products
   - Filter products dengan score >= 20-40% dari top score
   - Adaptive threshold based on data distribution

7. **Sort by Relevance**
   - Sort descending by total score
   - Return ranked results

**Example Searches:**
```bash
# Exact variant match
GET /api/products?search=Baju SD 7
→ Returns: "Baju Sekolah - SD 7" (match)
→ Skips: "Baju Pramuka - Panjang 7" (wrong context)

# Multi-keyword
GET /api/products?search=Kaos Merah XL
→ Returns: Products dengan "Kaos" AND "Merah" AND variant "XL"

# Number only
GET /api/products?search=7
→ Returns: All products dengan variant containing "7"
```

#### Get Product by ID
```http
GET /api/products/:id
Authorization: Bearer <token>

Response 200:
{
  "id": "uuid",
  "name": "Baju Sekolah",
  "variants": [...],
  // Full product details
}
```

#### Get Product by SKU/Barcode
```http
GET /api/products/barcode/:sku
Authorization: Bearer <token>

Response 200:
{
  "product": { ... },
  "variant": { ... },
  "stock": { ... }
}
```

#### Create Product
```http
POST /api/products
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Baju Sekolah",
  "description": "Baju sekolah berkualitas",
  "categoryId": "uuid",
  "productType": "VARIANT",
  "variants": [
    {
      "sku": "BJS-SD-7",
      "variantName": "Ukuran",
      "variantValue": "SD 7",
      "stocks": [
        {
          "cabangId": "uuid",
          "quantity": 15,
          "price": 50000
        }
      ]
    }
  ]
}
```

#### Update Product
```http
PUT /api/products/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Baju Sekolah Updated",
  "isActive": true,
  "variants": [...]  // Full variants array
}
```

#### Delete Product
```http
DELETE /api/products/:id
Authorization: Bearer <token>
```

---

### 📊 Stock Management (`/api/stock`)

#### Create Stock Adjustment
```http
POST /api/stock/adjustment
Authorization: Bearer <token>
Content-Type: application/json

{
  "variantId": "uuid",
  "cabangId": "uuid",
  "previousQty": 10,
  "newQty": 15,
  "difference": 5,
  "reason": "Stok opname",
  "notes": "Koreksi stok fisik"
}

Response 201:
{
  "id": "uuid",
  "variantId": "uuid",
  "cabangId": "uuid",
  "previousQty": 10,
  "newQty": 15,
  "difference": 5,
  "reason": "Stok opname",
  "notes": "Koreksi stok fisik",
  "adjustedById": "uuid",
  "createdAt": "2024-01-01T00:00:00Z"
}
```

#### Get Adjustment History
```http
GET /api/stock/adjustments?variantId=uuid&cabangId=uuid&startDate=2024-01-01&endDate=2024-12-31&reason=Stok opname
Authorization: Bearer <token>

Query Parameters:
- variantId: Filter by variant (optional)
- cabangId: Filter by cabang (optional)
- startDate: Filter by start date (optional)
- endDate: Filter by end date (optional)
- reason: Filter by adjustment reason (optional)
- limit: Limit results (default: 100)

Response 200:
[
  {
    "id": "uuid",
    "variantId": "uuid",
    "cabangId": "uuid",
    "previousQty": 10,
    "newQty": 15,
    "difference": 5,
    "reason": "Stok opname",
    "notes": "Koreksi stok fisik",
    "adjustedBy": { "id": "uuid", "name": "Manager Satu" },
    "cabang": { "id": "uuid", "name": "Cabang Utama" },
    "createdAt": "2024-01-01T00:00:00Z"
  }
]
```

#### Get Adjustment History per Variant/Cabang
```http
GET /api/stock/adjustment/:variantId/:cabangId/history?limit=20
Authorization: Bearer <token>

Note: Pass cabangId='all' to get history for all cabangs

Response 200:
{
  "data": [
    {
      "id": "uuid",
      "previousQty": 10,
      "newQty": 15,
      "difference": 5,
      "reason": "Stok opname",
      "adjustedBy": { "name": "Manager" },
      "cabang": { "name": "Cabang Utama" },  // Included when cabangId='all'
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

#### Set Stock Alert
```http
POST /api/stock/alert
Authorization: Bearer <token>
Content-Type: application/json

{
  "variantId": "uuid",
  "cabangId": "uuid",
  "minStock": 5
}

Response 201:
{
  "productVariantId": "uuid",
  "cabangId": "uuid",
  "minStock": 5,
  "isActive": true
}
```

#### Get Alert for Specific Variant/Cabang
```http
GET /api/stock/alert/:variantId/:cabangId
Authorization: Bearer <token>

Response 200:
{
  "productVariantId": "uuid",
  "cabangId": "uuid",
  "minStock": 5,
  "isActive": true
}
```

#### Get All Active Alerts
```http
GET /api/stock/alerts
Authorization: Bearer <token>

Response 200:
[
  {
    "productVariantId": "uuid",
    "cabangId": "uuid",
    "minStock": 5,
    "isActive": true,
    "variant": {
      "variantValue": "SD 7",
      "product": { "name": "Baju Sekolah" }
    },
    "cabang": { "name": "Cabang Utama" }
  }
]
```

#### Get Low Stock Items
```http
GET /api/stock/alerts/low
Authorization: Bearer <token>

Response 200:
[
  {
    "variantId": "uuid",
    "cabangId": "uuid",
    "currentStock": 3,
    "minStock": 5,
    "productName": "Baju Sekolah",
    "variantValue": "SD 7",
    "cabangName": "Cabang Utama"
  }
]
```

#### Delete/Deactivate Alert
```http
DELETE /api/stock/alert/:variantId/:cabangId
Authorization: Bearer <token>

Response 200:
{
  "message": "Alert deactivated successfully"
}
```

---

### 💰 Transactions (`/api/transactions`)

#### Create Transaction
```http
POST /api/transactions
Authorization: Bearer <token>
Content-Type: application/json

{
  "cabangId": "uuid",
  "items": [
    {
      "productVariantId": "uuid",
      "quantity": 2,
      "price": 50000,
      "subtotal": 100000
    }
  ],
  "subtotal": 100000,
  "discount": 0,
  "total": 100000,
  "paymentMethod": "CASH",
  "amountPaid": 150000,
  "change": 50000
}

Response 201:
{
  "id": "uuid",
  "transactionNumber": "TRX-20240101-001",
  "total": 100000,
  "paymentMethod": "CASH",
  "status": "COMPLETED",
  "createdAt": "2024-01-01T10:30:00Z"
}
```

#### Get Transactions
```http
GET /api/transactions?startDate=2024-01-01&endDate=2024-12-31&paymentMethod=CASH&kasirId=uuid
Authorization: Bearer <token>

Query Parameters:
- startDate: Filter by start date (optional)
- endDate: Filter by end date (optional)
- paymentMethod: Filter by payment method (optional)
- kasirId: Filter by kasir (optional)
- cabangId: Filter by cabang (optional)
- status: Filter by status (optional)

Response 200:
[
  {
    "id": "uuid",
    "transactionNumber": "TRX-20240101-001",
    "total": 100000,
    "paymentMethod": "CASH",
    "status": "COMPLETED",
    "kasir": { "name": "Kasir Satu" },
    "cabang": { "name": "Cabang Utama" },
    "createdAt": "2024-01-01T10:30:00Z"
  }
]
```

---

### 🏢 Branch Management (`/api/cabang`)

#### Get All Branches
```http
GET /api/cabang
Authorization: Bearer <token>

Response 200:
[
  {
    "id": "uuid",
    "name": "Cabang Utama",
    "address": "Jl. Example No. 123",
    "phone": "081234567890",
    "isActive": true
  }
]
```

#### Create Branch (OWNER only)
```http
POST /api/cabang
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Cabang Baru",
  "address": "Jl. New Street",
  "phone": "081234567890"
}
```

#### Update Branch (OWNER only)
```http
PUT /api/cabang/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Cabang Updated",
  "isActive": false
}
```

---

### ⚙️ System Settings (`/api/settings`)

#### Get Settings
```http
GET /api/settings
Authorization: Bearer <token>

Response 200:
{
  "id": "uuid",
  "storeName": "Toko ABC",
  "storeAddress": "Jl. Example",
  "storePhone": "081234567890",
  "printerPaperSize": "80mm",
  "receiptHeader": "Welcome to Our Store",
  "receiptFooter": "Thank you!",
  "autoBackupEnabled": true,
  "backupSchedule": "0 0 * * *",
  "backupRetentionDays": 7
}
```

#### Update Settings (MANAGER, OWNER)
```http
PUT /api/settings
Authorization: Bearer <token>
Content-Type: application/json

{
  "storeName": "Toko Updated",
  "autoBackupEnabled": true,
  "backupRetentionDays": 7
}
```

---

### 💾 Backup & Export (`/api/backup`)

#### Manual Backup
```http
POST /api/backup/manual
Authorization: Bearer <token>

Response 200:
{
  "message": "Backup created successfully",
  "filename": "backup-2024-01-01T10-00-00-000Z.json",
  "size": 1024000,
  "path": "/backups/backup-2024-01-01T10-00-00-000Z.json"
}
```

#### List Backups
```http
GET /api/backup/list
Authorization: Bearer <token>

Response 200:
[
  {
    "filename": "backup-2024-01-01T10-00-00-000Z.json",
    "size": 1024000,
    "createdAt": "2024-01-01T10:00:00Z",
    "downloadUrl": "/api/backup/download/backup-2024-01-01T10-00-00-000Z.json"
  }
]
```

#### Export Transactions CSV
```http
POST /api/backup/export/transactions
Authorization: Bearer <token>
Content-Type: application/json

{
  "startDate": "2024-01-01",
  "endDate": "2024-12-31"
}

Response 200:
{
  "filename": "transactions-2024-01-01-to-2024-12-31.csv",
  "downloadUrl": "/api/backup/download/transactions-2024-01-01-to-2024-12-31.csv"
}
```

#### Export Products CSV
```http
POST /api/backup/export/products
Authorization: Bearer <token>

Response 200:
{
  "filename": "products-2024-01-01.csv",
  "downloadUrl": "/api/backup/download/products-2024-01-01.csv"
}
```

---

## 🔌 WebSocket Events (Socket.io)

### Connection
```javascript
const socket = io('http://localhost:5100');

socket.on('connect', () => {
  console.log('Connected to server');
});
```

### Server → Client Events

#### Stock Updated
```javascript
socket.on('stock-updated', (data) => {
  console.log('Stock updated:', data);
  // { variantId, cabangId, newQuantity, updatedBy }
});
```

#### Product Updated
```javascript
socket.on('product-updated', (data) => {
  console.log('Product updated:', data);
  // { productId, action: 'create' | 'update' | 'delete' }
});
```

#### Transaction Created
```javascript
socket.on('transaction-created', (data) => {
  console.log('New transaction:', data);
  // { transactionId, cabangId, total, kasirId }
});
```

### Client → Server Events

#### Request Refresh
```javascript
socket.emit('refresh-data', { type: 'products' });
socket.emit('refresh-data', { type: 'stock' });
```

---

## 🗄 Database Schema

### Key Models

**User**
- id, username, password (hashed), name, role, cabangId, status, createdAt

**Product**
- id, name, description, categoryId, productType, isActive, createdAt

**ProductVariant**
- id, productId, sku, variantName, variantValue

**Stock**
- id, productVariantId, cabangId, quantity, price

**StockAdjustment**
- id, productVariantId, cabangId, previousQty, newQty, difference, reason, notes, adjustedById, createdAt

**StockAlert**
- productVariantId, cabangId, minStock, isActive

**Transaction**
- id, transactionNumber, cabangId, kasirId, subtotal, discount, total, paymentMethod, amountPaid, change, status, createdAt

**TransactionItem**
- id, transactionId, productVariantId, quantity, price, subtotal

**Cabang**
- id, name, address, phone, isActive

**Category**
- id, name

---

## 🔒 Authentication & Authorization

### JWT Authentication
- **Access Token**: 15 minutes expiry
- **Refresh Token**: 7 days expiry (HttpOnly cookie)
- **Token Refresh**: Auto-refresh with refresh token

### Middleware
```javascript
// Protect route
router.get('/protected', authMiddleware, (req, res) => {
  // req.userId available
  // req.userRole available
});

// Role-based access
router.delete('/admin-only', authMiddleware, (req, res) => {
  if (req.userRole !== 'OWNER') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  // Admin logic
});
```

### Password Hashing
- bcryptjs with salt rounds: 10
- Passwords never stored in plain text

---

## 🚀 Deployment

### Development
```bash
npm run dev
```

### Production with PM2
```bash
# Start with PM2
pm2 start ecosystem.config.js

# Monitor
pm2 monit

# View logs
pm2 logs

# Restart
pm2 restart all

# Stop
pm2 stop all
```

### Environment Variables (.env)

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:3900/minichannel

# JWT Secrets (min 32 characters)
JWT_SECRET=your-super-secret-key-min-32-characters-long
JWT_REFRESH_SECRET=your-refresh-secret-key-min-32-characters-long

# Server
PORT=5100
NODE_ENV=production

# CORS
CORS_ORIGIN=http://localhost:3100

# Backup
BACKUP_RETENTION_DAYS=7
AUTO_BACKUP_SCHEDULE=0 0 * * *  # Daily at 00:00
```

---

## 🧪 Testing

```bash
# Run tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

---

## 📝 Logging

Winston logger dengan multiple transports:

**Log Levels:**
- `error`: Error events
- `warn`: Warning messages
- `info`: Informational messages
- `debug`: Debug information (dev only)

**Log Files:**
- `logs/error.log`: Error logs only
- `logs/combined.log`: All logs

**Console Output:**
- Colorized in development
- JSON format in production

---

## 🔧 Maintenance

### Database Migrations
```bash
# Create migration
npx prisma migrate dev --name add_new_field

# Apply migrations (production)
npx prisma migrate deploy

# Reset database (CAUTION: deletes all data)
npx prisma migrate reset
```

### Backup Management
```bash
# Manual backup via API
curl -X POST http://localhost:5100/api/backup/manual \
  -H "Authorization: Bearer <token>"

# List backups
curl http://localhost:5100/api/backup/list \
  -H "Authorization: Bearer <token>"
```

### Cron Jobs
- **Auto Backup**: Daily at 00:00 (configurable)
- **Cleanup Old Backups**: Retention policy (default: 7 days)

---

## 🤝 Contributing

1. Fork repository
2. Create feature branch
3. Make changes with tests
4. Submit pull request

---

## 📄 License

MIT License

---

**Built with ❤️ using Node.js & Express.js**
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
