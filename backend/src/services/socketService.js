const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

class SocketService {
  constructor() {
    this.io = null;
  }

  init(httpServer) {
    this.io = new Server(httpServer, {
      cors: {
        origin: process.env.CORS_ORIGIN || '*',
        methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE']
      }
    });

    // Authentication middleware
    this.io.use((socket, next) => {
      try {
        const token =
          socket.handshake.auth?.token ||
          (socket.handshake.headers.authorization && socket.handshake.headers.authorization.split(' ')[1]) ||
          socket.handshake.query?.token;

        if (token && process.env.JWT_SECRET) {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          socket.user = decoded;
        }
        next();
      } catch (err) {
        console.warn('[SocketService] Auth warning: Invalid or expired socket token, connecting as guest socket:', err.message);
        next();
      }
    });

    this.io.on('connection', (socket) => {
      if (socket.user) {
        const userId = socket.user.userId || socket.user.id;
        const role = socket.user.role;

        socket.join('authenticated');
        if (userId) {
          socket.join(`user:${userId}`);
        }
        if (role === 'admin') {
          socket.join('admins');
        }
        console.log(`[SocketService] User connected: ${socket.user.name || socket.user.email} (${role}) [Socket ID: ${socket.id}]`);
      } else {
        console.log(`[SocketService] Guest connected [Socket ID: ${socket.id}]`);
      }

      socket.on('disconnect', (reason) => {
        console.log(`[SocketService] Socket disconnected: ${socket.id} (Reason: ${reason})`);
      });
    });

    console.log('[SocketService] Socket.io server initialized');
  }

  getIO() {
    return this.io;
  }

  /**
   * Emit SOS creation event to admins & requester
   */
  notifySosCreated(sosData) {
    if (!this.io) return;
    this.io.to('admins').emit('sos:created', sosData);
    if (sosData.user) {
      this.io.to(`user:${sosData.user}`).emit('sos:created', sosData);
    }
  }

  /**
   * Emit SOS update/dispatch/resolve event to admins & affected user
   */
  notifySosUpdated(sosData) {
    if (!this.io) return;
    this.io.to('admins').emit('sos:updated', sosData);
    this.io.to('authenticated').emit('sos:updated', sosData);
    if (sosData.user) {
      this.io.to(`user:${sosData.user}`).emit('sos:updated', sosData);
    }
  }

  /**
   * Emit new alert broadcast to all authenticated clients
   */
  notifyAlertCreated(alertData) {
    if (!this.io) return;
    this.io.to('authenticated').emit('alert:created', alertData);
    this.io.emit('alert:created', alertData);
  }

  /**
   * Emit alert modification/deactivation to all clients
   */
  notifyAlertUpdated(alertData) {
    if (!this.io) return;
    this.io.to('authenticated').emit('alert:updated', alertData);
    this.io.emit('alert:updated', alertData);
  }

  /**
   * Emit shelter capacity / status update to all connected clients
   */
  notifyShelterUpdated(shelterData) {
    if (!this.io) return;
    this.io.to('authenticated').emit('shelter:updated', shelterData);
    this.io.emit('shelter:updated', shelterData);
  }

  /**
   * Emit risk prediction updates to all connected clients
   */
  notifyPredictionUpdated(predictionData) {
    if (!this.io) return;
    this.io.to('authenticated').emit('prediction:updated', predictionData);
    this.io.emit('prediction:updated', predictionData);
  }
}

module.exports = new SocketService();
