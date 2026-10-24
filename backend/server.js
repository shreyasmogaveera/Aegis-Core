const http = require('http');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const connectDB = require('./src/config/db');
connectDB();

const app = express();
const server = http.createServer(app);
const socketService = require('./src/services/socketService');
socketService.init(server);

const schedulerService = require('./src/services/schedulerService');
schedulerService.init();

const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*'
}));
app.use(express.json());

// Routes
const authRoutes = require('./src/routes/authRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const userRoutes = require('./src/routes/userRoutes');
const alertRoutes = require('./src/routes/alertRoutes');
const shelterRoutes = require('./src/routes/shelterRoutes');
const sosRoutes = require('./src/routes/sosRoutes');
const environmentalRoutes = require('./src/routes/environmentalRoutes');
const predictionRoutes = require('./src/routes/predictionRoutes');
const groundReportRoutes = require('./src/routes/groundReportRoutes');

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/user', userRoutes);
app.use('/api/v1/alerts', alertRoutes.publicRouter);
app.use('/api/v1/admin/alerts', alertRoutes.adminRouter);
app.use('/api/v1/shelters', shelterRoutes.publicRouter);
app.use('/api/v1/admin/shelters', shelterRoutes.adminRouter);
app.use('/api/v1/user/sos', sosRoutes.userRouter);
app.use('/api/v1/admin/sos', sosRoutes.adminRouter);
app.use('/api/v1/environmental', environmentalRoutes);
app.use('/api/v1/predictions', predictionRoutes);
app.use('/api/v1/user/ground-reports', groundReportRoutes.userRouter);
app.use('/api/v1/admin/ground-reports', groundReportRoutes.adminRouter);

// Health check endpoint
app.get('/api/v1/health', (req, res) => {
  res.status(200).json({
    status: 'online',
    service: 'AegisCore Backend API',
    scheduler: schedulerService.getStatus(),
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
const { errorHandler } = require('./src/middleware/errorHandler');
app.use(errorHandler);

server.listen(PORT, () => {
  console.log(`[AegisCore Backend] Running on port ${PORT}`);
});

