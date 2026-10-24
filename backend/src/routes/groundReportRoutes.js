const express = require('express');
const groundReportController = require('../controllers/groundReportController');
const { auth } = require('../middleware/auth');
const { roleGuard } = require('../middleware/roleGuard');

const userRouter = express.Router();
const adminRouter = express.Router();

// Citizen Routes
userRouter.post('/', auth, (req, res) => groundReportController.createReport(req, res));
userRouter.get('/', auth, (req, res) => groundReportController.getCitizenReports(req, res));

// Admin Routes
adminRouter.get('/', auth, roleGuard('admin'), (req, res) => groundReportController.getAdminReports(req, res));

module.exports = {
  userRouter,
  adminRouter
};
