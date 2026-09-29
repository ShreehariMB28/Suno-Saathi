const { connectDatabase } = require('../config/db');
const EmergencyAlert = require('../models/EmergencyAlert');
const EmergencyContact = require('../models/EmergencyContact');
const User = require('../models/User');
const { emitToUser } = require('./realtime');

async function createAndNotifyEmergencyAlerts({ io, victimClerkUserId, message, location, distressScore }) {
  await connectDatabase();
  const [victim, contacts] = await Promise.all([
    User.findOne({ clerkUserId: victimClerkUserId }).lean(),
    EmergencyContact.find({ ownerClerkUserId: victimClerkUserId }).lean(),
  ]);

  if (!victim || !victim.username || victim.username.startsWith('__pending_')) return [];

  const alerts = await Promise.all(
    contacts.map(async (contact) => {
      const alert = await EmergencyAlert.create({
        victimClerkUserId,
        victimUsername: victim.username,
        contactClerkUserId: contact.contactClerkUserId,
        message,
        location,
        distressScore: Number.isFinite(Number(distressScore)) ? Number(distressScore) : 0,
      });
      const payload = alert.toObject();
      emitToUser(io, contact.contactClerkUserId, 'emergency-alert', payload);
      return payload;
    })
  );

  return alerts;
}

module.exports = { createAndNotifyEmergencyAlerts };
