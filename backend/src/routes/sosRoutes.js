const express = require('express');
const sosController = require('../controllers/sosController');
const { auth } = require('../middleware/auth');
const { roleGuard } = require('../middleware/roleGuard');

// User / Citizen Router
const userRouter = express.Router();
userRouter.use(auth, roleGuard('user', 'admin'));
userRouter.post('/', (req, res) => sosController.createCitizenSos(req, res));
userRouter.get('/', (req, res) => sosController.getCitizenSosRequests(req, res));
userRouter.get('/:id', (req, res) => sosController.getCitizenSosById(req, res));
userRouter.patch('/:id/cancel', (req, res) => sosController.cancelCitizenSos(req, res));

// Admin Router
const adminRouter = express.Router();
adminRouter.use(auth, roleGuard('admin'));
adminRouter.get('/', (req, res) => sosController.getAdminSosRequests(req, res));
adminRouter.get('/:id', (req, res) => sosController.getAdminSosById(req, res));
adminRouter.patch('/:id/status', (req, res) => sosController.updateAdminSosStatus(req, res));
adminRouter.delete('/:id', (req, res) => sosController.deleteAdminSos(req, res));

module.exports = {
  userRouter,
  adminRouter
};
