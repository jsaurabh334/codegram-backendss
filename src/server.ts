import http from 'http';
import app from './app';
import { initSocket } from './socket';

const PORT = process.env.PORT || 3001;

const server = http.createServer(app);

// Initialize Socket.IO
initSocket(server);

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Server running on port http://localhost:${PORT}/`);
});
