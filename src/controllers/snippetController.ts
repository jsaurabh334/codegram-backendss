import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { z } from 'zod';
import { emitToFollowers } from '../socket';
import { Snippet, Like, Bookmark } from '@prisma/client';
import { logger } from '../utils/logger';
import { cache } from '../utils/cache';

// Type for the author object included in queries
type AuthorInfo = {
  id: string;
  username: string;
  name: string | null;
  avatar: string | null;
  bio: string | null;
};

// Type for content counts
type ContentCounts = {
  _count: {
    likes: number;
    comments: number;
    bookmarks: number;
  };
};

// Type for user interactions (likes, bookmarks)
type UserInteractions = {
  likes: Like[];
  bookmarks: Bookmark[];
};

// Combined type for a snippet returned from a list query
type SnippetFromList = Snippet & ContentCounts & Partial<UserInteractions> & {
  author: AuthorInfo;
};

// Combined type for a single snippet with full details
type SnippetWithDetails = Snippet & ContentCounts & Partial<UserInteractions> & {
  author: AuthorInfo & {
    _count: {
      snippets: number;
      followers: number;
      following: number;
    };
  };
};

// Type for a snippet returned in the trending list
type TrendingSnippet = Snippet & ContentCounts & {
  author: Omit<AuthorInfo, 'bio'>;
};


const snippetSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().optional(),
  content: z.string().min(1),
  language: z.string().min(1),
  tags: z.array(z.string()).default([]),
  isPublic: z.boolean().default(true),
});

// Update schema with field whitelisting
const snippetUpdateSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  content: z.string().min(1).optional(),
  language: z.string().min(1).optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
  isPublic: z.boolean().optional(),
});

// Search validation schema
const searchSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(10),
  search: z.string().max(100).optional(),
  tags: z.string().max(200).optional(),
  language: z.string().max(50).optional(),
  sort: z.enum(['recent', 'popular', 'liked', 'commented']).default('recent'),
});

