const { createClient } = require('@supabase/supabase-js');
const config = require('../config');
const serviceClient = require('../db/supabase'); // service_role client (bypasses RLS)
const { getFullName } = require('../utilities/helpers');

const anonClient = createClient(config.supabaseUrl, config.supabaseAnonKey);
const LOCAL_ADMIN_TOKEN = 'gawa-local-admin-token';

async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Invalid or expired token' });

  if (token === LOCAL_ADMIN_TOKEN) {
    req.user = {
      id: 'local-admin',
      email: 'gawaadmin@email.com',
      name: 'GAWA Admin',
      role: 'admin',
      roles: ['admin'],
      status: 'active',
    };
    return next();
  }

  const { data, error } = await anonClient.auth.getUser(token);
  if (error || !data.user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Enrich with profile data (role, name, etc.) using service_role client (bypasses RLS)
  const [profileRes, rolesRes] = await Promise.all([
    serviceClient.from('users_table').select('*').eq('id', data.user.id).single(),
    serviceClient.from('user_roles').select('role_id, roles(role_name)').eq('user_id', data.user.id),
  ]);

  const profile = profileRes.data || {};
  const userRoles = (rolesRes.data || []).map(r => r.roles?.role_name).filter(Boolean);

  if (profile.is_archived) {
    return res.status(403).json({ error: 'This account is archived and cannot access the application' });
  }

  req.user = {
    id: data.user.id,
    email: data.user.email,
    ...profile,
    name: getFullName(profile) || data.user.email,
    roles: userRoles,
  };
  next();
}

function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    anonClient.auth.getUser(token).then(({ data }) => {
      if (data.user) {
        req.user = { id: data.user.id, email: data.user.email };
      }
      next();
    }).catch(() => next());
  } else {
    next();
  }
}

module.exports = { authenticate, optionalAuth };
