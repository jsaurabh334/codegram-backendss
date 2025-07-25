import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { z } from 'zod';

const searchSchema = z.object({
  query: z.string().min(1).max(100).optional(), // Make query optional for trending
  type: z.enum(['all', 'users', 'snippets', 'docs', 'bugs', 'trending']).default('all'), // Add 'trending'
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(10),
  tags: z.string().optional(),
  language: z.string().optional(),
  sortBy: z.enum(['relevance', 'newest', 'oldest', 'popular']).default('relevance'),
});

const getOrderBy = (sortBy: string) => {
  switch (sortBy) {
    case 'newest':
      return { createdAt: 'desc' as const };
    case 'oldest':
      return { createdAt: 'asc' as const };
    case 'popular':
      return { likes: { _count: 'desc' as const } };
    default:
      return { createdAt: 'desc' as const };
  }
};

export const searchAll = async (req: Request, res: Response) => {
  try {
    const { query, type, page, limit, tags, language, sortBy } = searchSchema.parse(req.query);
    
    // If type is trending, redirect to getTrending
    if (type === 'trending') {
      return getTrending(req, res);
    }

    // If no query provided for regular search, return empty results
    if (!query) {
      return res.json({
        query: '',
        type,
        results: {},
        pagination: {
          page,
          limit,
          total: 0,
        },
      });
    }

    const skip = (page - 1) * limit;

    const searchCondition = {
      OR: [
        { title: { contains: query, mode: 'insensitive' as const } },
        { description: { contains: query, mode: 'insensitive' as const } },
        { content: { contains: query, mode: 'insensitive' as const } },
      ],
    };

    const tagCondition = tags ? { tags: { hasSome: tags.split(',') } } : {};
    const languageCondition = language ? { language: { equals: language, mode: 'insensitive' as const } } : {};

    const orderBy = getOrderBy(sortBy);

    let results: any = {};

    if (type === 'all' || type === 'users') {
      const userCondition = {
        OR: [
          { username: { contains: query, mode: 'insensitive' as const } },
          { name: { contains: query, mode: 'insensitive' as const } },
          { bio: { contains: query, mode: 'insensitive' as const } },
        ],
        isBlocked: false,
      };

      const [users, userCount] = await Promise.all([
        prisma.user.findMany({
          where: userCondition,
          skip: type === 'users' ? skip : 0,
          take: type === 'users' ? limit : 5,
          select: {
            id: true,
            username: true,
            name: true,
            bio: true,
            avatar: true,
            techStack: true,
            _count: {
              select: {
                followers: true,
                snippets: true,
                docs: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
        type === 'users' ? prisma.user.count({ where: userCondition }) : Promise.resolve(0),
      ]);

      results.users = { data: users, total: userCount };
    }

    if (type === 'all' || type === 'snippets') {
      const snippetCondition = {
        ...searchCondition,
        ...tagCondition,
        ...languageCondition,
        isPublic: true,
      };

      const [snippets, snippetCount] = await Promise.all([
        prisma.snippet.findMany({
          where: snippetCondition,
          skip: type === 'snippets' ? skip : 0,
          take: type === 'snippets' ? limit : 5,
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
          orderBy,
        }),
        type === 'snippets' ? prisma.snippet.count({ where: snippetCondition }) : Promise.resolve(0),
      ]);

      results.snippets = { data: snippets, total: snippetCount };
    }

    if (type === 'all' || type === 'docs') {
      const docCondition = {
        ...searchCondition,
        ...tagCondition,
        isPublic: true,
      };

      const [docs, docCount] = await Promise.all([
        prisma.doc.findMany({
          where: docCondition,
          skip: type === 'docs' ? skip : 0,
          take: type === 'docs' ? limit : 5,
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
          orderBy,
        }),
        type === 'docs' ? prisma.doc.count({ where: docCondition }) : Promise.resolve(0),
      ]);

      results.docs = { data: docs, total: docCount };
    }

    if (type === 'all' || type === 'bugs') {
      const bugCondition = {
        ...searchCondition,
        ...tagCondition,
        expiresAt: { gt: new Date() },
      };

      const [bugs, bugCount] = await Promise.all([
        prisma.bug.findMany({
          where: bugCondition,
          skip: type === 'bugs' ? skip : 0,
          take: type === 'bugs' ? limit : 5,
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
              },
            },
          },
          orderBy,
        }),
        type === 'bugs' ? prisma.bug.count({ where: bugCondition }) : Promise.resolve(0),
      ]);

      results.bugs = { data: bugs, total: bugCount };
    }

    res.json({
      query,
      type,
      results,
      pagination: {
        page,
        limit,
        total: Object.values(results).reduce((sum: number, result: any) => sum + (result.total || 0), 0),
      },
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
};

export const getTrending = async (req: Request, res: Response) => {
  try {
    const { type = 'all', limit = 10 } = req.query;
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    let results: any = {};

    if (type === 'all' || type === 'snippets') {
      const trendingSnippets = await prisma.snippet.findMany({
        where: {
          isPublic: true,
          createdAt: { gte: weekAgo },
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
        take: Number(limit),
        orderBy: [
          { likes: { _count: 'desc' } },
          { comments: { _count: 'desc' } },
          { createdAt: 'desc' },
        ],
      });

      results.snippets = trendingSnippets;
    }

    if (type === 'all' || type === 'docs') {
      const trendingDocs = await prisma.doc.findMany({
        where: {
          isPublic: true,
          createdAt: { gte: weekAgo },
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
        take: Number(limit),
        orderBy: [
          { likes: { _count: 'desc' } },
          { comments: { _count: 'desc' } },
          { createdAt: 'desc' },
        ],
      });

      results.docs = trendingDocs;
    }

    if (type === 'all' || type === 'bugs') {
      const trendingBugs = await prisma.bug.findMany({
        where: {
          expiresAt: { gt: new Date() },
          createdAt: { gte: weekAgo },
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
            },
          },
        },
        take: Number(limit),
        orderBy: [
          { likes: { _count: 'desc' } },
          { comments: { _count: 'desc' } },
          { createdAt: 'desc' },
        ],
      });

      results.bugs = trendingBugs;
    }

    res.json({ type, results });
  } catch (error) {
    console.error('Trending error:', error);
    res.status(500).json({ error: 'Failed to fetch trending content' });
  }
};

export const getTags = async (req: Request, res: Response) => {
  try {
    const { limit = 20 } = req.query;

    const [snippetTags, docTags, bugTags] = await Promise.all([
      prisma.snippet.findMany({
        where: { isPublic: true },
        select: { tags: true },
      }),
      prisma.doc.findMany({
        where: { isPublic: true },
        select: { tags: true },
      }),
      prisma.bug.findMany({
        where: { expiresAt: { gt: new Date() } },
        select: { tags: true },
      }),
    ]);

    // Flatten and count all tags
    const allTags: string[] = [];
    
    [...snippetTags, ...docTags, ...bugTags].forEach(item => {
      if (item.tags) {
        allTags.push(...item.tags);
      }
    });

    // Count tag frequencies
    const tagCounts = allTags.reduce((acc: Record<string, number>, tag: string) => {
      acc[tag] = (acc[tag] || 0) + 1;
      return acc;
    }, {});

    // Convert to array and sort by frequency
    const popularTags = Object.entries(tagCounts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, Number(limit));

    res.json({ tags: popularTags });
  } catch (error) {
    console.error('Tags error:', error);
    res.status(500).json({ error: 'Failed to fetch tags' });
  }
};