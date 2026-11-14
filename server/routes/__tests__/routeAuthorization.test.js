process.env.JWT_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

/**
 * The caller is a valid, signed-in consumer account — exactly what a user of
 * the companion mobile app holds. It must never reach an admin endpoint.
 */
jest.mock('../../middleware/auth', () => ({
  authenticate: jest.fn((req, res, next) => {
    req.user = {
      id: 'aaaaaaaa-0000-4000-8000-000000000001',
      email: 'consumer@example.com',
      name: 'Consumer',
      role: null,
      roles: [],
    };
    next();
  }),
  optionalAuth: (req, res, next) => next(),
}));

// A permissive driver so that a route which forgets to authorise reaches its
// controller and returns 200 — which makes the failure obvious.
jest.mock('../../db/supabase', () => {
  function makeChain() {
    let proxy;
    proxy = new Proxy({}, {
      get(target, prop) {
        if (prop === 'then') return (resolve) => resolve({ data: [], error: null, count: 0 });
        if (prop === 'catch') return () => proxy;
        if (prop === 'finally') return () => proxy;
        return () => proxy;
      },
    });
    return proxy;
  }
  return {
    from: () => makeChain(),
    auth: {
      signInWithPassword: async () => ({ data: null, error: null }),
      admin: {
        createUser: async () => ({ data: null, error: null }),
        updateUserById: async () => ({ error: null }),
        deleteUser: async () => ({ error: null }),
      },
    },
    storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'x' }, error: null }) }) },
    testConnection: async () => true,
    ensureConnection: async () => ({}),
  };
});

const express = require('express');
const request = require('supertest');
const { authenticate } = require('../../middleware/auth');
const router = require('../index');

// Endpoints that are intentionally reachable without a staff session.
const PUBLIC_ROUTES = new Set([
  '/auth/login',
  '/auth/accept-invite',
  '/auth/request-reset',
  '/auth/reset-password',
  '/auth/refresh',
  '/health',
]);

const UUID = '11111111-1111-4111-8111-111111111111';

/** Extracts the mount path Express recorded for a sub-router. */
function mountPathOf(layer) {
  const source = layer.regexp?.source || '';
  if (!source.startsWith('^')) return '';
  // Express encodes a mount as "^\/users\/?(?=\/|$)" and a parameterised mount
  // as "^\/matches(?:\/([^/]+?))\/completions\/?(?=\/|$)".
  let body = source.slice(1);
  body = body.replace(/\(\?=\\\/\|\$\)$/, '');
  body = body.replace(/\\\/\?/g, '');
  body = body.replace(/\(\?:\\\/\(\[\^\/\]\+\?\)\)/g, '/:param');
  body = body.replace(/\\\//g, '/');
  body = body.replace(/\/$/, '');
  return body;
}

function joinPath(prefix, sub) {
  const base = prefix.replace(/\/+$/, '');
  const tail = sub === '/' ? '' : sub;
  return `${base}${tail}` || '/';
}

/** Walks the router tree and returns every registered route. */
function collectRoutes(node, prefix = '') {
  const found = [];
  for (const layer of node.stack || []) {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).filter((m) => m !== '_all');
      for (const method of methods) {
        found.push({
          method: method.toUpperCase(),
          path: joinPath(prefix, layer.route.path),
          stack: layer.route.stack,
        });
      }
    } else if (layer.handle?.stack) {
      found.push(...collectRoutes(layer.handle, joinPath(prefix, mountPathOf(layer))));
    }
  }
  return found;
}

/** Turns a route pattern into a concrete request path. */
function concretePath(pattern) {
  return pattern
    .replace(/:entityType/g, 'user')
    .replace(/:[A-Za-z0-9_]+/g, UUID);
}

const routes = collectRoutes(router);

const app = express();
app.use(express.json());
app.use('/api', router);
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

describe('admin route authorization', () => {
  it('finds the admin API routes to audit', () => {
    expect(routes.length).toBeGreaterThan(50);
  });

  it('exposes only the known public endpoints without authentication', () => {
    const unauthenticated = routes
      .filter((route) => !route.stack.some((layer) => layer.handle === authenticate))
      .map((route) => route.path);

    for (const path of unauthenticated) {
      expect(PUBLIC_ROUTES).toContain(path);
    }
  });

  describe.each(routes.filter((route) => route.stack.some((layer) => layer.handle === authenticate)))(
    '$method $path',
    (route) => {
      it('denies a non-staff authenticated caller', async () => {
        const response = await request(app)[route.method.toLowerCase()](
          `/api${concretePath(route.path)}`
        );

        expect(response.status).toBe(403);
      });
    }
  );
});
