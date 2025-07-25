import { prisma } from '../config/db'; // Adjust path if needed
import { getIO } from '../socket'; // Import the getIO function
import { NotificationType } from '@prisma/client';

// Interface defining the structure for creating a new notification.
interface NotificationData {
    recipientId: string;
    senderId: string;
    type: NotificationType;
    snippetId?: string;
    docId?: string;
    bugId?: string;
    commentId?: string;
}

/**
 * Creates a notification, saves it to the database, and emits a real-time socket event.
 * @param {NotificationData} data - The data for the notification to be created.
 */
export const createNotification = async (data: NotificationData) => {
    // Don't create notifications for actions on your own content
    if (data.recipientId === data.senderId) {
        return;
    }

    // Create the notification record in the database.
    const notification = await prisma.notification.create({
        data,
        // Include sender details to display in the notification toast.
        include: {
            sender: {
                select: {
                    id: true,
                    username: true,
                    name: true,
                    avatar: true,
                },
            },
        },
    });

    // --- Real-time Logic ---
    const io = getIO();
    // Emit the 'new_notification' event to the recipient's private room.
    io.to(data.recipientId).emit('new_notification', notification);
};

// --- Your other notification functions remain unchanged ---

export const getNotifications = async (userId: string, page: number, limit: number) => {
    const skip = (page - 1) * limit;
    const notifications = await prisma.notification.findMany({
        where: { recipientId: userId },
        include: {
            sender: {
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
        skip,
        take: limit,
    });

    const total = await prisma.notification.count({
        where: { recipientId: userId },
    });

    return { notifications, total, page, limit };
};

export const markNotificationsAsRead = async (userId: string, notificationIds?: string[]) => {
    const where: { recipientId: string; id?: { in: string[] } } = { recipientId: userId };
    if (notificationIds && notificationIds.length > 0) {
        where.id = { in: notificationIds };
    }
    await prisma.notification.updateMany({
        where,
        data: { read: true },
    });
};

export const getUnreadNotificationCount = async (userId: string) => {
    return prisma.notification.count({
        where: {
            recipientId: userId,
            read: false,
        },
    });
};
