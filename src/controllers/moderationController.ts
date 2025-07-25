import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { z } from 'zod';

const blockSchema = z.object({
  userId: z.string().cuid(),
});

const reportSchema = z.object({
  reportedUserId: z.string().cuid().optional(),
  reason: z.enum(['SPAM', 'HARASSMENT', 'INAPPROPRIATE_CONTENT', 'COPYRIGHT_VIOLATION', 'FAKE_ACCOUNT', 'OTHER']),
  description: z.string().max(500).optional(),
  contentType: z.enum(['snippet', 'doc', 'bug', 'comment']).optional(),
  contentId: z.string().cuid().optional(),
});

// Block/Unblock User
export const toggleBlock = async (req: Request, res: Response) => {
  try {
    const { userId } = blockSchema.parse(req.body);
    const blockerId = (req.user as any).id;

    if (userId === blockerId) {
      return res.status(400).json({ error: 'Cannot block yourself' });
    }

    const existingBlock = await prisma.blockedUser.findFirst({
      where: {
        blockerId,
        blockedId: userId,
      },
    });

    if (existingBlock) {
      await prisma.blockedUser.delete({
        where: { id: existingBlock.id },
      });
      res.json({ message: 'User unblocked successfully', isBlocked: false });
    } else {
      await prisma.blockedUser.create({
        data: {
          blockerId,
          blockedId: userId,
        },
      });
      res.json({ message: 'User blocked successfully', isBlocked: true });
    }
  } catch (error) {
    console.error('Block toggle error:', error);
    res.status(500).json({ error: 'Failed to toggle block status' });
  }
};

// Check if user is blocked
export const checkBlockStatus = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const checkerId = (req.user as any).id;

    const isBlocked = await prisma.blockedUser.findFirst({
      where: {
        blockerId: checkerId,
        blockedId: userId,
      },
    });

    res.json({ isBlocked: !!isBlocked });
  } catch (error) {
    console.error('Block check error:', error);
    res.status(500).json({ error: 'Failed to check block status' });
  }
};

// Get blocked users
export const getBlockedUsers = async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const [blockedUsers, total] = await Promise.all([
      prisma.blockedUser.findMany({
        where: { blockerId: userId },
        skip,
        take: limit,
        include: {
          blocked: {
            select: {
              id: true,
              username: true,
              name: true,
              avatar: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.blockedUser.count({
        where: { blockerId: userId },
      }),
    ]);

    res.json({
      blockedUsers: blockedUsers.map((b: { blocked: any }) => b.blocked),
      total,
      pages: Math.ceil(total / limit),
      currentPage: page,
    });
  } catch (error) {
    console.error('Get blocked users error:', error);
    res.status(500).json({ error: 'Failed to fetch blocked users' });
  }
};

// Report content or user
export const createReport = async (req: Request, res: Response) => {
  try {
    const { reportedUserId, reason, description, contentType, contentId } = reportSchema.parse(req.body);
    const reporterId = (req.user as any).id;

    if (reportedUserId && reportedUserId === reporterId) {
      return res.status(400).json({ error: 'Cannot report yourself' });
    }

    const reportData: any = {
      reporterId,
      reason,
      description,
    };
    
    let finalReportedId = reportedUserId;

    if (contentType && contentId) {
      let contentAuthorId: string | undefined;
      const model = prisma[contentType as 'snippet' | 'doc' | 'bug' | 'comment'];
      
      const content = await (model as any).findUnique({
        where: { id: contentId },
        select: { authorId: true },
      });
      contentAuthorId = content?.authorId;

      if(contentAuthorId && contentAuthorId === reporterId) {
        return res.status(400).json({ error: 'Cannot report your own content' });
      }

      if (contentAuthorId) {
        finalReportedId = contentAuthorId;
      }

      reportData[`${contentType}Id`] = contentId;
    }

    if (!finalReportedId) {
      return res.status(400).json({ error: 'A reported user ID is required when not reporting content.' });
    }
    
    reportData.reportedId = finalReportedId;

    const report = await prisma.report.create({
      data: reportData,
      include: {
        reporter: {
          select: {
            id: true,
            username: true,
            name: true,
          },
        },
      },
    });

    res.status(201).json({
      message: 'Report submitted successfully',
      report,
    });
  } catch (error) {
    console.error('Report creation error:', error);
    res.status(500).json({ error: 'Failed to submit report' });
  }
};

// Get reports (admin only)
export const getReports = async (req: Request, res: Response) => {
  try {
    const userRole = (req.user as any).role;
    
    if (userRole !== 'ADMIN') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const status = req.query.status as string;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) {
      where.status = status;
    }

    const [reports, total] = await Promise.all([
      prisma.report.findMany({
        where,
        skip,
        take: limit,
        include: {
          reporter: {
            select: {
              id: true,
              username: true,
              name: true,
              avatar: true,
            },
          },
          reported: {
            select: {
              id: true,
              username: true,
              name: true,
              avatar: true,
            },
          },
          snippet: {
            select: {
              id: true,
              title: true,
            },
          },
          doc: {
            select: {
              id: true,
              title: true,
            },
          },
          bug: {
            select: {
              id: true,
              title: true,
            },
          },
          comment: {
            select: {
              id: true,
              content: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.report.count({ where }),
    ]);

    res.json({
      reports,
      total,
      pages: Math.ceil(total / limit),
      currentPage: page,
    });
  } catch (error) {
    console.error('Get reports error:', error);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
};

// Update report status (admin only)
export const updateReportStatus = async (req: Request, res: Response) => {
  try {
    const userRole = (req.user as any).role;
    
    if (userRole !== 'ADMIN') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { reportId } = req.params;
    const { status } = z.object({
      status: z.enum(['PENDING', 'REVIEWED', 'RESOLVED', 'DISMISSED']),
    }).parse(req.body);

    const report = await prisma.report.update({
      where: { id: reportId },
      data: { status },
      include: {
        reporter: {
          select: {
            id: true,
            username: true,
            name: true,
          },
        },
        reported: {
          select: {
            id: true,
            username: true,
            name: true,
          },
        },
      },
    });

    res.json({
      message: 'Report status updated successfully',
      report,
    });
  } catch (error) {
    console.error('Update report status error:', error);
    res.status(500).json({ error: 'Failed to update report status' });
  }
};
