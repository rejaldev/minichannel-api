import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { authMiddleware, ownerOnly, ownerOrManager, AuthUser } from './auth';
import { generateToken } from '../lib/jwt';

// Helper to parse JSON response
const json = async (res: Response) => res.json() as Promise<Record<string, any>>;

// Create test app
function createTestApp() {
  const app = new Hono();
  
  // Public route
  app.get('/public', (c) => c.json({ message: 'public' }));
  
  // Protected route
  app.get('/protected', authMiddleware, (c) => {
    const user = c.get('user');
    return c.json({ user });
  });
  
  // Owner only route
  app.get('/owner-only', authMiddleware, ownerOnly, (c) => {
    return c.json({ message: 'owner access granted' });
  });
  
  // Owner or manager route
  app.get('/manager-or-owner', authMiddleware, ownerOrManager, (c) => {
    return c.json({ message: 'access granted' });
  });
  
  return app;
}

describe('Auth Middleware', () => {
  let app: Hono;

  beforeEach(() => {
    app = createTestApp();
  });

  describe('authMiddleware', () => {
    it('should allow access with valid token', async () => {
      const token = generateToken('user-1', 'test@test.com', 'OWNER', 'cab-1');
      
      const res = await app.request('/protected', {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      expect(res.status).toBe(200);
      const data = await json(res);
      expect(data.user).toBeDefined();
      expect(data.user.userId).toBe('user-1');
    });

    it('should reject request without token', async () => {
      const res = await app.request('/protected');
      
      expect(res.status).toBe(401);
      const data = await json(res);
      expect(data.error).toBe('Token tidak ditemukan');
    });

    it('should reject request with invalid token', async () => {
      const res = await app.request('/protected', {
        headers: { Authorization: 'Bearer invalid-token' },
      });
      
      expect(res.status).toBe(401);
      const data = await json(res);
      expect(data.error).toBe('Token tidak valid');
    });

    it('should reject request with malformed authorization header', async () => {
      const res = await app.request('/protected', {
        headers: { Authorization: 'InvalidFormat token123' },
      });
      
      expect(res.status).toBe(401);
    });
  });

  describe('ownerOnly', () => {
    it('should allow OWNER access', async () => {
      const token = generateToken('user-1', 'owner@test.com', 'OWNER', 'cab-1');
      
      const res = await app.request('/owner-only', {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      expect(res.status).toBe(200);
      const data = await json(res);
      expect(data.message).toBe('owner access granted');
    });

    it('should reject MANAGER from owner-only route', async () => {
      const token = generateToken('user-2', 'manager@test.com', 'MANAGER', 'cab-1');
      
      const res = await app.request('/owner-only', {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      expect(res.status).toBe(403);
      const data = await json(res);
      expect(data.error).toBe('Hanya owner yang bisa akses');
    });

    it('should reject KASIR from owner-only route', async () => {
      const token = generateToken('user-3', 'kasir@test.com', 'KASIR', 'cab-1');
      
      const res = await app.request('/owner-only', {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      expect(res.status).toBe(403);
    });
  });

  describe('ownerOrManager', () => {
    it('should allow OWNER access', async () => {
      const token = generateToken('user-1', 'owner@test.com', 'OWNER', null);
      
      const res = await app.request('/manager-or-owner', {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      expect(res.status).toBe(200);
    });

    it('should allow MANAGER access', async () => {
      const token = generateToken('user-2', 'manager@test.com', 'MANAGER', 'cab-1');
      
      const res = await app.request('/manager-or-owner', {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      expect(res.status).toBe(200);
    });

    it('should reject ADMIN from owner-or-manager route', async () => {
      const token = generateToken('user-3', 'admin@test.com', 'ADMIN', 'cab-1');
      
      const res = await app.request('/manager-or-owner', {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      expect(res.status).toBe(403);
      const data = await json(res);
      expect(data.error).toBe('Akses ditolak');
    });

    it('should reject KASIR from owner-or-manager route', async () => {
      const token = generateToken('user-4', 'kasir@test.com', 'KASIR', 'cab-1');
      
      const res = await app.request('/manager-or-owner', {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      expect(res.status).toBe(403);
    });
  });
});
