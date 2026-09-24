const { createClient } = require('@supabase/supabase-js');

let cachedAnonClient = null;
let cachedAdminClient = null;

function getCleanSupabaseUrl() {
  let url = process.env.SUPABASE_URL;
  if (!url) return null;
  return url.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
}

function getSupabaseClient() {
  if (cachedAnonClient) return cachedAnonClient;

  const supabaseUrl = getCleanSupabaseUrl();
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (supabaseUrl && anonKey) {
    try {
      cachedAnonClient = createClient(supabaseUrl, anonKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      });
      return cachedAnonClient;
    } catch (err) {
      console.warn('[Supabase] Failed to initialize Supabase client:', err.message);
      return null;
    }
  }
  return null;
}

function getAdminClient() {
  if (cachedAdminClient) return cachedAdminClient;

  const supabaseUrl = getCleanSupabaseUrl();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && serviceKey) {
    try {
      cachedAdminClient = createClient(supabaseUrl, serviceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      });
      return cachedAdminClient;
    } catch (err) {
      return null;
    }
  }
  return null;
}

function isSupabaseConfigured() {
  return !!getSupabaseClient();
}

module.exports = {
  get supabase() {
    return getSupabaseClient();
  },
  get adminSupabase() {
    return getAdminClient();
  },
  getSupabaseClient,
  getAdminClient,
  isSupabaseConfigured
};
