const jwt = require('jsonwebtoken');
const { getSupabaseClient, isSupabaseConfigured } = require('../Services/supabase');

const JWT_SECRET = process.env.JWT_SECRET || 'cocolabs-super-secret-jwt-key-2024';

// Helper to verify token from Supabase or local JWT fallback
async function verifyToken(token) {
  if (!token) return null;

  // 1. Supabase Auth verification
  if (isSupabaseConfigured()) {
    const supabaseClient = getSupabaseClient();
    if (supabaseClient && supabaseClient.auth) {
      try {
        const { data, error } = await supabaseClient.auth.getUser(token);
        if (!error && data && data.user) {
          return {
            id: data.user.id,
            email: data.user.email,
            name: (data.user.user_metadata && data.user.user_metadata.name) || data.user.email.split('@')[0]
          };
        }
      } catch (err) {
        // Fall through to local verification fallback
      }
    }
  }

  // 2. Fallback local JWT verification (for local dev and test tokens)
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

async function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'Access denied. No authorization header provided.' });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'Access denied. Format must be Bearer <token>.' });
  }

  const user = await verifyToken(parts[1]);
  if (!user) {
    return res.status(401).json({ error: 'Invalid or expired authentication token.' });
  }

  req.user = user;
  next();
}

async function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      const user = await verifyToken(parts[1]);
      if (user) req.user = user;
    }
  }
  next();
}

module.exports = {
  authMiddleware,
  optionalAuth,
  verifyToken,
  JWT_SECRET
};

