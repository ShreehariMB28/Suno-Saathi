const { clerkClient } = require('@clerk/express');

const connections = new Map();

function registerRealtime(io) {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentication required.'));

      const request = new Request('http://voiceguard.local/socket', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const requestState = await clerkClient.authenticateRequest(request);
      const auth = requestState.toAuth();
      if (!requestState.isAuthenticated || !auth.userId) {
        return next(new Error('Authentication required.'));
      }

      socket.data.clerkUserId = auth.userId;
      return next();
    } catch (error) {
      return next(new Error('Unable to authenticate realtime connection.'));
    }
  });

  io.on('connection', (socket) => {
    const clerkUserId = socket.data.clerkUserId;
    const userSockets = connections.get(clerkUserId) || new Set();
    userSockets.add(socket.id);
    connections.set(clerkUserId, userSockets);

    socket.on('disconnect', () => {
      const currentSockets = connections.get(clerkUserId);
      currentSockets?.delete(socket.id);
      if (currentSockets?.size === 0) connections.delete(clerkUserId);
    });
  });
}

function emitToUser(io, clerkUserId, event, payload) {
  const userSockets = connections.get(clerkUserId);
  if (!userSockets) return;
  for (const socketId of userSockets) io.to(socketId).emit(event, payload);
}

module.exports = { registerRealtime, emitToUser };
