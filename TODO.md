# ✅ PDITS Implementation Checklist

Checklist lengkap untuk implementasi PDITS dari awal hingga production.

---

## 🎯 Phase 1: Foundation (✅ COMPLETE)

### Project Setup
- [x] Create monorepo structure
- [x] Setup pnpm workspaces
- [x] Configure TypeScript
- [x] Setup environment variables
- [x] Create docker-compose for development
- [x] Setup .gitignore

### Database
- [x] Design Prisma schema (9 models)
- [x] Create migrations
- [x] Create seed script
- [x] Test database connection

### Shared Package
- [x] Define TypeScript types
- [x] Create Zod validation schemas
- [x] Implement calculateItemStatus utility
- [x] Build configuration

### Backend Structure
- [x] Setup Fastify server
- [x] Configure CORS, Helmet, Rate Limiting
- [x] Setup Prisma client
- [x] Setup Redis client
- [x] Create health check endpoint
- [x] Configure logging (Pino)

### Documentation
- [x] README.md
- [x] SETUP.md
- [x] QUICKSTART.md
- [x] PROJECT_STATUS.md
- [x] TESTING_GUIDE.md
- [x] ARCHITECTURE.md
- [x] SUMMARY.md
- [x] TODO.md (this file)

---

## 🔐 Phase 2: Authentication & Authorization (⏳ TODO)

### JWT Implementation
- [x] Create JWT utility functions
  - [x] generateAccessToken()
  - [x] generateRefreshToken()
  - [x] verifyToken()
- [x] Create auth middleware
  - [x] authenticateJWT()
  - [x] requireRole()

### Auth Routes
- [x] POST /api/v1/auth/login
  - [x] Validate credentials
  - [x] Hash password check (bcrypt)
  - [x] Generate tokens
  - [ ] Set HttpOnly cookie for refresh token
- [ ] POST /api/v1/auth/logout
  - [ ] Invalidate refresh token (Redis blacklist)
  - [ ] Clear cookies
- [x] POST /api/v1/auth/refresh
  - [x] Verify refresh token
  - [x] Generate new access token
- [x] GET /api/v1/auth/me
  - [x] Get current user info

### Password Management
- [ ] POST /api/v1/auth/change-password
- [ ] POST /api/v1/auth/forgot-password (optional)
- [ ] POST /api/v1/auth/reset-password (optional)

### Testing
- [ ] Unit tests for JWT utilities
- [ ] Integration tests for auth routes
- [ ] Test RBAC middleware

---

## 📦 Phase 3: Core API Routes (⏳ TODO)

### Items (Master Data)
- [x] GET /api/v1/items
  - [ ] Pagination
  - [ ] Search by name/code
  - [x] Sort options
- [x] GET /api/v1/items/:id
- [x] POST /api/v1/items (Admin+)
  - [x] Validate with Zod
  - [x] Check duplicate itemCode
  - [x] Create audit log
- [x] PUT /api/v1/items/:id (Admin+)
  - [x] Validate input
  - [x] Update item
  - [x] Create audit log
- [x] DELETE /api/v1/items/:id (Admin+)
  - [x] Check if item is used
  - [x] Soft delete or cascade
  - [x] Create audit log
- [x] GET /api/v1/items/search?q=...
  - [x] Autocomplete search
  - [ ] Cache results

### Daily Schedule
- [x] GET /api/v1/daily-schedule
  - [x] Filter by date
  - [x] Filter by shift
  - [ ] Filter by item
- [x] POST /api/v1/daily-schedule (Admin+)
  - [x] Validate input
  - [x] Check duplicate (date + shift + item)
  - [x] Upsert if duplicate
  - [x] Create audit log
- [ ] PUT /api/v1/daily-schedule/:id (Admin+)
- [ ] DELETE /api/v1/daily-schedule/:id (Admin+)
- [ ] POST /api/v1/daily-schedule/import (Admin+)
  - [ ] Parse Excel/CSV
  - [ ] Validate rows
  - [ ] Show preview
  - [ ] Bulk upsert
  - [ ] Return summary

