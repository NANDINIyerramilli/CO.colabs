const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { authMiddleware, JWT_SECRET } = require('../Middleware/auth');
const { supabase, adminSupabase, isSupabaseConfigured } = require('../Services/supabase');

// Sign up
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();

    // 1. If Supabase Auth is configured
    if (isSupabaseConfigured()) {
      let session = null;
      let authUser = null;

      const requireEmailConfirmation = process.env.REQUIRE_EMAIL_CONFIRMATION === 'true';


      // Auto-verifies any email address immediately without checking if it exists
      if (!requireEmailConfirmation && adminSupabase && adminSupabase.auth && adminSupabase.auth.admin) {
        const { data: adminData, error: adminErr } = await adminSupabase.auth.admin.createUser({
          email: cleanEmail,
          password,
          email_confirm: true,
          user_metadata: { name: cleanName }
        });

        if (adminErr) {
          if (adminErr.message.toLowerCase().includes('already registered') || adminErr.message.toLowerCase().includes('already exists')) {
            return res.status(409).json({ error: 'An account with this email already exists.' });
          }
          return res.status(400).json({ error: adminErr.message });
        }

        // Sign in immediately to acquire the Supabase JWT access token
        const { data: signinData, error: signinErr } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password
        });

        if (signinErr) {
          return res.status(400).json({ error: signinErr.message });
        }

        session = signinData.session;
        authUser = signinData.user;
      } else {
        // Standard Anon Key signup (Enforces real email validation and confirmation)
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: { name: cleanName }
          }
        });

        if (error) {
          return res.status(400).json({ error: error.message });
        }

        session = data.session;
        authUser = data.user;
      }

      // If email confirmation is required and no active session returned yet:
      if (!session) {
        if (authUser && authUser.id) {
          await db.upsertUser({
            id: authUser.id,
            name: cleanName,
            email: cleanEmail
          });
        }

        return res.status(200).json({
          message: 'Account created! Please check your email inbox to confirm your account before logging in.',
          needsEmailConfirmation: true,
          user: { id: authUser ? authUser.id : null, name: cleanName, email: cleanEmail }
        });
      }

      // Sync Supabase user into database for relation and foreign key integrity
      const user = await db.upsertUser({
        id: authUser.id,
        name: (authUser.user_metadata && authUser.user_metadata.name) || cleanName,
        email: cleanEmail
      });

      return res.status(201).json({
        message: 'Account created successfully',
        token: session.access_token,
        user: { id: user.id, name: user.name, email: user.email }
      });
    }

    // 2. Fallback mode (local bcrypt & JWT when Supabase credentials not set)
    const existingUser = await db.findUserByEmail(cleanEmail);
    if (existingUser) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await db.createUser({
      name: cleanName,
      email: cleanEmail,
      passwordHash
    });

    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(201).json({
      message: 'Account created successfully',
      token,
      user: { id: user.id, name: user.name, email: user.email }
    });
  } catch (err) {
    console.error('[Auth] Signup error:', err);
    res.status(500).json({ error: err.message || 'Failed to create account. Please try again.' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();

    // 1. If Supabase Auth is configured
    if (isSupabaseConfigured()) {
      let { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password
      });

      // Auto-verify if user was created earlier but unconfirmed
      if (error && error.message && error.message.toLowerCase().includes('email not confirmed') && adminSupabase?.auth?.admin) {
        try {
          const { data: userList } = await adminSupabase.auth.admin.listUsers();
          const target = userList?.users?.find(u => u.email.toLowerCase() === cleanEmail);
          if (target) {
            await adminSupabase.auth.admin.updateUserById(target.id, { email_confirm: true });
            const retry = await supabase.auth.signInWithPassword({
              email: cleanEmail,
              password
            });
            if (!retry.error) {
              data = retry.data;
              error = null;
            }
          }
        } catch (confirmErr) {
          console.warn('[Auth] Auto-confirm on login error:', confirmErr);
        }
      }

      if (error) {
        return res.status(401).json({ error: error.message || 'Invalid email or password.' });
      }

      const session = data.session;
      const authUser = data.user;

      // Sync Supabase user into database
      const user = await db.upsertUser({
        id: authUser.id,
        name: (authUser.user_metadata && authUser.user_metadata.name) || cleanEmail.split('@')[0],
        email: cleanEmail
      });

      return res.json({
        message: 'Logged in successfully',
        token: session.access_token,
        user: { id: user.id, name: user.name, email: user.email }
      });
    }

    // 2. Fallback mode (local bcrypt & JWT when Supabase credentials not set)
    const user = await db.findUserByEmail(cleanEmail);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({
      message: 'Logged in successfully',
      token,
      user: { id: user.id, name: user.name, email: user.email }
    });
  } catch (err) {
    console.error('[Auth] Login error:', err);
    res.status(500).json({ error: err.message || 'Failed to log in. Please try again.' });
  }
});

// Me (Current user profile)
router.get('/me', authMiddleware, async (req, res) => {
  try {
    let user = await db.findUserById(req.user.id);
    if (!user) {
      user = await db.upsertUser({
        id: req.user.id,
        name: req.user.name,
        email: req.user.email
      });
    }
    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });
  } catch (err) {
    console.error('[Auth] Me error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
