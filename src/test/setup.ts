import { beforeAll, afterAll, vi } from 'vitest';

// Mock environment variables
process.env.JWT_SECRET = 'test-secret-key-for-testing';
process.env.JWT_EXPIRES_IN = '1h';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

// Mock Prisma with all required methods
vi.mock('../lib/prisma', () => ({
  default: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    product: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    productVariant: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    stock: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    transaction: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
      groupBy: vi.fn(),
    },
    transactionItem: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
    cabang: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    category: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    setting: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    return: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
    },
    returnItem: {
      findMany: vi.fn(),
    },
    stockAdjustment: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn((callback) => {
      if (typeof callback === 'function') {
        return callback({
          user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
          product: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
          productVariant: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn() },
          stock: { update: vi.fn(), upsert: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
          transaction: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
          return: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
          stockAdjustment: { create: vi.fn() },
        });
      }
      return Promise.resolve(callback);
    }),
    $queryRaw: vi.fn(),
  },
}));

// Mock Socket with all emit functions
vi.mock('../lib/socket', () => ({
  getIO: vi.fn(() => ({
    emit: vi.fn(),
  })),
  initSocket: vi.fn(),
  emitStockUpdated: vi.fn(),
  emitProductCreated: vi.fn(),
  emitProductUpdated: vi.fn(),
  emitProductDeleted: vi.fn(),
  emitCategoryUpdated: vi.fn(),
}));

beforeAll(() => {
  console.log('[TEST] Starting backend tests...');
});

afterAll(() => {
  console.log('[PASS] Backend tests completed');
});
