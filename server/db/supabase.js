const { createClient } = require('@supabase/supabase-js');
const config = require('../config');

let supabase;

if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
  if ((process.env.NODE_ENV || 'development') === 'production') {
    console.error('[Supabase] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment');
    process.exit(1);
  }

  console.warn('[Supabase] Supabase credentials not configured; running without live database client');
  supabase = {
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
} else {
  supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
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
  });
}

module.exports = supabase;
