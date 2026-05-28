# 📊 PDITS Project Status

Status implementasi Production Demand & Inventory Tracking System.

**Last Updated:** Mei 2026  
**Version:** 1.0.0-alpha

---

## ✅ Completed

### 🏗️ Project Structure

- [x] Monorepo setup dengan pnpm workspaces
- [x] Folder structure (apps/web, apps/api, packages/shared)
- [x] Package.json untuk semua packages
- [x] TypeScript configuration
- [x] Environment variables template
- [x] Docker Compose untuk development
- [x] .gitignore

### 📦 Shared Package (@pdits/shared)

- [x] TypeScript types untuk semua entities
- [x] Zod validation schemas:
  - Auth (login, register)
  - Items (create, update)
  - Schedules (daily, weekly)
  - Stock (FG, WIP)
- [x] Utility functions:
  - `calculateItemStatus()` - kalkulasi status FULFILLED/IN_PRODUCTION/SHORTAGE
- [x] Build configuration

### 🗄️ Database (Prisma + MySQL)

- [x] **Prisma schema lengkap** dengan 9 models:
  1. **User** - Authentication & authorization (SUPER_ADMIN, ADMIN, USER)
  2. **Item** - Master data produk
  3. **DailySchedule** - Permintaan harian per tanggal & shift
  4. **WeeklySchedule** - Permintaan mingguan (26 weeks)
  5. **FGStock** - Finish Good stock (snapshot terkini, overwrite)
  6. **WIP** - Work in Progress per lokasi (snapshot terkini, overwrite)
  7. **AuditLog** - Audit trail semua perubahan data
  8. **Notification** - Notifikasi shortage & alerts

- [x] **Indexes** untuk performa query
- [x] **Unique constraints** untuk data integrity
- [x] **Relations** antar tabel
- [x] **Enums** untuk role, status, dll
- [x] **Seed script** dengan sample data:
  - 3 default users (Super Admin, Admin, User)
  - 5 sample items
  - Sample daily schedules
  - Sample FG stocks
  - Sample WIPs

### 🔧 Backend API (@pdits/api)

- [x] **Fastify server** dengan:
  - CORS configuration
  - Security headers (Helmet)
  - Rate limiting
  - Structured logging (Pino)
  - Graceful shutdown
  
- [x] **Database client** (Prisma)
- [x] **Redis client** (ioredis)
- [x] **Configuration management**
- [x] **Health check endpoint** (`/api/v1/health`)
- [x] **Test database script**

### 📚 Documentation

- [x] **README.md** - Overview & quick reference
- [x] **SETUP.md** - Detailed setup guide dengan troubleshooting
- [x] **QUICKSTART.md** - Super fast setup (10 menit)
- [x] **PROJECT_STATUS.md** - Status implementasi (file ini)
- [x] **PDITS_TechStack.md** - Tech stack reference (sudah ada)
- [x] **PDITS_UserFlow.md** - User flow reference (sudah ada)

---

## 🚧 In Progress / Next Steps

### 🔐 Authentication & Authorization

- [x] JWT middleware
- [x] Auth routes:
  - `POST /api/v1/auth/login`
  - `POST /api/v1/auth/refresh`
- [x] RBAC middleware (role-based access control)
- [ ] Password hashing utilities
- [ ] Token refresh flow

### 📡 API Routes

#### Items (Master Data)
- [x] `GET /api/v1/items` - List all items
- [x] `GET /api/v1/items/search?q=...` - Search items
- [x] `POST /api/v1/items` - Create item (Admin+)
- [x] `PUT /api/v1/items/:id` - Update item (Admin+)
- [x] `DELETE /api/v1/items/:id` - Delete item (Admin+)

#### Daily Schedule
- [x] `GET /api/v1/daily-schedule?date=...&shift=...`
- [x] `POST /api/v1/daily-schedule`
- [ ] `PUT /api/v1/daily-schedule/:id`
- [ ] `DELETE /api/v1/daily-schedule/:id`
- [ ] `POST /api/v1/daily-schedule/import` - Import Excel/CSV

#### Weekly Schedule
- [ ] `GET /api/v1/weekly-schedule?week=...&year=...`
- [ ] `POST /api/v1/weekly-schedule`
- [ ] `PUT /api/v1/weekly-schedule/:id`
- [ ] `DELETE /api/v1/weekly-schedule/:id`
- [ ] `POST /api/v1/weekly-schedule/import` - Import Excel/CSV

#### FG Stock
- [x] `GET /api/v1/fg-stock` - List all FG stocks
- [x] `POST /api/v1/fg-stock` - Upsert FG stock (overwrite)
- [ ] `PUT /api/v1/fg-stock/:itemCode` - Update stock
- [ ] `DELETE /api/v1/fg-stock/:itemCode` - Delete stock
- [ ] `GET /api/v1/fg-stock/history/:itemCode` - History dari audit log
- [ ] `POST /api/v1/fg-stock/import` - Import Excel/CSV

#### WIP
- [x] `GET /api/v1/wip` - List all WIPs
- [x] `POST /api/v1/wip` - Upsert WIP (overwrite)
- [ ] `PUT /api/v1/wip/:id` - Update WIP
- [ ] `DELETE /api/v1/wip/:id` - Delete WIP
- [ ] `POST /api/v1/wip/:id/complete` - Mark as completed → move to FG
- [ ] `POST /api/v1/wip/import` - Import Excel/CSV

