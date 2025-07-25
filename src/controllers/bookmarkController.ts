import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { z } from 'zod';
import * as notificationService from '../services/notificationService';

const bookmarkSchema = z.object({
  snippetId: z.string().optional(),
  docId: z.string().optional(),
  bugId: z.string().optional(),
}).refine(
  (data) => {
    const targets = [data.snippetId, data.docId, data.bugId].filter(Boolean);
    return targets.length === 1;
  },
  {
    message: 'Bookmark must target exactly one content type',
  }
);


// Toggle bookmark
export const toggleBookmark = async (req: Request, res: Response) => {
  try {
    const validatedData = bookmarkSchema.parse(req.body);
    const userId = (req.user as any).id;
    let contentAuthorId: string | undefined;

    // Verify the target content exists and get its author's ID
    if (validatedData.snippetId) {
      const snippet = await prisma.snippet.findUnique({
        where: { id: validatedData.snippetId },
        select: { authorId: true }
      });
      if (!snippet) {
        return res.status(404).json({ error: 'Snippet not found' });
      }
      contentAuthorId = snippet.authorId;
    }

    if (validatedData.docId) {
      const doc = await prisma.doc.findUnique({
        where: { id: validatedData.docId },
        select: { authorId: true }
      });
      if (!doc) {
        return res.status(404).json({ error: 'Doc not found' });
      }
      contentAuthorId = doc.authorId;
    }

    if (validatedData.bugId) {
      const bug = await prisma.bug.findUnique({
        where: { id: validatedData.bugId },
        select: { authorId: true, expiresAt: true }
      });
      if (!bug) {
        return res.status(404).json({ error: 'Bug not found' });
      }
      if (bug.expiresAt < new Date()) {
        return res.status(410).json({ error: 'Bug report has expired' });
      }
      contentAuthorId = bug.authorId;
    }

    // Check if bookmark already exists
    const existingBookmark = await prisma.bookmark.findFirst({
      where: {
        userId,
        ...validatedData,
      },
    });

    if (existingBookmark) {
      // Remove bookmark
      await prisma.bookmark.delete({
        where: { id: existingBookmark.id },
      });
      res.json({ bookmarked: false, message: 'Bookmark removed successfully' });
    } else {
      // Add bookmark
      await prisma.bookmark.create({
        data: {
          userId,
          ...validatedData,
        },
      });

      // --- Real-time Notification Logic ---
      // Create a notification for the content author
      if (contentAuthorId && contentAuthorId !== userId) {
        await notificationService.createNotification({
            recipientId: contentAuthorId,
            senderId: userId,
            type: 'BOOKMARK',
            ...validatedData
        });
      }

      res.json({ bookmarked: true, message: 'Bookmarked successfully' });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid data', details: error.errors });
    }
    console.error('Error toggling bookmark:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Check if user bookmarked content
export const checkBookmark = async (req: Request, res: Response) => {
  try {
    const { snippetId, docId, bugId } = req.query;
    const userId = (req.user as any).id;

    if (!snippetId && !docId && !bugId) {
      return res.status(400).json({ error: 'Content ID is required' });
    }

    const where: any = { userId };
    if (snippetId) where.snippetId = snippetId as string;
    if (docId) where.docId = docId as string;
    if (bugId) where.bugId = bugId as string;

    const bookmark = await prisma.bookmark.findFirst({ where });

    res.json({ bookmarked: !!bookmark });
  } catch (error) {
    console.error('Error checking bookmark status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get user's bookmarked content
export const getUserBookmarks = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { type = 'all', page = '1', limit = '10' } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const where: any = { userId };

    if (type === 'snippets') where.snippetId = { not: null };
    if (type === 'docs') where.docId = { not: null };
    if (type === 'bugs') where.bugId = { not: null };

    const [bookmarks, total] = await Promise.all([
      prisma.bookmark.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          snippet: {
            include: {
              author: {
                select: {
                  id: true,
                  username: true,
                  name: true,
                  avatar: true,
                },
              },
              _count: {
                select: {
                  likes: true,
                  comments: true,
                  bookmarks: true,
                },
              },
            },
          },
          doc: {
            include: {
              author: {
                select: {
                  id: true,
                  username: true,
                  name: true,
                  avatar: true,
                },
              },
              _count: {
                select: {
                  likes: true,
                  comments: true,
                  bookmarks: true,
                },
              },
            },
          },
          bug: {
            include: {
              author: {
                select: {
                  id: true,
                  username: true,
                  name: true,
                  avatar: true,
                },
              },
              _count: {
                select: {
                  likes: true,
                  comments: true,
                  bookmarks: true,
                },
              },
            },
          },
        },
      }),
      prisma.bookmark.count({ where }),
    ]);

    res.json({
      bookmarks,
      total,
      pages: Math.ceil(total / limitNum),
      currentPage: pageNum,
    });
  } catch (error) {
    console.error('Error fetching user bookmarks:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
