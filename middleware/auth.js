const { verifyToken } = require('../lib/jwt');

const authMiddleware = (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Token tidak ditemukan' });
    }

    const decoded = verifyToken(token);
    
    if (!decoded) {
      return res.status(401).json({ error: 'Token tidak valid' });
    }

    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

const ownerOnly = (req, res, next) => {
  if (req.user.role !== 'OWNER') {
    return res.status(403).json({ error: 'Hanya owner yang bisa akses' });
  }
  next();
};

const ownerOrManager = (req, res, next) => {
  if (req.user.role !== 'OWNER' && req.user.role !== 'MANAGER') {
    return res.status(403).json({ error: 'Akses ditolak' });
  }
  next();
};

module.exports = { authMiddleware, ownerOnly, ownerOrManager };
