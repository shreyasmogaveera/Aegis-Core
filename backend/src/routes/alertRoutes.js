const express = require('express');
const alertController = require('../controllers/alertController');
const { auth } = require('../middleware/auth');
const { roleGuard } = require('../middleware/roleGuard');

// Public/Authenticated User Router
const publicRouter = express.Router();
publicRouter.use(auth, roleGuard('user', 'admin'));
publicRouter.get('/', (req, res) => alertController.getActiveAlerts(req, res));
publicRouter.get('/:id', (req, res) => alertController.getAlertById(req, res));

// Admin Router
const adminRouter = express.Router();
adminRouter.use(auth, roleGuard('admin'));
adminRouter.get('/', (req, res) => alertController.getAdminAlerts(req, res));
adminRouter.post('/', (req, res) => alertController.createAlert(req, res));
adminRouter.put('/:id', (req, res) => alertController.updateAlert(req, res));
adminRouter.patch('/:id/status', (req, res) => alertController.deactivateAlert(req, res));
adminRouter.delete('/:id', (req, res) => alertController.deleteAlert(req, res));

module.exports = {
  publicRouter,
  adminRouter
};