### Weekly Schedule
- [ ] GET /api/v1/weekly-schedule
  - [ ] Filter by year
  - [ ] Filter by week number
  - [ ] Filter by item
- [ ] POST /api/v1/weekly-schedule (Admin+)
  - [ ] Calculate week start/end dates
  - [ ] Validate input
  - [ ] Upsert if duplicate
  - [ ] Create audit log
- [ ] PUT /api/v1/weekly-schedule/:id (Admin+)
- [ ] DELETE /api/v1/weekly-schedule/:id (Admin+)
- [ ] POST /api/v1/weekly-schedule/import (Admin+)

### FG Stock
- [x] GET /api/v1/fg-stock
  - [x] List all current stocks
  - [ ] Filter by item
  - [ ] Cache results
- [ ] GET /api/v1/fg-stock/:itemCode
- [x] POST /api/v1/fg-stock (Admin+)
  - [x] Validate input
  - [x] Upsert (overwrite if exists)
  - [x] Create audit log (before/after)
  - [ ] Invalidate cache
- [ ] PUT /api/v1/fg-stock/:itemCode (Admin+)
- [ ] DELETE /api/v1/fg-stock/:itemCode (Admin+)
- [ ] GET /api/v1/fg-stock/history/:itemCode
  - [ ] Get from audit logs
  - [ ] Show timeline of changes
- [ ] POST /api/v1/fg-stock/import (Admin+)
  - [ ] Parse Excel/CSV
  - [ ] Show preview with overwrite warning
  - [ ] Bulk upsert
  - [ ] Create audit logs

### WIP
- [x] GET /api/v1/wip
  - [x] List all active WIPs
  - [ ] Filter by item
  - [ ] Filter by location
  - [ ] Filter by status
  - [ ] Cache results
- [ ] GET /api/v1/wip/:id
- [x] POST /api/v1/wip (Admin+)
  - [x] Validate input
  - [x] Upsert (overwrite if item + location exists)
  - [x] Create audit log
  - [ ] Invalidate cache
- [ ] PUT /api/v1/wip/:id (Admin+)
  - [ ] Update progress
  - [ ] Update status
  - [ ] Create audit log
- [ ] DELETE /api/v1/wip/:id (Admin+)
- [ ] POST /api/v1/wip/:id/complete (Admin+)
  - [ ] Set progress to 100%
  - [ ] Set status to COMPLETED
  - [ ] Add quantity to FG stock
  - [ ] Archive or delete WIP
  - [ ] Create audit logs
- [ ] POST /api/v1/wip/import (Admin+)

### Testing
- [ ] Unit tests for services
- [ ] Integration tests for all routes
- [ ] Test overwrite behavior (FG & WIP)
- [ ] Test audit logging

---

## 📊 Phase 4: Tracking & Dashboard (⏳ TODO)

### Tracking Endpoints
- [x] GET /api/v1/tracking/daily
  - [x] Query params: item_code, date, shift
  - [x] Get demand from daily_schedules
  - [x] Get FG stock (current)
  - [x] Get WIP (current, all locations)
  - [x] Calculate status & gap
  - [ ] Cache result (2 min TTL)
  - [x] Return with WIP details
- [ ] GET /api/v1/tracking/weekly
  - [ ] Query params: item_code, week, year
  - [ ] Get demand from weekly_schedules
  - [ ] Get FG + WIP (current)
  - [ ] Calculate status & gap
  - [ ] Cache result
- [ ] GET /api/v1/tracking/total
  - [ ] Query params: item_code
  - [ ] Sum all 26 weeks demand
  - [ ] Get FG + WIP (current)
  - [ ] Calculate total gap
  - [ ] Cache result
