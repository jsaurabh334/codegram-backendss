import { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { z } from 'zod';

// Create uploads directory if it doesn't exist
const uploadsDir = 'uploads';
const profileDir = path.join(uploadsDir, 'profiles');
const mediaDir = path.join(uploadsDir, 'media');

// Ensure directories exist
async function ensureDirectories() {
  await fs.mkdir(uploadsDir, { recursive: true });
  await fs.mkdir(profileDir, { recursive: true });
  await fs.mkdir(mediaDir, { recursive: true });
}

ensureDirectories();

// File validation schema
const fileValidation = z.object({
  mimetype: z.string(),
  size: z.number().max(10 * 1024 * 1024), // 10MB limit
});

// Storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadType = req.params.type;
    const dest = uploadType === 'profile' ? profileDir : mediaDir;
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

// File filter
const fileFilter = (req: any, file: any, cb: any) => {
  const allowedTypes = {
    profile: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    media: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm'],
  };

  const uploadType = req.params.type as keyof typeof allowedTypes;
  const allowed = allowedTypes[uploadType] || allowedTypes.media;

  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Allowed: ${allowed.join(', ')}`), false);
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 5, // Max 5 files per request
  },
});

export const uploadFiles = async (req: Request, res: Response) => {
  try {
    const { type } = req.params;
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const uploadedFiles = files.map(file => {
      const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
      return {
        filename: file.filename,
        originalName: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        url: `${baseUrl}/uploads/${type === 'profile' ? 'profiles' : 'media'}/${file.filename}`,
      };
    });

    res.json({
      message: 'Files uploaded successfully',
      files: uploadedFiles,
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
};

export const deleteFile = async (req: Request, res: Response) => {
  try {
    const { type, filename } = req.params;
    const filePath = path.join(
      type === 'profile' ? profileDir : mediaDir,
      filename
    );

    await fs.unlink(filePath);
    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(404).json({ error: 'File not found' });
  }
};