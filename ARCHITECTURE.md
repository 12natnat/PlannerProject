# 🏛️ PDITS Architecture

Visual architecture dan data flow untuk Production Demand & Inventory Tracking System.

---

## 🗺️ System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER DEVICES                            │
│  Desktop Browser │ Tablet │ Mobile (PWA Installed)             │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTPS
                         │
┌────────────────────────▼────────────────────────────────────────┐
│                    FRONTEND (React PWA)                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  React 18 + TypeScript + Vite                            │  │
│  │  • TanStack Router (Type-safe routing)                   │  │
│  │  • TanStack Query (Data fetching & caching)              │  │
│  │  • Zustand (Global state)                                │  │
│  │  • shadcn/ui + Tailwind CSS (UI)                         │  │
│  │  • Recharts (Data visualization)                         │  │
│  │  • Service Worker (Offline support)                      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                         │                                        │
│                         │ REST API (JSON)                        │
│                         │ /api/v1/*                              │
└─────────────────────────┼────────────────────────────────────────┘
                          │
┌─────────────────────────▼────────────────────────────────────────┐
│                    BACKEND API (Fastify)                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Node.js 20 + TypeScript + Fastify 4                     │  │
│  │                                                           │  │
│  │  Middleware Layer:                                        │  │
│  │  • CORS                                                   │  │
│  │  • Helmet (Security headers)                             │  │
│  │  • Rate Limiting                                          │  │
│  │  • JWT Authentication                                     │  │
│  │  • RBAC Authorization                                     │  │
│  │                                                           │  │
│  │  Route Handlers:                                          │  │
│  │  • /auth (Login, Logout, Refresh)                        │  │
│  │  • /items (Master data)                                   │  │
│  │  • /daily-schedule (Permintaan harian)                   │  │
│  │  • /weekly-schedule (Permintaan mingguan)                │  │
│  │  • /fg-stock (Finish Good)                               │  │
│  │  • /wip (Work in Progress)                               │  │
│  │  • /tracking (Dashboard & analytics)                     │  │
│  │  • /reports (Export)                                      │  │
│  │  • /users (User management)                              │  │
│  │  • /audit-logs (Audit trail)                             │  │
│  │                                                           │  │
│  │  Services Layer:                                          │  │
│  │  • Business logic                                         │  │
│  │  • Data validation (Zod)                                  │  │
│  │  • Status calculation                                     │  │
│  │  • Audit logging                                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│           │                    │                    │            │
│           │                    │                    │            │
│      ┌────▼────┐         ┌────▼────┐         ┌────▼────┐       │
│      │ Prisma  │         │  Redis  │         │ BullMQ  │       │
│      │   ORM   │         │  Cache  │         │  Jobs   │       │
│      └────┬────┘         └────┬────┘         └────┬────┘       │
└───────────┼───────────────────┼───────────────────┼─────────────┘
            │                   │                   │
            │                   │                   │
┌───────────▼───────────────────▼───────────────────▼─────────────┐
│                    DATA LAYER                                    │
│  ┌──────────────────┐    ┌──────────────────┐                  │
│  │   MySQL 8.0      │    │    Redis 7       │                  │
│  │                  │    │                  │                  │
│  │  • users         │    │  • Cache:        │                  │
│  │  • items         │    │    - FG stocks   │                  │
│  │  • daily_sched   │    │    - WIP data    │                  │
│  │  • weekly_sched  │    │    - Tracking    │                  │
│  │  • fg_stocks     │    │                  │                  │
│  │  • wips          │    │  • Sessions:     │                  │
│  │  • audit_logs    │    │    - Refresh     │                  │
│  │  • notifications │    │      tokens      │                  │
│  │                  │    │                  │                  │
│  │  Persistent      │    │  • Job Queue:    │                  │
│  │  Storage         │    │    - BullMQ      │                  │
│  └──────────────────┘    └──────────────────┘                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 📊 Data Flow Diagrams

### 1. Authentication Flow

```
┌──────────┐                                              ┌──────────┐
│  Client  │                                              │  Server  │
└────┬─────┘                                              └────┬─────┘
     │                                                         │
     │  POST /api/v1/auth/login                               │
     │  { email, password }                                   │
     ├────────────────────────────────────────────────────────>│
     │                                                         │
     │                                    Validate credentials │
     │                                    Hash password check  │
     │                                    Generate JWT tokens  │
     │                                                         │
     │  200 OK                                                 │
     │  { accessToken, refreshToken }                          │
     │<────────────────────────────────────────────────────────┤
     │                                                         │
     │  Store accessToken in memory                            │
     │  Store refreshToken in HttpOnly cookie                  │
     │                                                         │
     │  Subsequent requests:                                   │
     │  Authorization: Bearer <accessToken>                    │
     ├────────────────────────────────────────────────────────>│
     │                                                         │
     │                                    Verify JWT           │
     │                                    Check role (RBAC)    │
     │                                    Process request      │
     │                                                         │
     │  200 OK { data }                                        │
     │<────────────────────────────────────────────────────────┤
     │                                                         │
```

### 2. Item Tracking Flow

```
User Search Item "PROD-A001"
         │
         ▼
┌────────────────────────────────────────────────────────┐
│  Frontend: TanStack Query                              │
│  • Check cache first                                   │
│  • If miss: fetch from API                             │
└────────┬───────────────────────────────────────────────┘
         │
         │ GET /api/v1/tracking/daily?item_code=PROD-A001&date=2026-05-12
         │
         ▼
┌────────────────────────────────────────────────────────┐
│  Backend: Tracking Route Handler                       │
│  1. Authenticate user (JWT)                            │
│  2. Check Redis cache                                  │
│     key: "tracking:daily:PROD-A001:2026-05-12"        │
└────────┬───────────────────────────────────────────────┘
         │
    ┌────┴────┐
    │ Cache?  │
    └────┬────┘
         │
    ┌────┴────────────────────────────────────┐
    │ HIT                          MISS       │
    ▼                                         ▼
Return cached data              Query Database (Prisma):
                                • Get demand from daily_schedules
                                • Get FG stock from fg_stocks
                                • Get WIP from wips (all locations)
                                         │
                                         ▼
                                Calculate Status:
                                • totalSupply = fgStock + wipTotal
                                • gap = totalSupply - demand
                                • status = calculateItemStatus()
                                         │
                                         ▼
                                Store in Redis cache (TTL: 2 min)
                                         │
                                         ▼
                                Return JSON response
         │                               │
         └───────────────┬───────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────┐
│  Frontend: Render UI                                   │
│  • Update Zustand store                                │
│  • Render status badge (FULFILLED/IN_PRODUCTION/       │
│    SHORTAGE)                                           │
│  • Render Recharts visualization                       │
│  • Render WIP details table                            │
└────────────────────────────────────────────────────────┘
```

### 3. FG Stock Update Flow (Overwrite Behavior)

```
Admin Input FG Stock Update
         │
         ▼
┌────────────────────────────────────────────────────────┐
│  Frontend: Form Submission                             │
│  POST /api/v1/fg-stock                                 │
│  {                                                     │
│    itemCode: "PROD-A001",                             │
│    quantity: 150,                                      │
│    date: "2026-05-12",                                │
│    shift: 1                                            │
│  }                                                     │
└────────┬───────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────┐
│  Backend: FG Stock Route Handler                       │
│  1. Authenticate & authorize (Admin+ only)             │
│  2. Validate input (Zod schema)                        │
│  3. Get item by itemCode                               │
└────────┬───────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────┐
│  Check if FG stock exists for this item                │
└────────┬───────────────────────────────────────────────┘
         │
    ┌────┴────┐
    │ Exists? │
    └────┬────┘
         │
    ┌────┴────────────────────────────────────┐
    │ YES                          NO         │
    ▼                                         ▼
Get existing record              Create new record
dataBefore = existing.quantity   dataBefore = null
         │                                    │
         └────────────┬───────────────────────┘
                      │
                      ▼
┌────────────────────────────────────────────────────────┐
│  Prisma Upsert Operation                               │
│  await prisma.fGStock.upsert({                         │
│    where: { itemId: item.id },                         │
│    update: { quantity, date, shift, updatedBy },       │
│    create: { itemId, quantity, date, shift, updatedBy }│
│  })                                                    │
└────────┬───────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────┐
│  Create Audit Log                                      │
│  {                                                     │
│    userId: currentUser.id,                            │
│    action: "UPDATE" or "CREATE",                      │
│    entityType: "FGStock",                             │
│    entityId: fgStock.id,                              │
│    dataBefore: { quantity: 100 },                     │
│    dataAfter: { quantity: 150 }                       │
│  }                                                     │
└────────┬───────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────┐
│  Invalidate Redis Cache                                │
│  • Delete key: "fg-stock:PROD-A001"                   │
│  • Delete key: "tracking:*:PROD-A001:*"               │
└────────┬───────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────┐
│  Return Success Response                               │
│  {                                                     │
│    success: true,                                      │
│    data: updatedFGStock,                              │
│    message: "Stok berhasil diperbarui"                │
│  }                                                     │
└────────┬───────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────┐
│  Frontend: Update UI                                   │
│  • Show success toast                                  │
│  • Invalidate TanStack Query cache                     │
│  • Refetch tracking data                               │
│  • Update dashboard                                    │
└────────────────────────────────────────────────────────┘
```

---

## 🗄️ Database Schema Diagram

```
┌─────────────────────┐
│       users         │
├─────────────────────┤
│ id (PK)             │
│ email (UNIQUE)      │
│ password            │
│ name                │
│ role (ENUM)         │◄──────────┐
│ isActive            │           │
│ createdAt           │           │
│ updatedAt           │           │
└─────────────────────┘           │
         │                        │
         │ updatedBy              │ userId
         │                        │
         ▼                        │
┌─────────────────────┐           │
│       items         │           │
├─────────────────────┤           │
│ id (PK)             │           │
│ itemCode (UNIQUE)   │           │
│ itemName            │           │
│ unit                │           │
│ createdAt           │           │
│ updatedAt           │           │
└─────────────────────┘           │
         │                        │
         │ itemId                 │
         │                        │
    ┌────┴────┬────────┬──────────┼──────────┐
    │         │        │          │          │
    ▼         ▼        ▼          ▼          ▼
┌─────────┐ ┌──────┐ ┌────────┐ ┌────────┐ ┌──────────┐
│ daily_  │ │weekly│ │fg_     │ │  wips  │ │audit_    │
│schedules│ │_sched│ │stocks  │ │        │ │logs      │
├─────────┤ ├──────┤ ├────────┤ ├────────┤ ├──────────┤
│id (PK)  │ │id(PK)│ │id (PK) │ │id (PK) │ │id (PK)   │
│date     │ │year  │ │itemId  │ │itemId  │ │userId ───┘
│shift    │ │week# │ │(UNIQUE)│ │location│ │action    │
│itemId   │ │itemId│ │quantity│ │quantity│ │entityType│
│quantity │ │qty   │ │date    │ │progress│ │entityId  │
│         │ │      │ │shift   │ │date    │ │dataBefore│
│UNIQUE:  │ │UNIQUE│ │notes   │ │shift   │ │dataAfter │
│date+    │ │year+ │ │updated │ │estFin  │ │createdAt │
│shift+   │ │week+│ │By      │ │status  │ │          │
│itemId   │ │itemId│ │        │ │notes   │ │          │
│         │ │      │ │        │ │updated │ │          │
│         │ │      │ │        │ │By      │ │          │
│         │ │      │ │        │ │        │ │          │
│         │ │      │ │        │ │UNIQUE: │ │          │
│         │ │      │ │        │ │itemId+ │ │          │
│         │ │      │ │        │ │location│ │          │
└─────────┘ └──────┘ └────────┘ └────────┘ └──────────┘

┌──────────────────┐
│  notifications   │
├──────────────────┤
│ id (PK)          │
│ userId ──────────┼──> users.id
│ type (ENUM)      │
│ title            │
│ message          │
│ itemCode         │
│ isRead           │
│ createdAt        │
└──────────────────┘
```

---

## 🔄 Status Calculation Logic

```
Input:
  demand = 100
  fgStock = 60
  wip = 30

Calculation:
  totalSupply = fgStock + wip
              = 60 + 30
              = 90

  gap = totalSupply - demand
      = 90 - 100
      = -10

Status Decision Tree:
                    ┌─────────────┐
                    │   Start     │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │ fgStock >=  │
                    │   demand?   │
                    └──────┬──────┘
                           │
                  ┌────────┴────────┐
                  │ YES             │ NO
                  ▼                 ▼
          ┌──────────────┐   ┌──────────────┐
          │  FULFILLED   │   │ totalSupply  │
          │              │   │  >= demand?  │
          │ gap = +20    │   └──────┬───────┘
          └──────────────┘          │
                              ┌─────┴─────┐
                              │YES        │NO
                              ▼           ▼
                      ┌──────────────┐ ┌──────────────┐
                      │IN_PRODUCTION │ │   SHORTAGE   │
                      │              │ │              │
                      │ gap = +10    │ │ gap = -10    │
                      └──────────────┘ └──────────────┘

Result:
  status = "SHORTAGE"
  gap = -10
  totalSupply = 90
```

---

## 🔐 RBAC (Role-Based Access Control)

```
┌─────────────────────────────────────────────────────────────┐
│                    PERMISSION MATRIX                        │
├──────────────────┬────────────┬────────────┬───────────────┤
│ Feature          │ SUPER_ADMIN│   ADMIN    │     USER      │
├──────────────────┼────────────┼────────────┼───────────────┤
│ View Dashboard   │     ✅     │     ✅     │      ✅       │
│ Search Items     │     ✅     │     ✅     │      ✅       │
│ View Tracking    │     ✅     │     ✅     │      ✅       │
├──────────────────┼────────────┼────────────┼───────────────┤
│ Input Data       │     ✅     │     ✅     │      ❌       │
│ Edit Data        │     ✅     │     ✅     │      ❌       │
│ Delete Data      │     ✅     │     ✅     │      ❌       │
│ Import Excel     │     ✅     │     ✅     │      ❌       │
├──────────────────┼────────────┼────────────┼───────────────┤
│ Export Reports   │     ✅     │     ❌     │      ✅       │
│ View Audit Logs  │     ✅     │     ❌     │      ❌       │
├──────────────────┼────────────┼────────────┼───────────────┤
│ Manage Users     │     ✅     │     ❌     │      ❌       │
│ System Config    │     ✅     │     ❌     │      ❌       │
└──────────────────┴────────────┴────────────┴───────────────┘

Implementation:
  1. JWT contains user role
  2. Middleware checks role before route execution
  3. Frontend hides UI elements based on role (UX only)
  4. Backend enforces permissions (security)
```

---

## 📦 Package Dependencies

```
┌─────────────────────────────────────────────────────────┐
│                    @pdits/web                           │
│                   (Frontend)                            │
│  ┌───────────────────────────────────────────────────┐ │
│  │ react, react-dom                                  │ │
│  │ @tanstack/router, @tanstack/react-query          │ │
│  │ zustand                                           │ │
│  │ shadcn/ui, tailwindcss                           │ │
│  │ recharts                                          │ │
│  │ vite, vite-plugin-pwa                            │ │
│  │ @pdits/shared ────────────────────┐              │ │
│  └───────────────────────────────────┼──────────────┘ │
└────────────────────────────────────────┼────────────────┘
                                         │
                                         │ imports
                                         │
┌────────────────────────────────────────▼────────────────┐
│                  @pdits/shared                          │
│              (Shared Package)                           │
│  ┌───────────────────────────────────────────────────┐ │
│  │ TypeScript types                                  │ │
│  │ Zod schemas                                       │ │
│  │ Business logic utilities                          │ │
│  │ calculateItemStatus()                             │ │
│  └───────────────────────────────────────────────────┘ │
└────────────────────────────────────────┬────────────────┘
                                         │
                                         │ imports
                                         │
┌────────────────────────────────────────▼────────────────┐
│                    @pdits/api                           │
│                   (Backend)                             │
│  ┌───────────────────────────────────────────────────┐ │
│  │ fastify, @fastify/*                               │ │
│  │ @prisma/client, prisma                            │ │
│  │ ioredis, bullmq                                   │ │
│  │ jsonwebtoken, bcrypt                              │ │
│  │ zod, xlsx, web-push                               │ │
│  │ @pdits/shared                                     │ │
│  └───────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

## 🚀 Deployment Architecture (Dokploy)

```
┌─────────────────────────────────────────────────────────┐
│                    INTERNET                             │
└────────────────────┬────────────────────────────────────┘
                     │ HTTPS
                     │
┌────────────────────▼────────────────────────────────────┐
│                  Traefik                                │
│            (Reverse Proxy + SSL)                        │
│  • Let's Encrypt SSL auto-renew                         │
│  • app.domain.com → Frontend                            │
│  • api.domain.com → Backend                             │
└────────┬───────────────────────┬────────────────────────┘
         │                       │
         │                       │
    ┌────▼────┐            ┌────▼────┐
    │Frontend │            │ Backend │
    │Container│            │Container│
    │         │            │         │
    │ Nginx   │            │ Node.js │
    │ (Static)│            │ Fastify │
    └─────────┘            └────┬────┘
                                │
                    ┌───────────┴───────────┐
                    │                       │
              ┌─────▼─────┐           ┌────▼────┐
              │   MySQL   │           │  Redis  │
              │ Container │           │Container│
              │           │           │         │
              │ (Managed  │           │(Managed │
              │  by       │           │ by      │
              │  Dokploy) │           │ Dokploy)│
              └───────────┘           └─────────┘
```

---

**Version:** 1.0.0  
**Last Updated:** Mei 2026
