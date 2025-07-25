import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import { env } from '../config/environment';
import { logger } from '../utils/logger';

// Enhanced rate limiting for different endpoints
export const authLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: 5, // 5 attempts per window
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  onLimitReached: (req) => {
    logger.warn('Auth rate limit reached:', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });
  },
});

export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 uploads per hour
  message: 'Upload limit exceeded, please try again later.',
  onLimitReached: (req) => {
    logger.warn('Upload rate limit reached:', {
      ip: req.ip,
      userId: (req.user as any)?.id,
    });
  },
});

export const apiLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
});

// Per-user rate limiting for content creation
export const createContentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // 50 content items per hour per user
  keyGenerator: (req) => {
    const user = req.user as any;
    return user ? `user:${user.id}` : req.ip;
  },
  message: 'Content creation limit exceeded, please try again later.',
  onLimitReached: (req) => {
    logger.warn('Content creation rate limit reached:', {
      userId: (req.user as any)?.id,
      ip: req.ip,
    });
  },
});

// Content Security Policy enhancement
export const enhancedCSP = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
      scriptSrc: ["'self'", 'https://cdn.redoc.ly'],
      connectSrc: ["'self'", 'wss:', 'ws:'],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
};

// Input sanitization middleware
export const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
  // Basic XSS protection for string inputs
  const sanitize = (obj: any): any => {
    if (typeof obj === 'string') {
      // More comprehensive XSS protection
      return obj
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '')
        .trim();
    }
    if (typeof obj === 'object' && obj !== null) {
      for (const key in obj) {
        obj[key] = sanitize(obj[key]);
      }
    }
    return obj;
  };

  if (req.body) req.body = sanitize(req.body);
  if (req.query) req.query = sanitize(req.query);
  if (req.params) req.params = sanitize(req.params);
  
  next();
};

// Pagination validation middleware
export const validatePagination = (req: Request, res: Response, next: NextFunction) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 10, 50); // Max 50 items

  if (page < 1) {
    return res.status(400).json({ error: 'Page must be greater than 0' });
  }

  if (limit < 1 || limit > 50) {
    return res.status(400).json({ error: 'Limit must be between 1 and 50' });
  }

  req.query.page = page.toString();
  req.query.limit = limit.toString();
  
  next();
};