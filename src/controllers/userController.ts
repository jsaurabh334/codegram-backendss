import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { asyncHandler } from '../utils/asyncHandler';

// Get user profile by username
export const getUserProfile = asyncHandler(async (req: Request, res: Response) => {
    const { username } = req.params;
    const currentUserId = (req.user as any)?.id;

    const user = await prisma.user.findUnique({
        where: { username },
        include: {
            preferences: true,
            _count: {
                select: {
                    followers: true,
                    following: true,
                    snippets: true,
                    docs: true,
                    bugs: true,
                },
            },
        },
    });

    if (!user) {
        res.status(404);
        throw new Error('User not found');
    }

    const privacy = user.preferences?.privacy as any;

    if (privacy?.profileVisibility === 'private' && user.id !== currentUserId) {
        return res.json({
            user: {
                id: user.id,
                username: user.username,
                avatar: user.avatar,
            },
            isPrivate: true,
        });
    }

    let isFollowing = false;
    let isBlockedByMe = false;

    if (currentUserId) {
        const follow = await prisma.follow.findUnique({
            where: {
                followerId_followingId: {
                    followerId: currentUserId,
                    followingId: user.id,
                },
            },
        });
        isFollowing = !!follow;
        // You can also check for block status here if you have a block model
    }

    const { preferences, ...userProfileData } = user;
    const responsePayload = {
        user: userProfileData,
        isFollowing,
        isBlockedByMe,
        followers: [],
        following: [],
        snippets: [],
        docs: [],
        bugs: [],
    };

    res.status(200).json(responsePayload);
});

// Update user profile
export const updateUserProfile = asyncHandler(async (req: Request, res: Response) => {
    // Validate and sanitize input as needed
    const allowedFields = ['name', 'bio', 'website', 'location', 'techStack', 'gender'];
    const dataToUpdate: any = {};
    allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
            dataToUpdate[field] = req.body[field];
        }
    });

    const updatedUser = await prisma.user.update({
        where: { id: (req.user as any).id },
        data: dataToUpdate,
        select: {
            id: true,
            username: true,
            email: true,
            name: true,
            bio: true,
            avatar: true,
            gender: true,
            githubUrl: true,
            website: true,
            location: true,
            techStack: true,
            role: true,
            createdAt: true,
            _count: {
                select: {
                    snippets: true,
                    docs: true,
                    bugs: true,
                    followers: true,
                    following: true,
                },
            },
        },
    });

    res.json(updatedUser);
});

// Get user's content (snippets, docs, bugs)
export const getUserContent = asyncHandler(async (req: Request, res: Response) => {
    const { type = 'snippets', page = '1', limit = '10' } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const user = await prisma.user.findUnique({
        where: { username: req.params.username },
        include: { preferences: true },
    });

    if (!user) {
        res.status(404);
        throw new Error('User not found');
    }

    const currentUserId = (req.user as any)?.id;
    const privacy = user.preferences?.privacy as any;

    if (privacy?.profileVisibility === 'private' && user.id !== currentUserId) {
        return res.json({ content: [], total: 0, pages: 0, currentPage: pageNum });
    }

    const where = { 
        authorId: user.id,
    };

    let content = [];
    let total = 0;

    const includeOptions = {
        author: {
            select: { id: true, username: true, name: true, avatar: true },
        },
        _count: {
            select: { likes: true, comments: true, bookmarks: true },
        },
    };

    if (type === 'snippets') {
        [content, total] = await prisma.$transaction([
            prisma.snippet.findMany({ where, skip, take: limitNum, orderBy: { createdAt: 'desc' }, include: includeOptions }),
            prisma.snippet.count({ where }),
        ]);
    } else if (type === 'docs') {
        [content, total] = await prisma.$transaction([
            prisma.doc.findMany({ where, skip, take: limitNum, orderBy: { createdAt: 'desc' }, include: includeOptions }),
            prisma.doc.count({ where }),
        ]);
    } else if (type === 'bugs') {
        [content, total] = await prisma.$transaction([
            prisma.bug.findMany({ where: { ...where, expiresAt: { gt: new Date() } }, skip, take: limitNum, orderBy: { createdAt: 'desc' }, include: includeOptions }),
            prisma.bug.count({ where: { ...where, expiresAt: { gt: new Date() } } }),
        ]);
    } else {
        res.status(400);
        throw new Error('Invalid content type');
    }

    res.json({
        content,
        total,
        pages: Math.ceil(total / limitNum),
        currentPage: pageNum,
    });
});