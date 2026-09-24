const jwt = require('jsonwebtoken');
const { supabase, isSupabaseConfigured } = require('../Services/supabase');

const JWT_SECRET = process.env.JWT_SECRET || 'cocolabs-super-secret-jwt-key-2024';

async function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'Access denied. No authorization header provided.' });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'Access denied. Format must be Bearer <token>.' });
  }

  const token = parts[1];

  // Supabase Auth verification
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data || !data.user) {
        return res.status(401).json({ error: 'Invalid or expired Supabase token.' });
      }

      req.user = {
        id: data.user.id,
        email: data.user.email,
        name: (data.user.user_metadata && data.user.user_metadata.name) || data.user.email.split('@')[0]
      };
      return next();
    } catch (err) {
      console.warn('[AuthMiddleware] Supabase token verification failed:', err.message);
      return res.status(401).json({ error: 'Invalid or expired authentication token.' });
    }
  }

  // Fallback dev / local test mode
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

async function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      const token = parts[1];

      if (isSupabaseConfigured()) {
        try {
          const { data, error } = await supabase.auth.getUser(token);
          if (!error && data && data.user) {
            req.user = {
              id: data.user.id,
              email: data.user.email,
              name: (data.user.user_metadata && data.user.user_metadata.name) || data.user.email.split('@')[0]
            };
          }
        } catch (e) {
          // ignore invalid token for optional auth
        }
      } else {
        try {
          req.user = jwt.verify(token, JWT_SECRET);
        } catch (e) {
          // ignore invalid token for optional auth
        }
      }
    }
  }
  next();
}

module.exports = {
  authMiddleware,
  optionalAuth,
  JWT_SECRET
};
