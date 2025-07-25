import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { BugStatus as BugStatusEnum, Like, Bookmark, Bug } from '@prisma/client';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { emitToFollowers } from '../socket';
import * as notificationService from '../services/notificationService';

// --- Type Definitions for Bug Controller ---

type AuthorInfo = {
  id: string;
  username: string;
  name: string | null;
  avatar: string | null;
};

type ContentCounts = {
  _count: {
    likes: number;
    comments: number;
    bookmarks: number;
    views: number;
  };
};

type UserInteractions = {
  likes: Like[];
  bookmarks: Bookmark[];
};

type BugFromList = Bug & ContentCounts & Partial<UserInteractions> & {
  author: AuthorInfo;
};

// Zod schema for bug creation
const bugSchema = z.object({
  title: z.string().min(1, "Title is required").max(100),
  description: z.string().min(1, "Description is required").max(500),
  content: z.string().min(1, "Content is required"),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  tags: z.array(z.string()).default([]),
  media: z.array(z.string()).optional(),
});

// Zod schema for bug status update
const updateStatusSchema = z.object({
    status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']),
});


// Get all active bugs with pagination
export const getAllBugs = asyncHandler(async (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = req.query.search as string;
    const severity = req.query.severity as string;
    const status = req.query.status as string;
    const tags = req.query.tags as string;
    const skip = (page - 1) * limit;
    const currentUserId = (req.user as any)?.id;

    const where: any = {
      expiresAt: { gt: new Date() }, // Only show active bugs
    };

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (severity) where.severity = severity;
    if (status) where.status = status;
    if (tags) where.tags = { hasSome: tags.split(',') };

    const [bugs, total] = await Promise.all([
      prisma.bug.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          author: {
            select: { id: true, username: true, name: true, avatar: true },
          },
          _count: {
            select: { likes: true, comments: true, bookmarks: true, views: true },
          },
          ...(currentUserId ? {
              likes: { where: { userId: currentUserId }, select: { id: true } },
              bookmarks: { where: { userId: currentUserId }, select: { id: true } },
          } : {}),
        },
      }),
      prisma.bug.count({ where }),
    ]);

    const formattedBugs = (bugs as BugFromList[]).map(bug => ({
        ...bug,
        isLiked: bug.likes ? bug.likes.length > 0 : false,
        isBookmarked: bug.bookmarks ? bug.bookmarks.length > 0 : false,
        likesCount: bug._count.likes,
        commentsCount: bug._count.comments,
        bookmarksCount: bug._count.bookmarks,
        viewsCount: bug._count.views,
        likes: undefined,
        bookmarks: undefined,
    }));

    res.json({
      bugs: formattedBugs,
      total,
      pages: Math.ceil(total / limit),
      currentPage: page,
    });
});

