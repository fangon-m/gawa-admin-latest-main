const dotenv = require('dotenv');
dotenv.config();

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';
const requiredEnvVars = [
  ['JWT_SECRET', 'JWT_SECRET is required. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"'],
  ['SUPABASE_URL', 'SUPABASE_URL is required'],
  ['SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY is required'],
  ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY is required'],
];

for (const [key, message] of requiredEnvVars) {
  if (!process.env[key] && isProduction) {
    console.error(`[Config] Missing required environment variable: ${message}`);
    process.exit(1);
  }
}

const config = {
  port: process.env.PORT || 4000,
  nodeEnv,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiry: process.env.JWT_EXPIRY || '24h',
  corsOrigins: process.env.CORS_ORIGINS || 'http://localhost:3000',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  bcryptSaltRounds: 10,

  // Supabase
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

module.exports = config;
