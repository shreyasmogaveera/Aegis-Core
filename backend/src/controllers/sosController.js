const SosRequest = require('../models/SosRequest');
const User = require('../models/User');
const socketService = require('../services/socketService');

class SosController {
  /**
   * Helper to format relative time strings
   */
  formatTimeAgo(date) {
    if (!date) return 'Just now';
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    if (seconds < 60) return `${Math.max(1, seconds)}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  /**
   * Validate coordinates helper
   */
  isValidCoordinate(lat, lng) {
    if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
      return false;
    }
    return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  }

  /**
   * Format SosRequest document for response
   */
  formatSos(sos) {
    const coords = sos.location && sos.location.coordinates ? sos.location.coordinates : [75.7382, 12.4244];
    const lng = coords[0];
    const lat = coords[1];

    return {
      id: sos._id.toString(),
      user: sos.user ? sos.user.toString() : null,
      name: sos.name,
      phone: sos.phone,
      emergencyType: sos.emergencyType,
      latitude: lat,
      longitude: lng,
      location: sos.location,
      coords: `${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E`,
      address: sos.address || '',
      district: sos.district || 'Kodagu',
      loc: sos.address ? `${sos.district} — ${sos.address}` : `${sos.district} Slopes`,
      peopleCount: sos.peopleCount || 1,
      details: sos.details || '',
      desc: sos.details || `Emergency distress beacon (${sos.peopleCount} occupants)`,
      status: sos.status,
      priority: sos.emergencyType === 'FLOOD_TRAPPED' || sos.emergencyType === 'LANDSLIDE_BLOCKED' ? 'CRITICAL' : 'HIGH',
      time: this.formatTimeAgo(sos.createdAt),
      createdAt: sos.createdAt,
      updatedAt: sos.updatedAt
    };
  }

  /**
   * Citizen POST /api/v1/user/sos
   */
  async createCitizenSos(req, res) {
    try {
      const {
        latitude,
        longitude,
        emergencyType,
        details,
        address,
        district,
        peopleCount,
        phone,
        name
      } = req.body;

      const lat = Number(latitude);
      const lng = Number(longitude);

      if (!this.isValidCoordinate(lat, lng)) {
        return res.status(400).json({ error: 'Invalid latitude/longitude coordinates' });
      }

      // Fetch user profile info if missing
      let requesterName = name;
      let requesterPhone = phone;

      if (req.user && req.user.userId && (!requesterName || !requesterPhone)) {
        const dbUser = await User.findById(req.user.userId);
        if (dbUser) {
          requesterName = requesterName || dbUser.name;
          requesterPhone = requesterPhone || dbUser.phone || '+91 9876543210';
        }
      }

      const isTestSignal = Boolean(
        req.body.isTest ||
        req.body.source === 'test' ||
        (details && String(details).toLowerCase().includes('e2e')) ||
        (requesterName && String(requesterName).toLowerCase().includes('e2e'))
      );

      const newSos = await SosRequest.create({
        user: req.user ? req.user.userId : null,
        name: requesterName || 'Citizen Requester',
        phone: requesterPhone || '+91 9876543210',
        emergencyType: emergencyType || 'EVACUATION_NEEDED',
        location: {
          type: 'Point',
          coordinates: [lng, lat]
        },
        address: address || 'Current GPS Location Sector',
        district: district || 'Karnataka',
        peopleCount: Number(peopleCount) || 1,
        details: details || 'Immediate life safety distress beacon activated',
        status: 'PENDING',
        isTest: isTestSignal,
        source: req.body.source || (isTestSignal ? 'test' : 'citizen')
      });

      const formattedSos = this.formatSos(newSos);
      socketService.notifySosCreated(formattedSos);

      return res.status(201).json({
        message: 'Emergency SOS beacon transmitted successfully',
        sos: formattedSos
      });
    } catch (err) {
      console.error('[SosController.createCitizenSos] Error:', err);
      return res.status(500).json({ error: 'Failed to transmit SOS distress signal' });
    }
  }

  /**
   * Citizen PATCH /api/v1/user/sos/:id/cancel
   */
  async cancelCitizenSos(req, res) {
    try {
      const sos = await SosRequest.findById(req.params.id);
      if (!sos) {
        return res.status(404).json({ error: 'SOS request not found' });
      }

      // Check ownership unless admin
      if (req.user.role !== 'admin' && sos.user && sos.user.toString() !== req.user.userId) {
        return res.status(403).json({ error: 'Access denied: Cannot cancel another user\'s SOS request' });
      }

      sos.status = 'CANCELLED';
      await sos.save();

      const formattedSos = this.formatSos(sos);
      socketService.notifySosUpdated(formattedSos);

      return res.status(200).json({
        message: 'SOS distress beacon cancelled successfully',
        sos: formattedSos
      });
    } catch (err) {
      console.error('[SosController.cancelCitizenSos] Error:', err);
      return res.status(500).json({ error: 'Failed to cancel SOS distress beacon' });
    }
  }

  /**
   * Citizen GET /api/v1/user/sos
   */
  async getCitizenSosRequests(req, res) {
    try {
      if (!req.user || !req.user.userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const query = {
        user: req.user.userId,
        isTest: { $ne: true },
        source: { $ne: 'test' },
        details: { $not: /E2E/i },
        name: { $not: /E2E/i }
      };

      const requests = await SosRequest.find(query).sort({ createdAt: -1 });
      const formatted = requests.map((sos) => this.formatSos(sos));

      return res.status(200).json({
        count: formatted.length,
        activeCount: formatted.filter((s) => s.status === 'PENDING' || s.status === 'RESPONDING' || s.status === 'IN_PROGRESS').length,
        sosRequests: formatted
      });
    } catch (err) {
      console.error('[SosController.getCitizenSosRequests] Error:', err);
      return res.status(500).json({ error: 'Failed to fetch user SOS requests' });
    }
  }

  /**
   * Citizen GET /api/v1/user/sos/:id
   */
  async getCitizenSosById(req, res) {
    try {
      const sos = await SosRequest.findById(req.params.id);
      if (!sos) {
        return res.status(404).json({ error: 'SOS request not found' });
      }

      // Check ownership unless admin
      if (req.user.role !== 'admin' && sos.user && sos.user.toString() !== req.user.userId) {
        return res.status(403).json({ error: 'Access denied: Cannot view another user\'s SOS request' });
      }

      return res.status(200).json(this.formatSos(sos));
    } catch (err) {
      console.error('[SosController.getCitizenSosById] Error:', err);
      return res.status(500).json({ error: 'Failed to fetch SOS request details' });
    }
  }

  /**
   * Admin GET /api/v1/admin/sos
   */
  async getAdminSosRequests(req, res) {
    try {
      const { status = 'ACTIVE' } = req.query;
      const notTestQuery = {
        isTest: { $ne: true },
        source: { $ne: 'test' },
        details: { $not: /E2E/i },
        name: { $not: /E2E/i }
      };

      const pendingCount = await SosRequest.countDocuments({ ...notTestQuery, status: 'PENDING' });
      const respondingCount = await SosRequest.countDocuments({
        ...notTestQuery,
        status: { $in: ['RESPONDING', 'IN_PROGRESS'] }
      });
      const resolvedCount = await SosRequest.countDocuments({ ...notTestQuery, status: 'RESOLVED' });
      const cancelledCount = await SosRequest.countDocuments({ ...notTestQuery, status: 'CANCELLED' });

      let listQuery;
      if (status.toUpperCase() === 'ALL') {
        listQuery = notTestQuery;
      } else if (status.toUpperCase() === 'RESOLVED') {
        listQuery = { ...notTestQuery, status: 'RESOLVED' };
      } else if (status.toUpperCase() === 'CANCELLED') {
        listQuery = { ...notTestQuery, status: 'CANCELLED' };
      } else {
        // Default: ACTIVE only (PENDING, RESPONDING, IN_PROGRESS) so the visible list matches totalActive!
        listQuery = { ...notTestQuery, status: { $in: ['PENDING', 'RESPONDING', 'IN_PROGRESS'] } };
      }

      const requests = await SosRequest.find(listQuery).sort({ createdAt: -1 });
      const formatted = requests.map((sos) => this.formatSos(sos));

      return res.status(200).json({
        metrics: {
          totalActive: pendingCount + respondingCount,
          pending: pendingCount,
          responding: respondingCount,
          resolved24h: resolvedCount,
          cancelled: cancelledCount
        },
        sosRequests: formatted
      });
    } catch (err) {
      console.error('[SosController.getAdminSosRequests] Error:', err);
      return res.status(500).json({ error: 'Failed to fetch admin SOS requests' });
    }
  }

  /**
   * Admin DELETE /api/v1/admin/sos/:id
   */
  async deleteAdminSos(req, res) {
    try {
      const sos = await SosRequest.findByIdAndDelete(req.params.id);
      if (!sos) {
        return res.status(404).json({ error: 'SOS request not found' });
      }
      return res.status(200).json({ message: 'SOS request deleted successfully' });
    } catch (err) {
      console.error('[SosController.deleteAdminSos] Error:', err);
      return res.status(500).json({ error: 'Failed to delete SOS request' });
    }
  }

  /**
   * Admin GET /api/v1/admin/sos/:id
   */
  async getAdminSosById(req, res) {
    try {
      const sos = await SosRequest.findById(req.params.id);
      if (!sos) {
        return res.status(404).json({ error: 'SOS request not found' });
      }
      return res.status(200).json(this.formatSos(sos));
    } catch (err) {
      console.error('[SosController.getAdminSosById] Error:', err);
      return res.status(500).json({ error: 'Failed to fetch SOS details' });
    }
  }

  /**
   * Admin PATCH /api/v1/admin/sos/:id/status
   */
  async updateAdminSosStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const validStatuses = ['PENDING', 'RESPONDING', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED'];
      if (!status || !validStatuses.includes(status.toUpperCase())) {
        return res.status(400).json({ error: 'Invalid status. Allowed: PENDING, RESPONDING, RESOLVED, CANCELLED' });
      }

      const updated = await SosRequest.findByIdAndUpdate(
        id,
        {
          status: status.toUpperCase(),
          responder: req.user.userId
        },
        { new: true }
      );

      if (!updated) {
        return res.status(404).json({ error: 'SOS request not found' });
      }

      const formattedSos = this.formatSos(updated);
      socketService.notifySosUpdated(formattedSos);

      return res.status(200).json({
        message: `SOS status updated to ${updated.status}`,
        sos: formattedSos
      });
    } catch (err) {
      console.error('[SosController.updateAdminSosStatus] Error:', err);
      return res.status(500).json({ error: 'Failed to update SOS status' });
    }
  }
}

module.exports = new SosController();
