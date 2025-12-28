import { describe, it, expect, vi, beforeEach } from 'vitest';
import auth from './auth';
import prisma from '../lib/prisma';
import { generateToken } from '../lib/jwt';
import bcrypt from 'bcryptjs';

// Helper to parse JSON response
const json = async (res: Response) => res.json() as Promise<Record<string, any>>;

// Mock bcrypt
vi.mock('bcryptjs', () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn(),
  },
}));

describe('Auth Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /login', () => {
    it('should return 400 if email or password missing', async () => {
      const res = await auth.request('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@test.com' }), // missing password
      });

      expect(res.status).toBe(400);
      const data = await json(res);
      expect(data.error).toBe('Email dan password wajib diisi');
    });

    it('should return 401 if user not found', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const res = await auth.request('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'notfound@test.com', password: 'password' }),
      });

      expect(res.status).toBe(401);
      const data = await json(res);
      expect(data.error).toBe('Email atau password salah');
    });

    it('should return 401 if password incorrect', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'user-1',
        email: 'test@test.com',
        password: 'hashedpassword',
        name: 'Test User',
        role: 'OWNER',
        cabangId: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

      const res = await auth.request('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@test.com', password: 'wrongpassword' }),
      });

      expect(res.status).toBe(401);
    });

    it('should return 401 if user is inactive', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'user-1',
        email: 'test@test.com',
        password: 'hashedpassword',
        name: 'Test User',
        role: 'KASIR',
        cabangId: 'cab-1',
        isActive: false, // inactive
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await auth.request('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@test.com', password: 'password' }),
      });

      expect(res.status).toBe(401);
      const data = await json(res);
      expect(data.error).toBe('Akun Anda tidak aktif');
    });

    it('should return token and user on successful login', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@test.com',
        password: 'hashedpassword',
        name: 'Test User',
        role: 'OWNER' as const,
        cabangId: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        cabang: null,
      };
      
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      const res = await auth.request('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@test.com', password: 'password' }),
      });

      expect(res.status).toBe(200);
      const data = await json(res);
      expect(data.token).toBeDefined();
      expect(data.user).toBeDefined();
      expect(data.user.email).toBe('test@test.com');
      expect(data.user.password).toBeUndefined(); // password should not be returned
    });
  });

  describe('GET /me', () => {
    it('should return 401 without token', async () => {
      const res = await auth.request('/me');
      expect(res.status).toBe(401);
    });

    it('should return user data with valid token', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@test.com',
        password: 'hashedpassword',
        name: 'Test User',
        role: 'OWNER' as const,
        cabangId: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        cabang: null,
      };
      
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
      const token = generateToken('user-1', 'test@test.com', 'OWNER', null);

      const res = await auth.request('/me', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      const data = await json(res);
      expect(data.user).toBeDefined();
    });
  });

  describe('GET /users', () => {
    it('should return 401 without token', async () => {
      const res = await auth.request('/users');
      expect(res.status).toBe(401);
    });

    it('should return 403 for non-owner/manager users', async () => {
      const token = generateToken('user-1', 'kasir@test.com', 'KASIR', 'cab-1');

      const res = await auth.request('/users', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(403);
    });

    it('should return users list for owner', async () => {
      const mockUsers = [
        {
          id: 'user-1',
          email: 'owner@test.com',
          password: 'hashedpassword',
          name: 'Owner',
          role: 'OWNER' as const,
          cabangId: null,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      
      vi.mocked(prisma.user.findMany).mockResolvedValue(mockUsers);
      const token = generateToken('user-1', 'owner@test.com', 'OWNER', null);

      const res = await auth.request('/users', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });
  });
});
