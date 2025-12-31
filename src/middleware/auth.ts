import { Context, Next } from 'hono';
import { verifyToken } from '../lib/jwt.js';

export interface AuthUser {
  userId: string;
  email: string;
  role: string;
  cabangId: string | null;
}

// Extend Hono's Context with user
declare module 'hono' {
  interface ContextVariableMap {
    user: AuthUser;
  }
}

export const authMiddleware = async (c: Context, next: Next): Promise<Response | void> => {
  try {
    const authHeader = c.req.header('Authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return c.json({ error: 'Token tidak ditemukan' }, 401);
    }

    const decoded = verifyToken(token);

    if (!decoded) {
      return c.json({ error: 'Token tidak valid' }, 401);
    }

    c.set('user', decoded);
    await next();
  } catch {
    return c.json({ error: 'Unauthorized' }, 401);
  }
};

export const ownerOnly = async (c: Context, next: Next): Promise<Response | void> => {
  const user = c.get('user');
  if (user.role !== 'OWNER') {
    return c.json({ error: 'Hanya owner yang bisa akses' }, 403);
  }
  await next();
};

export const ownerOrManager = async (c: Context, next: Next): Promise<Response | void> => {
  const user = c.get('user');
  if (user.role !== 'OWNER' && user.role !== 'MANAGER') {
    return c.json({ error: 'Akses ditolak' }, 403);
  }
  await next();
};
