# 🧪 PDITS Testing Guide

Panduan testing untuk PDITS menggunakan berbagai tools.

## 📋 Testing Stack

- **Unit Tests:** Vitest
- **Integration Tests:** Vitest + Supertest
- **E2E Tests:** Playwright
- **Database Tests:** Prisma + Vitest
- **API Tests:** TestSprite MCP (optional)

---

## 🔧 Setup Testing

### 1. Install Test Dependencies

Sudah terinstall via `pnpm install`. Dependencies:

```json
{
  "vitest": "^1.2.0",
  "supertest": "^6.3.4",
  "@testing-library/react": "^14.x",
  "playwright": "^1.x"
}
```

### 2. Test Database

Untuk testing, gunakan database terpisah:

```env
# .env.test
DATABASE_URL=mysql://pdits:devpassword@localhost:3306/pdits_test
REDIS_URL=redis://localhost:6379/1
```

---

## 🧪 Unit Testing

### Backend Unit Tests

**File:** `apps/api/src/services/__tests__/item.service.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { calculateItemStatus } from '@pdits/shared';

describe('calculateItemStatus', () => {
  it('returns FULFILLED when FG stock >= demand', () => {
    const result = calculateItemStatus({
      demand: 100,
      fgStock: 120,
      wip: 0,
    });

    expect(result.status).toBe('FULFILLED');
    expect(result.gap).toBe(20);
  });

  it('returns IN_PRODUCTION when FG < demand but FG + WIP >= demand', () => {
    const result = calculateItemStatus({
      demand: 100,
      fgStock: 60,
      wip: 50,
    });

    expect(result.status).toBe('IN_PRODUCTION');
    expect(result.gap).toBe(10);
  });

  it('returns SHORTAGE when FG + WIP < demand', () => {
    const result = calculateItemStatus({
      demand: 100,
      fgStock: 60,
      wip: 30,
    });

    expect(result.status).toBe('SHORTAGE');
    expect(result.gap).toBe(-10);
  });
});
```

**Run:**

```bash
pnpm --filter @pdits/api test
```

### Frontend Unit Tests

**File:** `apps/web/src/components/__tests__/StatusBadge.test.tsx`

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from '../StatusBadge';

describe('StatusBadge', () => {
  it('renders FULFILLED status with green color', () => {
    render(<StatusBadge status="FULFILLED" />);
    const badge = screen.getByText('FULFILLED');
    expect(badge).toHaveClass('bg-green-500');
  });

  it('renders SHORTAGE status with red color', () => {
    render(<StatusBadge status="SHORTAGE" />);
    const badge = screen.getByText('SHORTAGE');
    expect(badge).toHaveClass('bg-red-500');
  });
});
```

---

## 🔗 Integration Testing

### API Integration Tests

**File:** `apps/api/src/routes/__tests__/items.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build } from '../app'; // Fastify app builder
import supertest from 'supertest';

describe('Items API', () => {
  let app: any;
  let request: any;

  beforeAll(async () => {
    app = await build();
    await app.ready();
    request = supertest(app.server);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/items returns list of items', async () => {
    const response = await request
      .get('/api/v1/items')
      .expect(200);

    expect(response.body).toHaveProperty('data');
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  it('POST /api/v1/items creates new item', async () => {
    const newItem = {
      itemCode: 'TEST-001',
      itemName: 'Test Item',
      unit: 'pcs',
    };

    const response = await request
      .post('/api/v1/items')
      .send(newItem)
      .expect(201);

    expect(response.body.data).toMatchObject(newItem);
  });
});
```

**Run:**

```bash
pnpm --filter @pdits/api test:integration
```

---

## 🎭 E2E Testing (Playwright)

### Setup Playwright

```bash
pnpm --filter @pdits/web playwright install
```

### E2E Test Example

**File:** `apps/web/e2e/login.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Login Flow', () => {
  test('should login successfully with valid credentials', async ({ page }) => {
    await page.goto('http://localhost:5173');

    // Fill login form
    await page.fill('input[name="email"]', 'admin@pdits.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');

    // Should redirect to dashboard
    await expect(page).toHaveURL(/.*dashboard/);
    await expect(page.locator('h1')).toContainText('Dashboard');
  });

  test('should show error with invalid credentials', async ({ page }) => {
    await page.goto('http://localhost:5173');

    await page.fill('input[name="email"]', 'wrong@email.com');
    await page.fill('input[name="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');

    // Should show error message
    await expect(page.locator('.error-message')).toBeVisible();
  });
});
```

**Run:**

```bash
pnpm --filter @pdits/web test:e2e
```

---

## 🗄️ Database Testing

### Test Database Connection

```bash
pnpm --filter @pdits/api tsx src/lib/test-db.ts
```

Output:
```
🧪 Testing database connection...
✅ Raw query success
✅ Found 3 users
✅ Found 5 items
✅ All database tests passed!
```

### Prisma Test Utilities

**File:** `apps/api/src/lib/__tests__/prisma.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import prisma from '../prisma';

