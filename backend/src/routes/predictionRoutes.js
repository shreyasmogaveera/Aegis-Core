const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const predictionController = require('../controllers/predictionController');

// Authenticated prediction endpoints
router.use(auth);

router.post('/trigger', (req, res) => predictionController.triggerPrediction(req, res));
router.post('/historical-replay', (req, res) => predictionController.historicalReplay(req, res));
router.get('/latest', (req, res) => predictionController.getLatestPrediction(req, res));
router.get('/history', (req, res) => predictionController.getPredictionHistory(req, res));

module.exports = router;