- [x] GET /api/v1/tracking/dashboard
  - [x] Query params: date, shift (optional)
  - [x] Aggregate all items
  - [x] Count by status (FULFILLED, IN_PRODUCTION, SHORTAGE)
  - [x] Return summary cards data
  - [x] Return gap analysis table
  - [x] Return WIP status per item
  - [ ] Cache result

### Dashboard Services
- [ ] Create DashboardService
  - [ ] aggregateByStatus()
  - [ ] calculateGapAnalysis()
  - [ ] getWIPStatusByItem()
  - [ ] generateChartData()

### Cache Strategy
- [ ] Implement cache-aside pattern
- [ ] Auto-invalidate on data update
- [ ] Set appropriate TTLs

### Testing
- [ ] Unit tests for status calculation
- [ ] Integration tests for tracking endpoints
- [ ] Test cache invalidation
- [ ] Test edge cases (no data, zero stock, etc.)

---

## 📈 Phase 5: Reports & Export (⏳ TODO)

### Export Endpoints
- [ ] GET /api/v1/reports/export
  - [ ] Query params: format (csv/xlsx), type, filters
  - [ ] Generate report based on type:
    - [ ] Stock snapshot
    - [ ] Gap analysis
    - [ ] Shortage items
    - [ ] WIP status
  - [ ] Stream response for small reports
  - [ ] Use BullMQ for large reports
  - [ ] Return download link or file

### Report Types
- [ ] Stock Snapshot Report
- [ ] Gap Analysis Report
- [ ] Shortage & Unfulfilled Report
- [ ] Production Efficiency Report
- [ ] Audit Trail Report

### Excel/CSV Generation
- [ ] Install & configure SheetJS (xlsx)
- [ ] Create ExportService
  - [ ] generateExcel()
  - [ ] generateCSV()
  - [ ] formatData()
- [ ] Add styling to Excel exports
- [ ] Add summary rows

### Testing
- [ ] Test Excel generation
- [ ] Test CSV generation
- [ ] Test large file handling
- [ ] Test different report types

---

## 👥 Phase 6: User Management (⏳ TODO)

### User Routes (Super Admin Only)
- [x] GET /api/v1/users
  - [x] List all users
  - [ ] Pagination
  - [ ] Filter by role
  - [ ] Filter by status (active/inactive)
- [ ] GET /api/v1/users/:id
- [x] POST /api/v1/users
  - [x] Validate input
  - [x] Hash password
  - [ ] Send welcome email (optional)
  - [ ] Create audit log
- [x] PUT /api/v1/users/:id
  - [x] Update user info
  - [x] Change role
  - [x] Activate/deactivate
  - [ ] Create audit log
- [x] DELETE /api/v1/users/:id
  - [x] Soft delete
  - [ ] Invalidate all sessions
  - [ ] Create audit log

### User Service
- [ ] Create UserService
  - [ ] hashPassword()
  - [ ] validatePassword()
  - [ ] generateTemporaryPassword()
  - [ ] sendWelcomeEmail() (optional)

### Testing
- [ ] Test user CRUD operations
- [ ] Test role changes
- [ ] Test password hashing
- [ ] Test authorization (only Super Admin)

---

## 📝 Phase 7: Audit Logs & Notifications (⏳ TODO)

### Audit Log Routes
- [ ] GET /api/v1/audit-logs
  - [ ] Filter by user
  - [ ] Filter by entity type
  - [ ] Filter by action
  - [ ] Filter by date range
  - [ ] Pagination
  - [ ] Sort by date (desc)

### Audit Log Service
- [ ] Create AuditService
  - [ ] logCreate()
  - [ ] logUpdate()
  - [ ] logDelete()
  - [ ] Auto-capture before/after data

### Notification Routes
- [ ] GET /api/v1/notifications
  - [ ] Get user notifications
  - [ ] Filter by read/unread
  - [ ] Pagination
- [ ] PUT /api/v1/notifications/:id/read
  - [ ] Mark as read
