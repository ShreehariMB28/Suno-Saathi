const { sendEmergencyAlerts } = require('../services/twilioService');
const { getAuth } = require('@clerk/express');
const { createAndNotifyEmergencyAlerts } = require('../services/emergencyAlertService');

async function sendAlertController(req, res) {
  try {
    const { isAuthenticated, userId } = getAuth(req);
    if (!isAuthenticated || !userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    const { message, location } = req.body;
    const contacts = Array.isArray(req.body?.contacts) ? req.body.contacts : [];

    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Alert details are required.',
      });
    }

    const alertMessage = message || 'DISTRESS DETECTED: High stress or emergency codeword detected in speech analysis.';

    const results = await sendEmergencyAlerts({
      contacts,
      message: alertMessage,
      location,
    });

    let inAppAlerts = [];
    try {
      inAppAlerts = await createAndNotifyEmergencyAlerts({
        io: req.app.locals.io,
        victimClerkUserId: userId,
        message: alertMessage,
        location,
        distressScore: req.body?.distressScore,
      });
    } catch (error) {
      console.error('In-app emergency notification failed:', error.message);
    }

    return res.json({
      success: true,
      message: 'Emergency alerts processed successfully.',
      dispatches: results,
      inAppAlerts,
    });
  } catch (error) {
    console.error('Error in sendAlertController:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to send emergency alerts.',
    });
  }
}

module.exports = { sendAlertController };
