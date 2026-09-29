const { createClient } = require('@supabase/supabase-js');
const config = require('../config');

let supabase;

function createSupabaseClient() {
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    if ((process.env.NODE_ENV || 'development') === 'production') {
      console.error('[Supabase] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment');
      process.exit(1);
    }

    console.warn('[Supabase] Supabase credentials not configured; running without live database client');
    return {
      from() {
        return {
          select() { return this; },
          insert() { return this; },
          update() { return this; },
          delete() { return this; },
          eq() { return this; },
          neq() { return this; },
          not() { return this; },
          or() { return this; },
          gt() { return this; },
          gte() { return this; },
          lt() { return this; },
          lte() { return this; },
          in() { return this; },
          is() { return this; },
          order() { return this; },
          limit() { return this; },
          range() { return this; },
          maybeSingle() { return Promise.resolve({ data: null, error: null }); },
          single() { return Promise.resolve({ data: null, error: null }); },
          then(resolve) { return Promise.resolve({ data: null, error: null }).then(resolve); },
        };
      },
      auth: {
        signInWithPassword: async () => ({ data: null, error: null }),
        resetPasswordForEmail: async () => ({ data: null, error: null }),
        admin: {
          updateUserById: async () => ({ data: null, error: null }),
        },
      },
    };
  }

  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${config.supabaseServiceRoleKey}`,
      },
    },
    db: {
      schema: 'public',
    },
    realtime: {
      disabled: true,
    },
  });
}

supabase = createSupabaseClient();

async function testConnection() {
  try {
    const { error } = await supabase.from('users_table').select('id', { count: 'exact', head: true }).limit(1);
    return !error;
  } catch (err) {
    return false;
  }
}

async function ensureConnection() {
  const connected = await testConnection();
  if (!connected) {
    console.warn('[Supabase] Connection test failed, recreating client...');
    supabase = createSupabaseClient();
    const reconnected = await testConnection();
    if (!reconnected) {
      throw new Error('Failed to reconnect to Supabase');
    }
    console.log('[Supabase] Reconnected successfully');
  }
  return supabase;
}

// Ensure connection periodically (every 4 minutes) to catch stale connections
setInterval(() => {
  ensureConnection().catch(err => console.error('[Supabase] Periodic connection check failed:', err.message));
}, 4 * 60 * 1000);

// Export a proxy that maintains backward compatibility
const supabaseProxy = new Proxy({}, {
  get(target, prop) {
    if (prop === 'testConnection' || prop === 'ensureConnection' || prop === 'createSupabaseClient') {
      return target[prop];
    }
    // For all other properties, delegate to the current supabase client
    return supabase[prop];
  },
  set(target, prop, value) {
    if (prop === 'testConnection' || prop === 'ensureConnection' || prop === 'createSupabaseClient') {
      target[prop] = value;
      return true;
    }
    supabase[prop] = value;
    return true;
  }
});

supabaseProxy.testConnection = testConnection;
supabaseProxy.ensureConnection = ensureConnection;
supabaseProxy.createSupabaseClient = createSupabaseClient;

module.exports = supabaseProxy;