- [ ] DELETE /api/v1/notifications/:id
- [ ] POST /api/v1/notifications/read-all
  - [ ] Mark all as read

### Notification Service
- [ ] Create NotificationService
  - [ ] createNotification()
  - [ ] notifyShortage()
  - [ ] notifyDelay()
  - [ ] notifyStaleData()

### Background Jobs (BullMQ)
- [ ] Setup BullMQ queues
- [ ] Create job processors:
  - [ ] checkShortageJob (every 5 minutes)
  - [ ] checkDelayedProductionJob (every 10 minutes)
  - [ ] checkStaleDataJob (daily)
  - [ ] sendPushNotificationJob

### Testing
- [ ] Test audit log creation
- [ ] Test notification creation
- [ ] Test background jobs
- [ ] Test job retry logic

---

## 🔔 Phase 8: Push Notifications (⏳ TODO)

### VAPID Setup
- [ ] Generate VAPID keys
- [ ] Configure web-push library
- [ ] Store keys in environment variables

### Push Notification Routes
- [ ] POST /api/v1/push/subscribe
  - [ ] Save subscription to database
- [ ] POST /api/v1/push/unsubscribe
  - [ ] Remove subscription
- [ ] POST /api/v1/push/send (Admin+)
  - [ ] Send push notification
  - [ ] Queue for multiple users

### Push Service
- [ ] Create PushService
  - [ ] sendPushNotification()
  - [ ] sendBulkNotifications()
  - [ ] handleSubscription()

### Testing
- [ ] Test subscription flow
- [ ] Test push notification sending
- [ ] Test notification display in browser

---

## 🎨 Phase 9: Frontend Development (⏳ TODO)

### Project Setup
- [x] Initialize Vite + React + TypeScript
- [x] Install dependencies:
  - [x] @tanstack/react-router
  - [x] @tanstack/react-query
  - [x] zustand
  - [x] shadcn/ui
  - [x] tailwindcss
  - [x] recharts
  - [x] react-hook-form
  - [x] zod
  - [x] date-fns
  - [x] lucide-react
- [x] Configure Tailwind CSS
- [x] Setup shadcn/ui
- [x] Configure TanStack Router
- [x] Configure TanStack Query
- [x] Setup Zustand stores

### PWA Configuration
- [x] Install vite-plugin-pwa
- [x] Create manifest.json
- [x] Configure service worker (Workbox)
- [ ] Setup offline fallback
- [ ] Add install prompt
- [ ] Configure push notification subscription

### Layout Components
- [x] Header
  - [x] Logo
  - [ ] Search bar (global)
  - [x] Notification bell
  - [x] User menu
- [x] Sidebar
  - [x] Navigation menu
  - [x] Role-based menu items
  - [ ] Collapsible
- [ ] Footer
- [x] Main layout wrapper

### UI Components (shadcn/ui)
- [ ] Install base components:
  - [ ] Button
  - [ ] Input
  - [ ] Select
  - [ ] DatePicker
  - [ ] Table
  - [ ] Dialog
  - [ ] Toast
  - [ ] Badge
  - [ ] Card
  - [ ] Tabs
  - [ ] Form
  - [ ] Dropdown Menu
  - [ ] Popover
  - [ ] Sheet (Drawer)

### Custom Components
- [ ] StatusBadge (FULFILLED/IN_PRODUCTION/SHORTAGE)
- [ ] ItemSearch (Autocomplete)
- [ ] DataTable (sortable, filterable)
- [ ] ChartWrapper (Recharts)
- [ ] LoadingSpinner
- [ ] ErrorBoundary
- [ ] EmptyState

### Pages
- [x] Login Page
  - [x] Login form
  - [x] Form validation
  - [x] Error handling
  - [ ] Remember me (optional)
- [x] Dashboard Page
  - [x] Summary cards
  - [ ] Date & shift filter
  - [x] Gap analysis chart
  - [x] Gap analysis table
  - [x] WIP status table
  - [ ] Auto-refresh
