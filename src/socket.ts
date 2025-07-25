import { Server, Socket } from 'socket.io';
import http from 'http';
import { prisma } from './config/db';

let io: Server;

/**
 * Initializes the Socket.IO server and sets up event listeners.
 * @param {http.Server} server - The HTTP server to attach Socket.IO to.
 * @returns {Server} The initialized Socket.IO server instance.
 */
export const initializeSocket = (server: http.Server): Server => {
  io = new Server(server, {
    cors: {
      // FIX: Use the same origin as your main app's CORS configuration.
      // This ensures that WebSocket connections are allowed from your frontend.
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      methods: ["GET", "POST"],
      credentials: true
    }
  });

  io.on('connection', (socket: Socket) => {
    console.log(`A user connected: ${socket.id}`);

    /**
     * Handles a client joining their user-specific room for notifications.
     */
    socket.on('join-user-room', (userId: string) => {
      if (userId) {
        socket.join(userId);
        console.log(`Socket ${socket.id} joined room for user: ${userId}`);
      }
    });

    /**
     * Handles a client joining a room for a specific content item to receive live updates.
     */
    socket.on('join-content-room', (contentId: string) => {
        if(contentId) {
            socket.join(contentId);
            console.log(`Socket ${socket.id} joined room for content: ${contentId}`);
        }
    });

    /**
     * Handles a client leaving a content room when they navigate away.
     */
    socket.on('leave-content-room', (contentId: string) => {
        if(contentId) {
            socket.leave(contentId);
            console.log(`Socket ${socket.id} left room for content: ${contentId}`);
        }
    });


    /**
     * Handles user disconnection.
     */
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.id}`);
    });
  });

  return io;
};

/**
 * Retrieves the singleton Socket.IO server instance.
 */
export const getIO = (): Server => {
  if (!io) {
    throw new Error('Socket.io has not been initialized!');
  }
  return io;
};

/**
 * Emits a real-time event to all followers of a specific user.
 */
export const emitToFollowers = async (authorId: string, eventName: string, payload: any) => {
    try {
        const followers = await prisma.follow.findMany({
            where: { followingId: authorId },
            select: { followerId: true }
        });

        const io = getIO();
        // Emit the event to each follower's private room.
        followers.forEach((follow: { followerId: string }) => {
            io.to(follow.followerId).emit(eventName, payload);
        });

        // Also emit to the author themselves so their own feed updates instantly.
        io.to(authorId).emit(eventName, payload);

    } catch (error) {
        console.error(`Error emitting event '${eventName}' to followers of ${authorId}:`, error);
    }
};

// At the end of src/socket.ts, add:
export const initSocket = initializeSocket;
