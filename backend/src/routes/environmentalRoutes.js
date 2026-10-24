const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const environmentalController = require('../controllers/environmentalController');

// Authenticated environmental endpoints
router.use(auth);

router.get('/latest', (req, res) => environmentalController.getLatestEnvironmentalData(req, res));
router.get('/history', (req, res) => environmentalController.getEnvironmentalHistory(req, res));

module.exports = router;