- [ ] Item Tracking Page
  - [ ] Search bar
  - [ ] Tabs (Daily, Weekly, Total)
  - [ ] Summary cards
  - [ ] Bar/Line chart
  - [ ] WIP details table
  - [ ] Export button
- [x] Data Management Pages:
  - [x] Daily Schedule
  - [ ] Weekly Schedule
  - [x] FG Stock
  - [x] WIP
- [x] User Management Page (Super Admin)
  - [x] User list
  - [x] Add user form
  - [x] Edit user form
  - [x] Role selector
  - [x] Activate/deactivate toggle
- [ ] Audit Log Page (Super Admin)
  - [ ] Log list
  - [ ] Filters
  - [ ] Detail viewer
- [ ] Reports Page
  - [ ] Report type selector
  - [ ] Filter options
  - [ ] Preview button
  - [ ] Export button

### API Integration
- [x] Create API client (axios/fetch)
- [x] Setup TanStack Query hooks:
  - [x] useAuth
  - [x] useItems
  - [x] useDailySchedule
  - [ ] useWeeklySchedule
  - [x] useFGStock
  - [x] useWIP
  - [ ] useTracking
  - [x] useDashboard
  - [x] useUsers
  - [ ] useAuditLogs
  - [ ] useNotifications
- [x] Setup mutations:
  - [x] Login/Logout
  - [x] CRUD operations (Users/Items)
  - [ ] Import operations
- [x] Error handling
- [x] Loading states
- [ ] Optimistic updates

### State Management (Zustand)
- [x] Auth store
  - [x] User info
  - [x] Tokens
  - [x] Login/logout actions
- [ ] UI store
  - [ ] Sidebar collapsed
  - [ ] Theme (optional)
  - [ ] Notifications

### Forms (React Hook Form + Zod)
- [ ] Login form
- [ ] Item form
- [ ] Daily schedule form
- [ ] Weekly schedule form
- [ ] FG stock form
- [ ] WIP form
- [ ] User form
- [ ] Import preview form

### Charts (Recharts)
- [ ] Bar chart (Demand vs Supply)
- [ ] Stacked bar chart (FG + WIP)
- [ ] Line chart (Trend over time)
- [ ] Area chart (Gap visualization)

### Testing
- [ ] Unit tests for components
- [ ] Unit tests for hooks
- [ ] Integration tests for forms
- [ ] E2E tests (Playwright):
  - [ ] Login flow
  - [ ] Dashboard interaction
  - [ ] Data input flow
  - [ ] Search & tracking
  - [ ] Export report

---

## 🧪 Phase 10: Testing (⏳ TODO)

### Backend Tests
- [ ] Unit tests:
  - [ ] Services
  - [ ] Utilities
  - [ ] Middleware
- [ ] Integration tests:
  - [ ] All API routes
  - [ ] Database operations
  - [ ] Cache operations
- [ ] Coverage target: 80%+

### Frontend Tests
- [ ] Unit tests:
  - [ ] Components
  - [ ] Hooks
  - [ ] Utilities
- [ ] Integration tests:
  - [ ] Forms
  - [ ] API integration
- [ ] E2E tests:
  - [ ] Critical user flows
- [ ] Coverage target: 70%+

### Test Data
- [ ] Create test fixtures
- [ ] Create test factories
- [ ] Setup test database

---

## 🐳 Phase 11: Deployment (⏳ TODO)

### Docker
- [ ] Create Dockerfile for frontend
  - [ ] Multi-stage build
  - [ ] Nginx configuration
  - [ ] Optimize image size
- [ ] Create Dockerfile for backend
  - [ ] Multi-stage build
  - [ ] Run migrations on start
  - [ ] Optimize image size
- [ ] Test Docker builds locally

