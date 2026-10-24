const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mongoose = require('mongoose');
const predictionController = require('./src/controllers/predictionController');
const Prediction = require('./src/models/Prediction');

async function testTriggerRoute() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('MongoDB connected successfully.');

  console.log('\n====================================================');
  console.log('TEST: Trigger Prediction Controller (Live Mode, No Sequence Passed)');
  console.log('====================================================');

  const req = {
    body: {
      district: 'Kodagu',
      predictionType: 'flood',
      mode: 'live'
    }
  };

  let responseData = null;
  let responseStatusCode = null;

  const res = {
    status(code) {
      responseStatusCode = code;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    }
  };

  await predictionController.triggerPrediction(req, res);

  console.log('Response Status:', responseStatusCode);
  console.log('Response Message:', responseData?.message);
  console.log('Prediction Output:');
  console.log('  ID:', responseData?.prediction?.id);
  console.log('  District:', responseData?.prediction?.district);
  console.log('  Type:', responseData?.prediction?.predictionType);
  console.log('  Risk Score / Probability:', responseData?.prediction?.riskScore);
  console.log('  Time Window Hours:', responseData?.prediction?.timeWindowHours);

  // Check MongoDB document
  if (responseData?.prediction?.id) {
    const savedDoc = await Prediction.findById(responseData.prediction.id);
    console.log('\nVerified MongoDB Saved Document:');
    console.log('  DB Document ID:', savedDoc._id.toString());
    console.log('  Source:', savedDoc.source);
    console.log('  Risk Score:', savedDoc.riskScore);
    console.log('  Sequence Shape in DB:', savedDoc.environmentalInput?.sequence?.length, 'x', savedDoc.environmentalInput?.sequence?.[0]?.length);
    // Cleanup the test record
    await Prediction.findByIdAndDelete(savedDoc._id);
    console.log('  Test prediction document cleaned up.');
  }

  await mongoose.disconnect();
  console.log('\nTEST COMPLETED SUCCESSFULLY!');
}

testTriggerRoute().catch(async (err) => {
  console.error('Trigger test failed:', err);
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  process.exit(1);
});