// Get all snippets with pagination
export const getAllSnippets = async (req: Request, res: Response) => {
  try {
    // Validate query parameters
    const validatedQuery = searchSchema.parse(req.query);
    const { page, limit, search, tags, language, sort: sortBy } = validatedQuery;
    const skip = (page - 1) * limit;

    // Create cache key
    const cacheKey = `snippets:${JSON.stringify(validatedQuery)}:${(req.user as any)?.id || 'anonymous'}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const where: any = { isPublic: true };

    // Search functionality
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Filter by tags
    if (tags) {
      const tagArray = tags.split(',').map(tag => tag.trim()).filter(Boolean);
      if (tagArray.length > 0) {
        where.tags = { hasSome: tagArray };
      }
    }

    // Filter by language
    if (language) {
      where.language = { equals: language, mode: 'insensitive' };
    }

    // Sorting options
    let orderBy: any = { createdAt: 'desc' }; // default
    
    switch (sortBy) {
      case 'popular':
        orderBy = [
          { likes: { _count: 'desc' } },
          { createdAt: 'desc' }
        ];
        break;
      case 'liked':
        orderBy = { likes: { _count: 'desc' } };
        break;
      case 'commented':
        orderBy = [
          { comments: { _count: 'desc' } },
          { createdAt: 'desc' }
        ];
        break;
      case 'recent':
      default:
        orderBy = { createdAt: 'desc' };
        break;
    }

    const [snippets, total] = await Promise.all([
      prisma.snippet.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          author: {
            select: {
              id: true,
              username: true,
              name: true,
              avatar: true,
              bio: true,
            },
          },
          _count: {
            select: {
              likes: true,
              comments: true,
              bookmarks: true,
            },
          },
          // Include user interactions if authenticated
          ...(req.user ? {
            likes: {
              where: { userId: (req.user as any).id },
              select: { id: true },
            },
            bookmarks: {
              where: { userId: (req.user as any).id },
              select: { id: true },
            },
          } : {}),
        },
      }),
      prisma.snippet.count({ where }),
    ]);

    // Format snippets with interaction status
    const formattedSnippets = (snippets as SnippetFromList[]).map((snippet) => ({
      ...snippet,
      isLiked: snippet.likes ? snippet.likes.length > 0 : false,
      isBookmarked: snippet.bookmarks ? snippet.bookmarks.length > 0 : false,
      likesCount: snippet._count.likes,
      commentsCount: snippet._count.comments,
      bookmarksCount: snippet._count.bookmarks,
      // Remove the likes/bookmarks arrays from response
      likes: undefined,
      bookmarks: undefined,
    }));

    const result = {
      snippets: formattedSnippets,
      total,
      pages: Math.ceil(total / limit),
      currentPage: page,
      hasMore: skip + limit < total,
    };

    // Cache the result for 5 minutes
    cache.set(cacheKey, result, 5 * 60 * 1000);

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
        }))
      });
    }
    console.error('Error fetching snippets:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get single snippet
export const getSnippetById = async (req: Request, res: Response) => {
  try {
    const snippetId = req.params.id;
    const userId = (req.user as any)?.id;

    const snippet = await prisma.snippet.findUnique({
      where: { id: snippetId },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            name: true,
            avatar: true,
            bio: true,
            _count: {
              select: {
                snippets: true,
                followers: true,
                following: true,
              },
            },
          },
        },
        _count: {
          select: {
            likes: true,
            comments: true,
            bookmarks: true,
          },
        },
        // Include user interactions if authenticated
        ...(userId ? {
          likes: {
            where: { userId },
            select: { id: true },
          },
          bookmarks: {
            where: { userId },
            select: { id: true },
          },
        } : {}),
      },
    });

    if (!snippet) {
      return res.status(404).json({ error: 'Snippet not found' });
    }

    // Check access permissions
    if (!snippet.isPublic && snippet.authorId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get related snippets
    const relatedSnippets = await prisma.snippet.findMany({
      where: {
        AND: [
          { id: { not: snippetId } },
          { isPublic: true },
          {
            OR: [
              { language: snippet.language },
              { tags: { hasSome: snippet.tags } },
              { authorId: snippet.authorId },
            ],
          },
        ],
      },
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
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    const snippetWithInteractions = snippet as SnippetWithDetails;

    // Format response
    const formattedSnippet = {
      ...snippet,
      isLiked: snippetWithInteractions.likes ? snippetWithInteractions.likes.length > 0 : false,
      isBookmarked: snippetWithInteractions.bookmarks ? snippetWithInteractions.bookmarks.length > 0 : false,
      likesCount: snippet._count.likes,
      commentsCount: snippet._count.comments,
      bookmarksCount: snippet._count.bookmarks,
      relatedSnippets,
      // Remove the likes/bookmarks arrays from response
      likes: undefined,
      bookmarks: undefined,
    };

    res.json(formattedSnippet);
  } catch (error) {
    console.error('Error fetching snippet:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Create snippet
export const createSnippet = async (req: Request, res: Response) => {
  try {
    const validatedData = snippetSchema.parse(req.body);
    const userId = (req.user as any).id;
    
    // Clean and validate tags
    const cleanTags = validatedData.tags
      .map(tag => tag.trim().toLowerCase())
      .filter(tag => tag.length > 0 && tag.length <= 50)
      .slice(0, 10); // Limit to 10 tags

    const snippet = await prisma.snippet.create({
      data: {
        ...validatedData,
        tags: cleanTags,
        authorId: userId,
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            name: true,
            avatar: true,
            bio: true,
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
    });

    // --- Real-time Logic ---
    // Emit event to followers for real-time feed update
    if (snippet.isPublic) {
        emitToFollowers(userId, 'new-snippet', snippet);
    }

    // Format response
    const formattedSnippet = {
      ...snippet,
      isLiked: false,
      isBookmarked: false,
      likesCount: 0,
      commentsCount: 0,
      bookmarksCount: 0,
    };

    res.status(201).json(formattedSnippet);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid data', 
        details: error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
        }))
      });
    }
    console.error('Error creating snippet:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Update snippet
export const updateSnippet = async (req: Request, res: Response) => {
  try {
    const snippetId = req.params.id;
    const userId = (req.user as any).id;

    const snippet = await prisma.snippet.findUnique({
      where: { id: snippetId },
    });

    if (!snippet) {
      return res.status(404).json({ error: 'Snippet not found' });
    }

    if (snippet.authorId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Use update schema with field whitelisting
    const validatedData = snippetUpdateSchema.parse(req.body);
    
    // Clean and validate tags
    let cleanTags = snippet.tags; // Keep existing tags if not updating
    if (validatedData.tags) {
      cleanTags = validatedData.tags
        .map(tag => tag.trim().toLowerCase())
        .filter(tag => tag.length > 0 && tag.length <= 50)
        .slice(0, 10); // Limit to 10 tags
    }
    
    const updatedSnippet = await prisma.snippet.update({
      where: { id: snippetId },
      data: {
        ...validatedData,
        tags: cleanTags,
        updatedAt: new Date(),
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            name: true,
            avatar: true,
            bio: true,
          },
        },
        _count: {
          select: {
            likes: true,
            comments: true,
            bookmarks: true,
          },
        },
        // Include user interactions
        ...(userId ? {
          likes: {
            where: { userId },
            select: { id: true },
          },
          bookmarks: {
            where: { userId },
            select: { id: true },
          },
        } : {}),
      },
    });

    // Clear related cache entries
    cache.delete(`snippet:${snippetId}`);

    const updatedSnippetWithInteractions = updatedSnippet as SnippetWithDetails;

    // Format response
    const formattedSnippet = {
      ...updatedSnippet,
      isLiked: updatedSnippetWithInteractions.likes ? updatedSnippetWithInteractions.likes.length > 0 : false,
      isBookmarked: updatedSnippetWithInteractions.bookmarks ? updatedSnippetWithInteractions.bookmarks.length > 0 : false,
      likesCount: updatedSnippet._count.likes,
      commentsCount: updatedSnippet._count.comments,
      bookmarksCount: updatedSnippet._count.bookmarks,
      // Remove the likes/bookmarks arrays from response
      likes: undefined,
      bookmarks: undefined,
    };

    logger.info('Snippet updated:', {
      snippetId,
      userId,
      title: updatedSnippet.title,
    });

    res.json(formattedSnippet);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid data', 
        details: error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
        }))
      });
    }
    console.error('Error updating snippet:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Delete snippet
export const deleteSnippet = async (req: Request, res: Response) => {
  try {
    const snippetId = req.params.id;
    const userId = (req.user as any).id;

    const snippet = await prisma.snippet.findUnique({
      where: { id: snippetId },
    });

    if (!snippet) {
      return res.status(404).json({ error: 'Snippet not found' });
    }

    if (snippet.authorId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Delete all related data (likes, comments, bookmarks)
    await prisma.$transaction([
      prisma.like.deleteMany({ where: { snippetId } }),
      prisma.bookmark.deleteMany({ where: { snippetId } }),
      prisma.comment.deleteMany({ where: { snippetId } }),
      prisma.snippet.delete({ where: { id: snippetId } }),
    ]);

    res.json({ message: 'Snippet deleted successfully' });
  } catch (error) {
    console.error('Error deleting snippet:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get user's snippets
export const getUserSnippets = async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const currentUserId = (req.user as any)?.id;
    const skip = (page - 1) * limit;

    // Find user
    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const where: any = { 
      authorId: user.id,
      // Show private snippets only to the owner
      ...(currentUserId === user.id ? {} : { isPublic: true }),
    };

    const [snippets, total] = await Promise.all([
      prisma.snippet.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
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
          // Include user interactions if authenticated
          ...(currentUserId ? {
            likes: {
              where: { userId: currentUserId },
              select: { id: true },
            },
            bookmarks: {
              where: { userId: currentUserId },
              select: { id: true },
            },
          } : {}),
        },
      }),
      prisma.snippet.count({ where }),
    ]);

    // Format snippets
    const formattedSnippets = (snippets as SnippetFromList[]).map((snippet) => ({
      ...snippet,
      isLiked: snippet.likes ? snippet.likes.length > 0 : false,
      isBookmarked: snippet.bookmarks ? snippet.bookmarks.length > 0 : false,
      likesCount: snippet._count.likes,
      commentsCount: snippet._count.comments,
      bookmarksCount: snippet._count.bookmarks,
      // Remove the likes/bookmarks arrays from response
      likes: undefined,
      bookmarks: undefined,
    }));

    res.json({
      snippets: formattedSnippets,
      total,
      pages: Math.ceil(total / limit),
      currentPage: page,
      hasMore: skip + limit < total,
    });
  } catch (error) {
    console.error('Error fetching user snippets:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get trending snippets
export const getTrendingSnippets = async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const timeframe = req.query.timeframe as string || 'week'; // day, week, month
    
    let dateFilter = new Date();
    switch (timeframe) {
      case 'day':
        dateFilter.setDate(dateFilter.getDate() - 1);
        break;
      case 'month':
        dateFilter.setMonth(dateFilter.getMonth() - 1);
        break;
      case 'week':
      default:
        dateFilter.setDate(dateFilter.getDate() - 7);
        break;
    }

    const snippets = await prisma.snippet.findMany({
      where: {
        isPublic: true,
        createdAt: { gte: dateFilter },
      },
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
      orderBy: [
        { likes: { _count: 'desc' } },
        { comments: { _count: 'desc' } },
        { createdAt: 'desc' },
      ],
      take: limit,
    });

    // Format snippets
    const formattedSnippets = (snippets as TrendingSnippet[]).map(snippet => ({
      ...snippet,
      likesCount: snippet._count.likes,
      commentsCount: snippet._count.comments,
      bookmarksCount: snippet._count.bookmarks,
    }));

    res.json({ snippets: formattedSnippets });
  } catch (error) {
    console.error('Error fetching trending snippets:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};