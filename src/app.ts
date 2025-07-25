import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import session from 'express-session';
import passport from 'passport';
import cron from 'node-cron';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import swaggerUi from 'swagger-ui-express';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
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

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// --- CORS Configuration ---
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';

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
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'script-src': ["'self'", 'https://cdn.redoc.ly', "'unsafe-inline'"],
        'font-src': ["'self'", 'https://fonts.gstatic.com'],
        'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        'worker-src': ["'self'", 'blob:'],
        'img-src': ["'self'", 'data:', 'https://online.swagger.io']
      },
    },
  })
);

// --- Rate Limiting ---
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  standardHeaders: true,
  legacyHeaders: false, 
});
app.use('/api', limiter); // Apply to all API routes

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, '../public')));
app.use('/swagger-output.json', express.static(path.join(__dirname, '../swagger-output.json')));

// --- Session and Passport Configuration ---
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
  },
}));

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

// --- API Routes ---
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

// --- Health Check ---
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// --- Cron Job ---
cron.schedule('0 * * * *', async () => {
    try {
      await prisma.bug.deleteMany({ where: { expiresAt: { lt: new Date() } } });
      console.log('Expired bugs cleaned up');
    } catch (error) {
      console.error('Error cleaning up expired bugs:', error);
    }
});

// --- Error Handling ---
app.use(errorHandler);

export default app;