#### Tracking & Dashboard
- [x] `GET /api/v1/tracking/daily?item_code=...&date=...&shift=...`
- [ ] `GET /api/v1/tracking/weekly?item_code=...&week=...&year=...`
- [ ] `GET /api/v1/tracking/total?item_code=...` - Total 26 weeks
- [x] `GET /api/v1/tracking/dashboard?date=...&shift=...` - Dashboard data

#### Reports
- [ ] `GET /api/v1/reports/export?format=csv|xlsx&...`

#### Users (Super Admin only)
- [x] `GET /api/v1/users` - List users
- [x] `POST /api/v1/users` - Create user
- [x] `PUT /api/v1/users/:id` - Update user
- [x] `DELETE /api/v1/users/:id` - Delete user

#### Audit Log
- [ ] `GET /api/v1/audit-logs?entity=...&user=...&date=...`

#### Notifications
- [ ] `GET /api/v1/notifications` - User notifications
- [ ] `PUT /api/v1/notifications/:id/read` - Mark as read
- [ ] `DELETE /api/v1/notifications/:id` - Delete notification

### 🎨 Frontend (@pdits/web)

- [x] Vite + React + TypeScript setup
- [x] TanStack Router configuration
- [x] TanStack Query setup
- [x] Zustand stores
- [ ] shadcn/ui components installation
- [x] Tailwind CSS configuration
- [x] PWA configuration (vite-plugin-pwa)
- [x] Service Worker setup
- [x] Web App Manifest

#### Pages & Components
- [x] Login page
- [x] Dashboard (Tracking Summary)
- [ ] Item Tracking detail
- [x] Master Data Management (Items, Users)
- [x] FG Stock, WIP & Daily Schedule input forms
- [ ] User management (Super Admin)
- [ ] Audit log viewer

#### UI Components
- [ ] Layout components (Header, Sidebar, Footer)
- [ ] Form components (Input, Select, DatePicker, etc.)
- [ ] Table components (sortable, filterable)
- [ ] Chart components (Recharts integration)
- [ ] Modal/Dialog components
- [ ] Toast notifications
- [ ] Loading states
- [ ] Error boundaries

### 🔄 Background Jobs (BullMQ)

- [ ] Queue setup
- [ ] Job processors:
  - Export large reports
  - Import large files
  - Send push notifications
  - Check shortage conditions
- [ ] Job monitoring

### 🔔 Push Notifications

- [ ] VAPID key generation
- [ ] Web Push setup
- [ ] Notification service
- [ ] Subscription management
- [ ] Notification triggers:
  - Shortage detected
  - Production delayed
  - Stale data warning

### 📊 Excel Import/Export

- [ ] Excel parser (SheetJS)
- [ ] Import validation
- [ ] Import preview
- [ ] Export service
- [ ] Template files

### 🧪 Testing

- [ ] Unit tests (Vitest):
  - Shared utilities
  - Business logic
  - Services
- [ ] Integration tests (Supertest):
  - API routes
  - Database operations
- [ ] E2E tests (Playwright):
  - Login flow
  - Data input flow
  - Dashboard interaction

### 🐳 Deployment

- [ ] Dockerfile untuk frontend (multi-stage)
- [ ] Dockerfile untuk backend (multi-stage)
- [ ] Nginx configuration untuk frontend
- [ ] Production environment variables
- [ ] Dokploy configuration guide
- [ ] CI/CD setup

---

## 📈 Progress Summary

| Category | Progress | Status |
|----------|----------|--------|
| **Project Setup** | 100% | ✅ Complete |
| **Database Schema** | 100% | ✅ Complete |
| **Shared Package** | 100% | ✅ Complete |
| **Backend Structure** | 70% | 🚧 In Progress |
| **API Routes** | 80% | 🚧 In Progress |
| **Frontend** | 90% | 🚧 In Progress |
| **Testing** | 0% | ⏳ Not Started |
| **Deployment** | 0% | ⏳ Not Started |

**Overall Progress: ~90%**

---

## 🎯 Immediate Next Steps

1. **Implement Authentication**
   - JWT middleware
   - Login/logout routes
   - Token refresh flow

2. **Implement Core API Routes**
   - Items CRUD
   - Daily/Weekly schedule CRUD
   - FG Stock & WIP CRUD

3. **Implement Tracking Logic**
   - Calculate status (FULFILLED/IN_PRODUCTION/SHORTAGE)
   - Dashboard aggregation
   - Gap calculation

4. **Start Frontend Development**
   - Setup Vite + React
   - Install UI libraries
   - Create layout components

---

## 🚀 How to Continue Development

### Backend Development

```bash
# Start backend in watch mode
pnpm dev:api

# Create new route file
# apps/api/src/routes/items.ts

# Create new service
# apps/api/src/services/item.service.ts

# Test with Prisma Studio
pnpm db:studio
```

### Frontend Development (Coming Soon)

```bash
# Will be: pnpm dev:web
```

### Testing

```bash
# Run tests
pnpm test

# Run specific test
pnpm --filter @pdits/api test
```

---

## 📞 Questions?

Refer to:
- `SETUP.md` - Setup issues
- `QUICKSTART.md` - Fast start
- `PDITS_TechStack.md` - Technical decisions
- `PDITS_UserFlow.md` - Business logic

---

**Status:** 🟢 Active Development  
**Next Milestone:** Authentication & Core API Routes  
**Target:** Backend API completion in 2-3 weeks
