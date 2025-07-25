import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import session from 'express-session';
import passport from 'passport';
import cron from 'node-cron';
import path from 'path';
import { fileURLToPath } from 'url';
import swaggerUi from 'swagger-ui-express';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import { authLimiter, uploadLimiter, apiLimiter, enhancedCSP, sanitizeInput, validatePagination } from './middlewares/securityMiddleware';
import { env, getSessionConfig } from './config/environment';
import { checkDatabaseHealth } from './config/db';
import { logger } from './utils/logger';
const swaggerFile = JSON.parse(fs.readFileSync('./swagger-output.json', 'utf-8'));

import { prisma } from './config/db';
import { configurePassport } from './config/passport';
import { errorHandler } from './middlewares/errorHandler';

import authRoutes from './routes/authRoutes';
import userRoutes from './routes/userRoutes';
import snippetRoutes from './routes/snippetRoutes';
import docRoutes from './routes/docRoutes';
import bugRoutes from './routes/bugRoutes';
import commentRoutes from './routes/commentRoutes';
import likeRoutes from './routes/likeRoutes';
import bookmarkRoutes from './routes/bookmarkRoutes';
import followRoutes from './routes/followRoutes';
import searchRoutes from './routes/searchRoutes';
import uploadRoutes from './routes/uploadRoutes';
import moderationRoutes from './routes/moderationRoutes';
import settingsRoutes from './routes/settingsRoutes';
import feedRoutes from './routes/feedRoutes';
import notificationRoutes from './routes/notificationRoutes';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// --- CORS Configuration ---
const frontendUrl = env.FRONTEND_URL;
const backendUrl = env.BACKEND_URL;

const whitelist = [frontendUrl, backendUrl];

interface CorsCallback {
  (err: Error | null, allow?: boolean): void;
}

interface CorsOptions {
  origin: (origin: string | undefined, callback: CorsCallback) => void;
  credentials: boolean;
  methods: string[];
}

const corsOptions: CorsOptions = {
  origin: (origin: string | undefined, callback: CorsCallback) => {
    if (!origin || whitelist.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      logger.warn('CORS blocked request from origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
};

app.options('*', cors(corsOptions));
app.use(cors(corsOptions));

// --- Security Middleware ---
app.use(
  helmet(enhancedCSP)
);

// --- Enhanced Rate Limiting ---
app.use('/api', apiLimiter);
app.use('/api/auth', authLimiter);
app.use('/api/upload', uploadLimiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(sanitizeInput);

app.use(express.static(path.join(__dirname, '../public')));
app.use('/swagger-output.json', express.static(path.join(__dirname, '../swagger-output.json')));

// --- Session and Passport Configuration ---
app.use(session(getSessionConfig()));

configurePassport(passport);
app.use(passport.initialize());
app.use(passport.session());

// --- API Docs ---
app.get('/api-docs', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/redoc.html'));
});

const swaggerUiOptions = {
  customSiteTitle: "CodeGram API - Interactive Docs",
  swaggerOptions: {
    persistAuthorization: true,
  },
};
app.use('/api-docs-ui', swaggerUi.serve, swaggerUi.setup(swaggerFile, swaggerUiOptions));

// --- Health Check with Database ---
app.get('/health', async (req, res) => {
  const dbHealthy = await checkDatabaseHealth();
  const status = dbHealthy ? 'OK' : 'UNHEALTHY';
  const statusCode = dbHealthy ? 200 : 503;
  
  res.status(statusCode).json({ 
    status,
    timestamp: new Date().toISOString(),
    database: dbHealthy ? 'connected' : 'disconnected',
    environment: env.NODE_ENV,
  });
});
// --- API Routes ---
// Add pagination validation to routes that need it
app.use('/api/snippets', validatePagination);
app.use('/api/docs', validatePagination);
app.use('/api/bugs', validatePagination);
app.use('/api/feed', validatePagination);

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/snippets', snippetRoutes);
app.use('/api/docs', docRoutes);
app.use('/api/bugs', bugRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/likes', likeRoutes);
app.use('/api/bookmarks', bookmarkRoutes);
app.use('/api/follows', followRoutes);
app.use('/api/feed', feedRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/moderation', moderationRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/notifications', notificationRoutes);

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));


// --- Distributed Cron Job (only run on primary instance) ---
const isPrimaryInstance = process.env.PRIMARY_INSTANCE === 'true' || env.NODE_ENV === 'development';

if (isPrimaryInstance) {
  cron.schedule('0 * * * *', async () => {
    try {
      await prisma.bug.deleteMany({ where: { expiresAt: { lt: new Date() } } });
      logger.info('Expired bugs cleaned up');
    } catch (error) {
      logger.error('Error cleaning up expired bugs:', error);
    }
  });
  logger.info('Cron jobs initialized on primary instance');
} else {
  logger.info('Cron jobs skipped on secondary instance');
}

// --- Error Handling ---
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await prisma.$disconnect();
  process.exit(0);
});
export default app;