### Dokploy Setup
- [ ] Install Dokploy on VPS
- [ ] Configure domain
- [ ] Setup SSL (Let's Encrypt)
- [ ] Create MySQL database
- [ ] Create Redis database
- [ ] Deploy frontend application
- [ ] Deploy backend application
- [ ] Configure environment variables
- [ ] Setup backup schedule
- [ ] Configure monitoring

### CI/CD
- [ ] Setup Git webhook to Dokploy
- [ ] Configure auto-deploy on push
- [ ] Setup staging environment (optional)
- [ ] Configure rollback strategy

### Production Checklist
- [ ] Change default passwords
- [ ] Generate strong JWT secrets
- [ ] Generate VAPID keys
- [ ] Configure CORS for production domain
- [ ] Enable rate limiting
- [ ] Setup error tracking (Sentry, optional)
- [ ] Setup uptime monitoring
- [ ] Configure database backups
- [ ] Test disaster recovery

---

## 📚 Phase 12: Documentation & Training (⏳ TODO)

### User Documentation
- [ ] User manual (PDF)
- [ ] Video tutorials
- [ ] FAQ
- [ ] Troubleshooting guide

### Developer Documentation
- [ ] API documentation (Scalar)
- [ ] Database schema documentation
- [ ] Architecture diagrams
- [ ] Deployment guide
- [ ] Contributing guide

### Training
- [ ] Admin training session
- [ ] User training session
- [ ] Create training materials

---

## 🚀 Phase 13: Launch & Maintenance (⏳ TODO)

### Pre-Launch
- [ ] Final testing (all features)
- [ ] Performance testing
- [ ] Security audit
- [ ] Backup verification
- [ ] Rollback plan

### Launch
- [ ] Deploy to production
- [ ] Monitor for errors
- [ ] Collect user feedback
- [ ] Fix critical bugs

### Post-Launch
- [ ] Monitor performance
- [ ] Monitor error rates
- [ ] Collect feature requests
- [ ] Plan next iteration

### Maintenance
- [ ] Regular database backups
- [ ] Security updates
- [ ] Dependency updates
- [ ] Performance optimization
- [ ] Bug fixes
- [ ] Feature enhancements

---

## 📊 Progress Tracking

| Phase | Status | Progress | ETA |
|-------|--------|----------|-----|
| 1. Foundation | ✅ Complete | 100% | Done |
| 2. Auth & Authorization | ⏳ TODO | 0% | Week 1 |
| 3. Core API Routes | ⏳ TODO | 0% | Week 2-3 |
| 4. Tracking & Dashboard | ⏳ TODO | 0% | Week 3-4 |
| 5. Reports & Export | ⏳ TODO | 0% | Week 4 |
| 6. User Management | ⏳ TODO | 0% | Week 5 |
| 7. Audit & Notifications | ⏳ TODO | 0% | Week 5-6 |
| 8. Push Notifications | ⏳ TODO | 0% | Week 6 |
| 9. Frontend Development | ⏳ TODO | 0% | Week 7-10 |
| 10. Testing | ⏳ TODO | 0% | Week 11 |
| 11. Deployment | ⏳ TODO | 0% | Week 12 |
| 12. Documentation | ⏳ TODO | 0% | Week 12 |
| 13. Launch | ⏳ TODO | 0% | Week 13 |

**Overall Progress: ~8%**

---

## 🎯 Priority Order

### High Priority (Must Have)
1. Authentication & Authorization
2. Core API Routes (Items, Schedules, FG, WIP)
3. Tracking & Dashboard
4. Frontend (Login, Dashboard, Tracking)
5. Data input forms

### Medium Priority (Should Have)
6. Reports & Export
7. User Management
8. Audit Logs
9. Import Excel/CSV
10. Testing

### Low Priority (Nice to Have)
11. Push Notifications
12. Advanced charts
13. Email notifications
14. Mobile app (future)

---

**Last Updated:** Mei 2026  
**Next Review:** After Phase 2 completion
