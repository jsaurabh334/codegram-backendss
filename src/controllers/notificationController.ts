import { Request, Response } from 'express';
import * as notificationService from '../services/notificationService';
import { asyncHandler } from '../utils/asyncHandler';

export const getNotifications = asyncHandler(async (req: Request, res: Response) => {
    const userId = (req.user as any).id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    const result = await notificationService.getNotifications(userId, page, limit);
    res.json(result);
});

export const markAsRead = asyncHandler(async (req: Request, res: Response) => {
    const userId = (req.user as any).id;
    const { notificationIds } = req.body; // Optional: array of IDs to mark as read

    await notificationService.markNotificationsAsRead(userId, notificationIds);
    res.json({ message: 'Notifications marked as read' });
});

export const getUnreadCount = asyncHandler(async (req: Request, res: Response) => {
    const userId = (req.user as any).id;
    const count = await notificationService.getUnreadNotificationCount(userId);
    res.json({ count });
});