// Get single bug
export const getBugById = asyncHandler(async (req: Request, res: Response) => {
    const currentUserId = (req.user as any)?.id;
    const bug = await prisma.bug.findUnique({
      where: { id: req.params.id },
      include: {
        author: {
          select: { id: true, username: true, name: true, avatar: true },
        },
        comments: {
          include: {
            author: {
              select: { id: true, username: true, name: true, avatar: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: { likes: true, comments: true, bookmarks: true, views: true },
        },
        ...(currentUserId ? {
            likes: { where: { userId: currentUserId }, select: { id: true } },
            bookmarks: { where: { userId: currentUserId }, select: { id: true } },
        } : {}),
      },
    });

    if (!bug) {
      return res.status(404).json({ error: 'Bug not found' });
    }

    if (bug.expiresAt < new Date()) {
      return res.status(410).json({ error: 'Bug report has expired' });
    }

    const bugWithInteractions = bug as BugFromList;

    const formattedBug = {
        ...bug,
        isLiked: bugWithInteractions.likes ? bugWithInteractions.likes.length > 0 : false,
        isBookmarked: bugWithInteractions.bookmarks ? bugWithInteractions.bookmarks.length > 0 : false,
        likesCount: bug._count.likes,
        commentsCount: bug._count.comments,
        bookmarksCount: bug._count.bookmarks,
        viewsCount: bug._count.views,
        likes: undefined,
        bookmarks: undefined,
    };

    res.json(formattedBug);
});

// Create bug
export const createBug = asyncHandler(async (req: Request, res: Response) => {
    const validatedData = bugSchema.parse(req.body);
    const userId = (req.user as any).id;
    
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // Bugs expire in 24 hours
    
    const bug = await prisma.bug.create({
      data: {
        ...validatedData,
        authorId: userId,
        expiresAt,
      },
      include: {
        author: {
          select: { id: true, username: true, name: true, avatar: true },
        },
        _count: {
          select: { likes: true, comments: true, bookmarks: true },
        },
      },
    });

    // --- Real-time Feed Logic ---
    emitToFollowers(userId, 'new-bug', bug);

    res.status(201).json(bug);
});

// Update bug status
export const updateBugStatus = asyncHandler(async (req: Request, res: Response) => {
    const { status } = updateStatusSchema.parse(req.body);
    const bugId = req.params.id;
    const currentUserId = (req.user as any).id;
    
    const bug = await prisma.bug.findUnique({
      where: { id: bugId },
    });

    if (!bug) {
      return res.status(404).json({ error: 'Bug not found' });
    }

    if (bug.expiresAt < new Date()) {
      return res.status(410).json({ error: 'Bug report has expired' });
    }

    // Allow only the bug author to change the status
    if (bug.authorId !== currentUserId) {
      return res.status(403).json({ error: 'Access denied: Only the author can change the status.' });
    }

    const updatedBug = await prisma.bug.update({
      where: { id: bugId },
      data: { status: status as BugStatusEnum },
      include: {
        author: {
          select: { id: true, username: true, name: true, avatar: true },
        },
        _count: {
          select: { likes: true, comments: true, bookmarks: true },
        },
      },
    });

    // --- Real-time Notification Logic ---
    // Notify the author that their bug status was updated.
    // This is useful if, in the future, moderators can also change status.
    // We check `bug.authorId !== currentUserId` to prevent self-notifications.
    if (bug.authorId !== currentUserId) {
        await notificationService.createNotification({
            recipientId: bug.authorId,
            senderId: currentUserId,
            type: 'BUG_STATUS_UPDATE',
            bugId: bug.id,
        });
    }

    res.json(updatedBug);
});

// Delete bug
export const deleteBug = asyncHandler(async (req: Request, res: Response) => {
    const bugId = req.params.id;
    const userId = (req.user as any).id;

    const bug = await prisma.bug.findUnique({
      where: { id: bugId },
    });

    if (!bug) {
      return res.status(404).json({ error: 'Bug not found' });
    }

    if (bug.authorId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await prisma.$transaction([
      prisma.like.deleteMany({ where: { bugId } }),
      prisma.bookmark.deleteMany({ where: { bugId } }),
      prisma.comment.deleteMany({ where: { bugId } }),
      prisma.bugView.deleteMany({ where: { bugId } }),
      prisma.bug.delete({ where: { id: bugId } }),
    ]);

    res.json({ message: 'Bug deleted successfully' });
});

// Add bug view
export const addBugView = asyncHandler(async (req: Request, res: Response) => {
    const { bugId } = req.params;
    const userId = (req.user as any).id;

    // Use upsert for a more concise operation
    await prisma.bugView.upsert({
        where: {
            bugId_userId: { bugId, userId },
        },
        update: {}, // Do nothing if it exists
        create: { bugId, userId },
    });

    res.status(200).json({ message: 'Bug view recorded' });
});

// Get bug views
export const getBugViews = asyncHandler(async (req: Request, res: Response) => {
    const { bugId } = req.params;

    const views = await prisma.bugView.findMany({
      where: { bugId },
      include: {
        user: {
          select: { id: true, username: true, avatar: true },
        },
      },
    });

    res.json(views);
});
