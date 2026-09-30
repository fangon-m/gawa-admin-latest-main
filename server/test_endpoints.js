const http = require('http');

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const opts = {
      hostname: 'localhost',
      port: 4000,
      path: '/api' + path,
      method,
      headers,
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { resolve({ raw: data, error: 'Parse error' }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  // Login
  console.log('--- LOGIN ---');
  const login = await request('POST', '/auth/login', { email: 'miguel.santos@gawa.ph', password: 'admin123' });
  if (login.error) { console.log('LOGIN FAILED:', login.error); process.exit(1); }
  const token = login.data.token;
  console.log('✓ Login OK');

  const endpoints = [
    { name: 'DASHBOARD', path: '/dashboard/stats' },
    { name: 'USERS', path: '/users?limit=2' },
    { name: 'JOBS', path: '/jobs?limit=2' },
    { name: 'DISPUTES', path: '/disputes?limit=2' },
    { name: 'TRANSACTIONS', path: '/transactions?limit=2' },
    { name: 'VERIFICATIONS', path: '/verifications?limit=2' },
    { name: 'LISTINGS', path: '/listings?limit=2' },
    { name: 'RENTALS', path: '/rentals?limit=2' },
    { name: 'INCIDENTS', path: '/incidents' },
    { name: 'APPEALS', path: '/appeals' },
    { name: 'MESSAGES', path: '/messages' },
    { name: 'CATEGORIES', path: '/categories' },
    { name: 'MODERATION', path: '/moderation' },
    { name: 'GAWA POINTS PACKS', path: '/gawa-points/packs' },
    { name: 'FEE CONFIG', path: '/fee-config' },
    { name: 'QUESTIONS', path: '/questions' },
    { name: 'ASSESSMENTS', path: '/assessments' },
  ];

  let passed = 0;
  let failed = 0;
  const errors = [];

  for (const ep of endpoints) {
    const result = await request('GET', ep.path, null, token);
    if (result.error) {
      console.log(`✗ ${ep.name}: ${result.error}`);
      failed++;
      errors.push(`${ep.name}: ${result.error}`);
    } else {
      const dataLen = result.data ? (
        Array.isArray(result.data) ? `${result.data.length} items` : 'stats object'
      ) : 'ok';
      console.log(`✓ ${ep.name}: ${dataLen}`);
      passed++;
    }
  }

  console.log(`\n--- RESULTS ---`);
  console.log(`✓ Passed: ${passed}/${endpoints.length}`);
  if (errors.length > 0) {
    console.log(`✗ Failed: ${failed}/${endpoints.length}`);
    console.log('\nErrors:');
    errors.forEach(e => console.log(`  - ${e}`));
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => { console.error('TEST ERROR:', err.message); process.exit(1); });
