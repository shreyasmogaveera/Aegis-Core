import { io } from 'socket.io-client';

class SocketService {
  constructor() {
    this.socket = null;
  }

  getSocketUrl() {
    return import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';
  }

  connect() {
    const token = localStorage.getItem('aegis_token');

    if (!this.socket) {
      this.socket = io(this.getSocketUrl(), {
        auth: { token },
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 2000
      });

      this.socket.on('connect', () => {
        console.log('[SocketService] Connected to AegisCore real-time server:', this.socket.id);
      });

      this.socket.on('connect_error', (err) => {
        console.warn('[SocketService] Real-time connection warning (REST fallback active):', err.message);
      });

      this.socket.on('disconnect', (reason) => {
        console.log('[SocketService] Disconnected:', reason);
      });
    } else {
      const currentToken = this.socket.auth?.token;
      if (currentToken !== token) {
        console.log('[SocketService] Auth token updated, reconnecting socket with new credentials...');
        this.socket.auth = { token };
        if (this.socket.connected) {
          this.socket.disconnect();
        }
        this.socket.connect();
      } else if (!this.socket.connected) {
        this.socket.connect();
      }
    }

    return this.socket;
  }

  reconnect() {
    const token = localStorage.getItem('aegis_token');
    if (this.socket) {
      console.log('[SocketService] Reconnecting socket with updated auth credentials...');
      this.socket.auth = { token };
      if (this.socket.connected) {
        this.socket.disconnect();
      }
      this.socket.connect();
    } else {
      this.connect();
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  getSocket() {
    return this.connect();
  }

  /**
   * Subscribe to new SOS distress calls
   */
  onSosCreated(callback) {
    const socket = this.getSocket();
    socket.on('sos:created', callback);
    return () => socket.off('sos:created', callback);
  }

  /**
   * Subscribe to SOS status changes (DISPATCHED, RESOLVED, CANCELLED)
   */
  onSosUpdated(callback) {
    const socket = this.getSocket();
    socket.on('sos:updated', callback);
    return () => socket.off('sos:updated', callback);
  }

  /**
   * Subscribe to new emergency alert broadcasts
   */
  onAlertCreated(callback) {
    const socket = this.getSocket();
    socket.on('alert:created', callback);
    return () => socket.off('alert:created', callback);
  }

  /**
   * Subscribe to emergency alert updates or resolutions
   */
  onAlertUpdated(callback) {
    const socket = this.getSocket();
    socket.on('alert:updated', callback);
    return () => socket.off('alert:updated', callback);
  }

  /**
   * Subscribe to shelter capacity / status updates
   */
  onShelterUpdated(callback) {
    const socket = this.getSocket();
    socket.on('shelter:updated', callback);
    return () => socket.off('shelter:updated', callback);
  }

  /**
   * Subscribe to real-time risk prediction updates
   */
  onPredictionUpdated(callback) {
    const socket = this.getSocket();
    socket.on('prediction:updated', callback);
    return () => socket.off('prediction:updated', callback);
  }
}

const socketServiceInstance = new SocketService();
export default socketServiceInstance;
