const jwt = require('jsonwebtoken');

const generateToken = (userId, email, role, cabangId = null) => {
  return jwt.sign(
    { userId, email, role, cabangId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return null;
  }
};

module.exports = { generateToken, verifyToken };
