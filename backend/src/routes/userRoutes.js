const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { roleGuard } = require('../middleware/roleGuard');
const dashboardService = require('../services/dashboardService');

// Protect citizen/user routes with auth + roleGuard
router.use(auth, roleGuard('user', 'admin'));

router.get('/dashboard/summary', async (req, res, next) => {
  try {
    const userId = req.user ? req.user.userId : null;
    const district = req.query.district || null;
    const lat = req.query.lat ? parseFloat(req.query.lat) : null;
    const lng = req.query.lng ? parseFloat(req.query.lng) : null;
    const summary = await dashboardService.getUserDashboardSummary(userId, district, { lat, lng });
    res.status(200).json(summary);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
