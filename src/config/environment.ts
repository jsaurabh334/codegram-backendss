import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Environment validation schema
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),
  
  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  
  // Authentication
  GITHUB_CLIENT_ID: z.string().min(1, 'GITHUB_CLIENT_ID is required'),
  GITHUB_CLIENT_SECRET: z.string().min(1, 'GITHUB_CLIENT_SECRET is required'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  
  // URLs
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  BACKEND_URL: z.string().url().default('http://localhost:3001'),
  BASE_URL: z.string().url().default('http://localhost:3001'),
  
  // Security
  BCRYPT_ROUNDS: z.coerce.number().min(10).max(15).default(12),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),
  
  // File uploads
  UPLOAD_DIR: z.string().default('uploads'),
  MAX_FILE_SIZE: z.coerce.number().default(10485760), // 10MB
  
  // Optional
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  REDIS_URL: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
});

// Validate environment variables
const parseResult = envSchema.safeParse(process.env);

if (!parseResult.success) {
  console.error('❌ Invalid environment variables:');
  parseResult.error.errors.forEach((error) => {
    console.error(`  ${error.path.join('.')}: ${error.message}`);
  });
  process.exit(1);
}

export const env = parseResult.data;

// Database configuration based on environment
export const getDatabaseConfig = () => {
  const baseConfig = {
    datasources: {
      db: {
        url: env.DATABASE_URL,
      },
    },
  };

  if (env.NODE_ENV === 'production') {
    return {
      ...baseConfig,
      // Production-specific Prisma settings
      log: ['error', 'warn'],
      errorFormat: 'minimal' as const,
    };
  }

  return {
    ...baseConfig,
    log: ['query', 'info', 'warn', 'error'],
    errorFormat: 'pretty' as const,
  };
};

// Session configuration
export const getSessionConfig = () => ({
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  name: 'codegram.sid', // Custom session name
  cookie: {
    secure: env.NODE_ENV === 'production', // HTTPS only in production
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    sameSite: env.NODE_ENV === 'production' ? 'strict' as const : 'lax' as const,
  },
});