import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { Snippet, Doc, Bug, Like, Bookmark, User } from '@prisma/client';

// --- Helper types for Prisma query results ---

// Base type for the author object included in queries
type AuthorInfo = {
  id: string;
  username: string;
  name: string | null;
  avatar: string | null;
};

// Base type for the counts included in queries
type ContentCounts = {
  _count: {
    likes: number;
    comments: number;
    bookmarks: number;
  };
};

// Base type for user interactions
type UserInteractions = {
  likes: { id: string }[];
  bookmarks: { id: string }[];
};

// Combined types for each content model returned from Prisma
type PrismaSnippet = Snippet & ContentCounts & UserInteractions & { author: AuthorInfo };
type PrismaDoc = Doc & ContentCounts & UserInteractions & { author: AuthorInfo };
type PrismaBug = Bug & ContentCounts & UserInteractions & { author: AuthorInfo };
type PrismaPublicSnippet = Snippet & ContentCounts & { author: AuthorInfo };

// --- Final Feed Item Type ---

// This is the final shape of an item in the feed sent to the client
type FeedItem = (Snippet | Doc | Bug) & {
  type: 'snippet' | 'doc' | 'bug';
  isLiked: boolean;
  isBookmarked: boolean;
  likesCount: number;
  commentsCount: number;
  bookmarksCount: number;
  author: AuthorInfo;
};


export const getFeed = async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    // Get users that the current user follows
    const following = await prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    });

    const followingIds = following.map((f: { followingId: string }) => f.followingId);
    followingIds.push(userId); // Include user's own content

    // Get mixed content from followed users
    const [snippets, docs, bugs] = await Promise.all([
      prisma.snippet.findMany({
        where: { authorId: { in: followingIds }, isPublic: true },
        include: {
          author: { select: { id: true, username: true, name: true, avatar: true } },
          _count: { select: { likes: true, comments: true, bookmarks: true } },
          likes: { where: { userId }, select: { id: true } },
          bookmarks: { where: { userId }, select: { id: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: Math.ceil(limit * 0.7),
      }),
      prisma.doc.findMany({
        where: { authorId: { in: followingIds }, isPublic: true },
        include: {
          author: { select: { id: true, username: true, name: true, avatar: true } },
          _count: { select: { likes: true, comments: true, bookmarks: true } },
          likes: { where: { userId }, select: { id: true } },
          bookmarks: { where: { userId }, select: { id: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: Math.ceil(limit * 0.2),
      }),
      prisma.bug.findMany({
        where: { authorId: { in: followingIds }, expiresAt: { gt: new Date() } },
        include: {
          author: { select: { id: true, username: true, name: true, avatar: true } },
          _count: { select: { likes: true, comments: true, bookmarks: true } },
          likes: { where: { userId }, select: { id: true } },
          bookmarks: { where: { userId }, select: { id: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: Math.ceil(limit * 0.1),
      }),
    ]);

    // Format and combine all content
    const feedItems: FeedItem[] = [
      ...(snippets as PrismaSnippet[]).map((item): FeedItem => ({
        ...item,
        type: 'snippet',
        isLiked: item.likes.length > 0,
        isBookmarked: item.bookmarks.length > 0,
        likesCount: item._count.likes,
        commentsCount: item._count.comments,
        bookmarksCount: item._count.bookmarks,
      })),
      ...(docs as PrismaDoc[]).map((item): FeedItem => ({
        ...item,
        type: 'doc',
        isLiked: item.likes.length > 0,
        isBookmarked: item.bookmarks.length > 0,
        likesCount: item._count.likes,
        commentsCount: item._count.comments,
        bookmarksCount: item._count.bookmarks,
      })),
      ...(bugs as PrismaBug[]).map((item): FeedItem => ({
        ...item,
        type: 'bug',
        isLiked: item.likes.length > 0,
        isBookmarked: item.bookmarks.length > 0,
        likesCount: item._count.likes,
        commentsCount: item._count.comments,
        bookmarksCount: item._count.bookmarks,
      })),
    ];

    // Sort by creation date
    feedItems.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Apply pagination
    const paginatedItems = feedItems.slice(skip, skip + limit);

    // If no followed content, show public content
    if (feedItems.length === 0 && page === 1) {
      const publicSnippets = await prisma.snippet.findMany({
        where: { isPublic: true },
        include: {
          author: { select: { id: true, username: true, name: true, avatar: true } },
          _count: { select: { likes: true, comments: true, bookmarks: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip,
      });

      const publicFeedItems = (publicSnippets as PrismaPublicSnippet[]).map((item): Omit<FeedItem, 'isLiked' | 'isBookmarked'> & {type: 'snippet'} => ({
        ...item,
        type: 'snippet',
        likesCount: item._count.likes,
        commentsCount: item._count.comments,
        bookmarksCount: item._count.bookmarks,
      }));

      return res.json({
        data: publicFeedItems,
        total: publicFeedItems.length,
        page,
        hasMore: publicSnippets.length === limit,
      });
    }

    res.json({
      data: paginatedItems,
      total: feedItems.length,
      page,
      hasMore: feedItems.length > skip + limit,
    });
  } catch (error) {
    console.error('Error fetching feed:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getPublicFeed = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const snippets = await prisma.snippet.findMany({
      where: { isPublic: true },
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
      take: limit,
      skip,
    });

    const feedItems = (snippets as PrismaPublicSnippet[]).map((item): Omit<FeedItem, 'isLiked' | 'isBookmarked'> & {type: 'snippet'} => ({
      ...item,
      type: 'snippet',
      likesCount: item._count.likes,
      commentsCount: item._count.comments,
      bookmarksCount: item._count.bookmarks,
    }));

    res.json({
      data: feedItems,
      total: feedItems.length,
      page,
      hasMore: snippets.length === limit,
    });
  } catch (error) {
    console.error('Error fetching public feed:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
