const GroundReport = require('../models/GroundReport');
const socketService = require('../services/socketService');

class GroundReportController {
  formatReport(report) {
    const coords = report.location && report.location.coordinates ? report.location.coordinates : [75.7382, 12.4244];
    return {
      id: report._id.toString(),
      userId: report.userId ? report.userId.toString() : null,
      reporterName: report.reporterName || 'Anonymous Citizen',
      reporterPhone: report.reporterPhone || '',
      reportType: report.reportType,
      district: report.district,
      description: report.description,
      severity: report.severity || 'MODERATE',
      latitude: coords[1],
      longitude: coords[0],
      location: report.location,
      image: report.image || '',
      status: report.status || 'SUBMITTED',
      createdAt: report.createdAt,
      updatedAt: report.updatedAt
    };
  }

  /**
   * POST /api/v1/user/ground-reports
   */
  async createReport(req, res) {
    try {
      const {
        reportType = 'OTHER',
        district = 'Kodagu',
        description,
        latitude,
        longitude,
        severity = 'MODERATE',
        image,
        reporterName,
        reporterPhone
      } = req.body;

      if (!description || !description.trim()) {
        return res.status(400).json({ error: 'Report description is required' });
      }

      const lat = Number(latitude);
      const lng = Number(longitude);

      if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return res.status(400).json({ error: 'Valid latitude and longitude coordinates are required' });
      }

      const report = await GroundReport.create({
        userId: req.user ? req.user.userId : null,
        reporterName: reporterName || (req.user ? req.user.name : 'Anonymous Citizen'),
        reporterPhone: reporterPhone || (req.user ? req.user.phone : ''),
        reportType: reportType.toUpperCase(),
        district,
        description,
        severity: severity.toUpperCase(),
        location: {
          type: 'Point',
          coordinates: [lng, lat]
        },
        image: image || '',
        status: 'SUBMITTED'
      });

      const formatted = this.formatReport(report);

      // Broadcast real-time ground report socket event
      socketService.io.emit('ground_report:created', formatted);

      return res.status(201).json({
        message: 'Live citizen ground report submitted successfully',
        report: formatted
      });
    } catch (err) {
      console.error('[GroundReportController.createReport] Error:', err);
      return res.status(500).json({ error: 'Failed to submit ground report' });
    }
  }

  /**
   * GET /api/v1/user/ground-reports
   */
  async getCitizenReports(req, res) {
    try {
      const query = req.user ? { userId: req.user.userId } : {};
      const reports = await GroundReport.find(query).sort({ createdAt: -1 });
      const formatted = reports.map(r => this.formatReport(r));

      return res.status(200).json({
        count: formatted.length,
        reports: formatted
      });
    } catch (err) {
      console.error('[GroundReportController.getCitizenReports] Error:', err);
      return res.status(500).json({ error: 'Failed to fetch ground reports' });
    }
  }

  /**
   * Admin GET /api/v1/admin/ground-reports
   */
  async getAdminReports(req, res) {
    try {
      const { district, status } = req.query;
      const filter = {};
      if (district) filter.district = new RegExp(`^${district}$`, 'i');
      if (status) filter.status = status.toUpperCase();

      const reports = await GroundReport.find(filter).sort({ createdAt: -1 });
      const formatted = reports.map(r => this.formatReport(r));

      return res.status(200).json({
        count: formatted.length,
        reports: formatted
      });
    } catch (err) {
      console.error('[GroundReportController.getAdminReports] Error:', err);
      return res.status(500).json({ error: 'Failed to fetch admin ground reports' });
    }
  }
}

module.exports = new GroundReportController();
