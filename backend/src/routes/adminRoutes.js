const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { roleGuard } = require('../middleware/roleGuard');
const dashboardService = require('../services/dashboardService');

// Protect all admin routes with auth + roleGuard('admin')
router.use(auth, roleGuard('admin'));

router.get('/dashboard/summary', async (req, res, next) => {
  try {
    const summary = await dashboardService.getAdminDashboardSummary();
    res.status(200).json(summary);
  } catch (err) {
    next(err);
  }
});

router.delete('/users/:id', async (req, res, next) => {
  try {
    const User = require('../models/User');
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.status(200).json({ message: 'User deleted successfully' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
