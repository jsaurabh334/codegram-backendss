import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { z } from 'zod';

const preferencesSchema = z.object({
  theme: z.enum(['LIGHT', 'DARK', 'SYSTEM']).optional(),
  language: z.string().min(2).max(5).optional(),
  notifications: z.object({
    email: z.boolean().optional(),
    push: z.boolean().optional(),
    mentions: z.boolean().optional(),
    likes: z.boolean().optional(),
    comments: z.boolean().optional(),
    follows: z.boolean().optional(),
  }).optional(),
  privacy: z.object({
    showEmail: z.boolean().optional(),
    showLocation: z.boolean().optional(),
    showGithub: z.boolean().optional(),
    allowDirectMessages: z.boolean().optional(),
    profileVisibility: z.enum(['public', 'private']).optional(), // Added profile visibility
  }).optional(),
});

const profileUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  bio: z.string().max(500).optional(),
  website: z.string().url().optional().or(z.literal('')),
  location: z.string().max(100).optional(),
  techStack: z.array(z.string()).max(20).optional(),
  avatar: z.string().url().optional(),
  gender: z.string().optional(),
});

// Get user preferences
export const getPreferences = async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;

    let preferences = await prisma.userPreferences.findUnique({
      where: { userId },
    });

    if (!preferences) {
      // Create default preferences
      preferences = await prisma.userPreferences.create({
        data: {
          userId,
          theme: 'SYSTEM',
          language: 'en',
          notifications: {
            email: true,
            push: true,
            mentions: true,
            likes: true,
            comments: true,
            follows: true,
          },
          privacy: {
            showEmail: false,
            showLocation: true,
            showGithub: true,
            allowDirectMessages: true,
            profileVisibility: 'public',
          },
        },
      });
    }

    res.json(preferences);
  } catch (error) {
    console.error('Get preferences error:', error);
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
};

// Update user preferences
export const updatePreferences = async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const updates = preferencesSchema.parse(req.body);

    // Get current preferences
    let preferences = await prisma.userPreferences.findUnique({
      where: { userId },
    });

    if (!preferences) {
      // Create with updates
      preferences = await prisma.userPreferences.create({
        data: {
          userId,
          theme: updates.theme || 'SYSTEM',
          language: updates.language || 'en',
          notifications: updates.notifications || {
            email: true,
            push: true,
            mentions: true,
            likes: true,
            comments: true,
            follows: true,
          },
          privacy: updates.privacy || {
            showEmail: false,
            showLocation: true,
            showGithub: true,
            allowDirectMessages: true,
            profileVisibility: 'public',
          },
        },
      });
    } else {
      // Update existing preferences
      const updateData: any = {};
      
      if (updates.theme) updateData.theme = updates.theme;
      if (updates.language) updateData.language = updates.language;
      
      if (updates.notifications) {
        updateData.notifications = {
          ...(preferences.notifications as any),
          ...updates.notifications,
        };
      }
      
      if (updates.privacy) {
        updateData.privacy = {
          ...(preferences.privacy as any),
          ...updates.privacy,
        };
      }

      preferences = await prisma.userPreferences.update({
        where: { userId },
        data: updateData,
      });
    }

    res.json({
      message: 'Preferences updated successfully',
      preferences,
    });
  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
};

// Update user profile
export const updateProfile = async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const updates = profileUpdateSchema.parse(req.body);

    const user = await prisma.user.update({
      where: { id: userId },
      data: updates,
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        bio: true,
        avatar: true,
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

    res.json({
      message: 'Profile updated successfully',
      user,
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

// Delete account
export const deleteAccount = async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const { confirmPassword } = z.object({
      confirmPassword: z.string().min(1),
    }).parse(req.body);

    // You might want to add password verification here
    // For now, we'll require a confirmation string
    if (confirmPassword !== 'DELETE_MY_ACCOUNT') {
      return res.status(400).json({ 
        error: 'Invalid confirmation. Type "DELETE_MY_ACCOUNT" to confirm.' 
      });
    }

    // Delete user and all related data (cascading deletes should handle most)
    await prisma.user.delete({
      where: { id: userId },
    });

    // Logout the user
    req.logout((err) => {
      if (err) {
        console.error('Logout error during account deletion:', err);
      }
    });

    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
};

// Get user dashboard stats
export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;

    const [
      snippetStats,
      docStats,
      bugStats,
      interactionStats,
      followStats,
    ] = await Promise.all([
      prisma.snippet.aggregate({
        where: { authorId: userId },
        _count: { id: true },
      }),
      prisma.doc.aggregate({
        where: { authorId: userId },
        _count: { id: true },
      }),
      prisma.bug.aggregate({
        where: { authorId: userId },
        _count: { id: true },
      }),
      prisma.like.aggregate({
        where: { 
          OR: [
            { snippet: { authorId: userId } },
            { doc: { authorId: userId } },
            { bug: { authorId: userId } },
          ]
        },
        _count: { id: true },
      }),
      prisma.follow.aggregate({
        where: { followingId: userId },
        _count: { id: true },
      }),
    ]);

    const stats = {
      content: {
        snippets: snippetStats._count.id,
        docs: docStats._count.id,
        bugs: bugStats._count.id,
      },
      engagement: {
        totalLikes: interactionStats._count.id,
        followers: followStats._count.id,
      },
    };

    res.json(stats);
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
};
