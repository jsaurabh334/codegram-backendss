import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { z } from 'zod';
import * as notificationService from '../services/notificationService';

const likeSchema = z.object({
  snippetId: z.string().optional(),
  docId: z.string().optional(),
  bugId: z.string().optional(),
}).refine(
  (data) => {
    const targets = [data.snippetId, data.docId, data.bugId].filter(Boolean);
    return targets.length === 1;
  },
  {
    message: 'Like must target exactly one content type',
  }
);


// Toggle like
export const toggleLike = async (req: Request, res: Response) => {
  try {
    const validatedData = likeSchema.parse(req.body);
    const userId = (req.user as any).id;
    let contentAuthorId: string | undefined;

    // Verify the target content exists
    if (validatedData.snippetId) {
      const snippet = await prisma.snippet.findUnique({
        where: { id: validatedData.snippetId },
      });
      if (!snippet) {
        return res.status(404).json({ error: 'Snippet not found' });
      }
      contentAuthorId = snippet.authorId;
    }

    if (validatedData.docId) {
      const doc = await prisma.doc.findUnique({
        where: { id: validatedData.docId },
      });
      if (!doc) {
        return res.status(404).json({ error: 'Doc not found' });
      }
       contentAuthorId = doc.authorId;
    }

    if (validatedData.bugId) {
      const bug = await prisma.bug.findUnique({
        where: { id: validatedData.bugId },
      });
      if (!bug) {
        return res.status(404).json({ error: 'Bug not found' });
      }
      if (bug.expiresAt < new Date()) {
        return res.status(410).json({ error: 'Bug report has expired' });
      }
       contentAuthorId = bug.authorId;
    }

    // Check if like already exists
    const existingLike = await prisma.like.findFirst({
      where: {
        userId,
        ...validatedData,
      },
    });

    if (existingLike) {
      // Unlike
      await prisma.like.delete({
        where: { id: existingLike.id },
      });
      res.json({ liked: false, message: 'Unliked successfully' });
    } else {
      // Like
      await prisma.like.create({
        data: {
          userId,
          ...validatedData,
        },
      });

      // Create notification
      if (contentAuthorId) {
        await notificationService.createNotification({
            recipientId: contentAuthorId,
            senderId: userId,
            type: 'LIKE',
            ...validatedData
        });
      }

      res.json({ liked: true, message: 'Liked successfully' });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid data', details: error.errors });
    }
    console.error('Error toggling like:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Check if user liked content
export const checkLike = async (req: Request, res: Response) => {
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

    const like = await prisma.like.findFirst({ where });

    res.json({ liked: !!like });
  } catch (error) {
    console.error('Error checking like status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get user's liked content
export const getUserLikes = async (req: Request, res: Response) => {
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

    const [likes, total] = await Promise.all([
      prisma.like.findMany({
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
      prisma.like.count({ where }),
    ]);

    res.json({
      likes,
      total,
      pages: Math.ceil(total / limitNum),
      currentPage: pageNum,
    });
  } catch (error) {
    console.error('Error fetching user likes:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