describe('Prisma Client', () => {
  beforeEach(async () => {
    // Clean test data
    await prisma.item.deleteMany({
      where: { itemCode: { startsWith: 'TEST-' } },
    });
  });

  it('should create and retrieve item', async () => {
    const item = await prisma.item.create({
      data: {
        itemCode: 'TEST-001',
        itemName: 'Test Item',
        unit: 'pcs',
      },
    });

    const retrieved = await prisma.item.findUnique({
      where: { itemCode: 'TEST-001' },
    });

    expect(retrieved).toMatchObject(item);
  });

  it('should enforce unique constraint on itemCode', async () => {
    await prisma.item.create({
      data: {
        itemCode: 'TEST-002',
        itemName: 'Test Item',
        unit: 'pcs',
      },
    });

    await expect(
      prisma.item.create({
        data: {
          itemCode: 'TEST-002', // Duplicate
          itemName: 'Another Item',
          unit: 'kg',
        },
      })
    ).rejects.toThrow();
  });
});
```

---

## 🤖 TestSprite MCP (Optional)

TestSprite MCP dapat digunakan untuk automated testing frontend.

### Setup TestSprite

**Catatan:** TestSprite MCP sudah tersedia di environment Anda.

### Bootstrap TestSprite

```typescript
// Hanya jalankan sekali untuk inisialisasi
await mcp_TestSprite_testsprite_bootstrap({
  localPort: 5173,
  type: 'frontend',
  projectPath: 'D:/Planner/pdits',
  testScope: 'codebase',
  pathname: '/',
});
```

### Generate Test Plan

```typescript
await mcp_TestSprite_testsprite_generate_frontend_test_plan({
  projectPath: 'D:/Planner/pdits',
  needLogin: true,
});
```

### Execute Tests

```typescript
await mcp_TestSprite_testsprite_generate_code_and_execute({
  projectName: 'pdits',
  projectPath: 'D:/Planner/pdits',
  testIds: [], // Empty = all tests
  additionalInstruction: '',
  serverMode: 'development',
});
```

### View Test Results

```typescript
await mcp_TestSprite_testsprite_open_test_result_dashboard({
  projectPath: 'D:/Planner/pdits',
  modificationContext: 'Review test results',
});
```

---

## 📊 Test Coverage

### Generate Coverage Report

```bash
# Backend
pnpm --filter @pdits/api test --coverage

# Frontend
pnpm --filter @pdits/web test --coverage
```

### Coverage Thresholds

Target coverage (configured in `vitest.config.ts`):

```typescript
coverage: {
  provider: 'v8',
  reporter: ['text', 'html'],
  thresholds: {
    lines: 80,
    functions: 80,
    branches: 70,
  }
}
```

---

## 🎯 Testing Priorities

### High Priority (Must Test)

1. ✅ **Kalkulasi Status Item**
   - FULFILLED / IN_PRODUCTION / SHORTAGE logic
   - Gap calculation

2. ✅ **Overwrite Behavior**
   - FG Stock upsert
   - WIP upsert per item + location

3. ✅ **Authentication & Authorization**
   - Login flow
   - Token refresh
   - Role-based access

4. ✅ **Data Import**
   - Excel/CSV parsing
   - Validation
   - Error handling

### Medium Priority

- Dashboard filters
- Search & autocomplete
- Notifications
- Export reports

### Low Priority

- UI component styling
- Animation
- Non-critical features

---

## 🐛 Debugging Tests

### Debug Vitest Tests

```bash
# Run with debug output
pnpm --filter @pdits/api test --reporter=verbose

# Run specific test file
pnpm --filter @pdits/api test src/services/__tests__/item.service.test.ts

# Run in watch mode
pnpm --filter @pdits/api test --watch
```

### Debug Playwright Tests

```bash
# Run with UI
pnpm --filter @pdits/web playwright test --ui

# Run with debug
pnpm --filter @pdits/web playwright test --debug

# Generate test report
pnpm --filter @pdits/web playwright show-report
```

---

## 📝 Test Checklist

Before committing code:

- [ ] All unit tests pass
- [ ] Integration tests pass
- [ ] No TypeScript errors
- [ ] Coverage meets threshold (80%+)
- [ ] E2E tests for critical flows pass
- [ ] Database migrations tested
- [ ] API endpoints tested with Postman/Thunder Client

---

## 🆘 Troubleshooting

### "Cannot connect to test database"

```bash
# Create test database
docker exec -it pdits-mysql-dev mysql -u root -prootpassword -e "CREATE DATABASE IF NOT EXISTS pdits_test;"
```

### "Prisma Client not generated"

```bash
pnpm --filter @pdits/api prisma:generate
```

### "Port already in use"

```bash
# Kill process on port
npx kill-port 3001 5173
```

---

## 📚 Resources

- [Vitest Docs](https://vitest.dev/)
- [Playwright Docs](https://playwright.dev/)
- [Supertest Docs](https://github.com/ladjs/supertest)
- [Testing Library](https://testing-library.com/)
- [Prisma Testing](https://www.prisma.io/docs/guides/testing)

---

**Happy Testing! 🧪**
