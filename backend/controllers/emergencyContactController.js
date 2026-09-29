const { getAuth } = require('@clerk/express');
const { connectDatabase } = require('../config/db');
const User = require('../models/User');
const EmergencyContact = require('../models/EmergencyContact');

function requireUserId(req, res) {
  const { isAuthenticated, userId } = getAuth(req);
  if (!isAuthenticated || !userId) {
    res.status(401).json({ success: false, message: 'Authentication required.' });
    return null;
  }
  return userId;
}

function normalizeUsername(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

async function listContacts(req, res) {
  const ownerClerkUserId = requireUserId(req, res);
  if (!ownerClerkUserId) return;
  try {
    await connectDatabase();
    const contacts = await EmergencyContact.find({ ownerClerkUserId }).sort({ createdAt: -1 }).lean();
    return res.json({ success: true, contacts });
  } catch (error) {
    console.error('Contact lookup failed:', error.message);
    return res.status(503).json({ success: false, message: 'Unable to load emergency contacts.' });
  }
}

async function addContact(req, res) {
  const ownerClerkUserId = requireUserId(req, res);
  if (!ownerClerkUserId) return;
  const username = normalizeUsername(req.body?.username);
  if (!username) return res.status(400).json({ success: false, message: 'A username is required.' });
  if (!/^[a-z0-9_]+$/.test(username)) {
    return res.status(400).json({ success: false, message: 'Username may contain only letters, numbers, and underscores.' });
  }

  try {
    await connectDatabase();
    const target = await User.findOne({ username }).lean();
    if (!target || target.username.startsWith('__pending_')) {
      return res.status(404).json({ success: false, message: 'SunoSaathi user not found.' });
    }
    if (target.clerkUserId === ownerClerkUserId) {
      return res.status(400).json({ success: false, message: 'You cannot add yourself as an emergency contact.' });
    }

    const contact = await EmergencyContact.create({
      ownerClerkUserId,
      contactClerkUserId: target.clerkUserId,
      contactUsername: target.username,
      contactName: `${target.firstName} ${target.lastName}`.trim() || target.username,
    });
    return res.status(201).json({ success: true, contact: contact.toObject() });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'That user is already an emergency contact.' });
    }
    console.error('Contact creation failed:', error.message);
    return res.status(503).json({ success: false, message: 'Unable to add emergency contact.' });
  }
}

async function removeContact(req, res) {
  const ownerClerkUserId = requireUserId(req, res);
  if (!ownerClerkUserId) return;
  try {
    await connectDatabase();
    const deleted = await EmergencyContact.findOneAndDelete({ _id: req.params.id, ownerClerkUserId });
    if (!deleted) return res.status(404).json({ success: false, message: 'Emergency contact not found.' });
    return res.json({ success: true, contactId: req.params.id });
  } catch (error) {
    console.error('Contact deletion failed:', error.message);
    return res.status(503).json({ success: false, message: 'Unable to remove emergency contact.' });
  }
}

module.exports = { listContacts, addContact, removeContact };
