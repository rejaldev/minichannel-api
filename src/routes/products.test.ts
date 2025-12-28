import { describe, it, expect, vi, beforeEach } from 'vitest';
import products from './products';
import prisma from '../lib/prisma';
import { generateToken } from '../lib/jwt';

// Helper to parse JSON response
const json = async (res: Response) => res.json() as Promise<Record<string, any>>;

describe('Products Routes', () => {
  const ownerToken = generateToken('owner-1', 'owner@test.com', 'OWNER', null);
  const kasirToken = generateToken('kasir-1', 'kasir@test.com', 'KASIR', 'cab-1');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /categories', () => {
    it('should return categories list', async () => {
      const mockCategories = [
        { id: 'cat-1', name: 'Electronics', description: null, createdAt: new Date(), updatedAt: new Date() },
        { id: 'cat-2', name: 'Clothing', description: 'Fashion items', createdAt: new Date(), updatedAt: new Date() },
      ];
      
      vi.mocked(prisma.category.findMany).mockResolvedValue(mockCategories);

      const res = await products.request('/categories', {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(2);
    });

    it('should return 401 without auth', async () => {
      const res = await products.request('/categories');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /categories', () => {
    it('should create category for owner', async () => {
      const mockCategory = {
        id: 'cat-new',
        name: 'New Category',
        description: 'Test description',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      vi.mocked(prisma.category.create).mockResolvedValue(mockCategory);

      const res = await products.request('/categories', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'New Category', description: 'Test description' }),
      });

      expect(res.status).toBe(201);
      const data = await json(res);
      expect(data.name).toBe('New Category');
    });

    it('should return 400 if name missing', async () => {
      const res = await products.request('/categories', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ description: 'No name' }),
      });

      expect(res.status).toBe(400);
    });

    it('should return 403 for kasir', async () => {
      const res = await products.request('/categories', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${kasirToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'Test' }),
      });

      expect(res.status).toBe(403);
    });
  });

  describe('GET /', () => {
    it('should return products list', async () => {
      const mockProducts = [
        {
          id: 'prod-1',
          name: 'Product 1',
          description: null,
          categoryId: 'cat-1',
          productType: 'SINGLE',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          category: { id: 'cat-1', name: 'Electronics' },
          variants: [],
        },
      ];
      
      vi.mocked(prisma.product.findMany).mockResolvedValue(mockProducts as any);

      const res = await products.request('/', {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });

    it('should filter by categoryId', async () => {
      vi.mocked(prisma.product.findMany).mockResolvedValue([]);

      const res = await products.request('/?categoryId=cat-1', {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });

      expect(res.status).toBe(200);
      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            categoryId: 'cat-1',
          }),
        })
      );
    });

    it('should filter by search term', async () => {
      vi.mocked(prisma.product.findMany).mockResolvedValue([]);

      const res = await products.request('/?search=laptop', {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });

      expect(res.status).toBe(200);
      expect(prisma.product.findMany).toHaveBeenCalled();
    });
  });

  describe('GET /search/sku/:sku', () => {
    it('should return 404 if SKU not found', async () => {
      vi.mocked(prisma.productVariant.findFirst).mockResolvedValue(null);

      const res = await products.request('/search/sku/NOTFOUND', {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });

      expect(res.status).toBe(404);
    });
  });

  describe('GET /alerts/low-stock', () => {
    it('should require authentication', async () => {
      const res = await products.request('/alerts/low-stock');
      expect(res.status).toBe(401);
    });
  });
});
