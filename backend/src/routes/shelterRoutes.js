const express = require('express');
const shelterController = require('../controllers/shelterController');
const { auth } = require('../middleware/auth');
const { roleGuard } = require('../middleware/roleGuard');

// Public / Authenticated Users Router
const publicRouter = express.Router();
publicRouter.use(auth, roleGuard('user', 'admin'));
publicRouter.get('/', (req, res) => shelterController.getPublicShelters(req, res));
publicRouter.get('/:id', (req, res) => shelterController.getShelterById(req, res));

// Admin Router
const adminRouter = express.Router();
adminRouter.use(auth, roleGuard('admin'));
adminRouter.get('/', (req, res) => shelterController.getAdminShelters(req, res));
adminRouter.post('/', (req, res) => shelterController.createShelter(req, res));
adminRouter.put('/:id', (req, res) => shelterController.updateShelter(req, res));
adminRouter.patch('/:id/status', (req, res) => shelterController.updateShelterStatus(req, res));
adminRouter.delete('/:id', (req, res) => shelterController.deleteShelter(req, res));

module.exports = {
  publicRouter,
  adminRouter
};
