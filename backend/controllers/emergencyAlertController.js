const { getAuth } = require('@clerk/express');
const { connectDatabase } = require('../config/db');
const EmergencyAlert = require('../models/EmergencyAlert');

async function listAlerts(req, res) {
  const { isAuthenticated, userId } = getAuth(req);
  if (!isAuthenticated || !userId) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }
  try {
    await connectDatabase();
    const alerts = await EmergencyAlert.find({ contactClerkUserId: userId }).sort({ createdAt: -1 }).limit(100).lean();
    return res.json({ success: true, alerts });
  } catch (error) {
    console.error('Alert history lookup failed:', error.message);
    return res.status(503).json({ success: false, message: 'Unable to load emergency alerts.' });
  }
}

async function markAlertRead(req, res) {
  const { isAuthenticated, userId } = getAuth(req);
  if (!isAuthenticated || !userId) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }
  try {
    await connectDatabase();
    const alert = await EmergencyAlert.findOneAndUpdate(
      { _id: req.params.id, contactClerkUserId: userId, status: 'active' },
      { status: 'read', readAt: new Date() },
      { new: true }
    ).lean();
    if (!alert) return res.status(404).json({ success: false, message: 'Emergency alert not found.' });
    return res.json({ success: true, alert });
  } catch (error) {
    console.error('Alert update failed:', error.message);
    return res.status(503).json({ success: false, message: 'Unable to update emergency alert.' });
  }
}

module.exports = { listAlerts, markAlertRead };
