const { clerkClient, getAuth } = require('@clerk/express');
const { connectDatabase } = require('../config/db');
const User = require('../models/User');

function normalizeUsername(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function requireAuth(req, res) {
  const { isAuthenticated, userId } = getAuth(req);
  if (!isAuthenticated || !userId) {
    res.status(401).json({ success: false, message: 'Authentication required.' });
    return null;
  }
  return userId;
}

async function syncUser(req, res) {
  const clerkUserId = requireAuth(req, res);
  if (!clerkUserId) return;

  try {
    await connectDatabase();
    const clerkUser = await clerkClient.users.getUser(clerkUserId);
    const existingUser = await User.findOne({ clerkUserId }).lean();
    const clerkUsername = normalizeUsername(clerkUser.username);
    const username = existingUser?.username || clerkUsername || `__pending_${clerkUserId}`;
    const email = clerkUser.emailAddresses.find(
      (address) => address.id === clerkUser.primaryEmailAddressId
    )?.emailAddress || clerkUser.emailAddresses[0]?.emailAddress || '';

    const user = await User.findOneAndUpdate(
      { clerkUserId },
      {
        clerkUserId,
        username,
        firstName: clerkUser.firstName || '',
        lastName: clerkUser.lastName || '',
        email,
        imageUrl: clerkUser.imageUrl || '',
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    ).lean();

    return res.json({ success: true, user, needsUsername: user.username.startsWith('__pending_') });
  } catch (error) {
    console.error('User sync failed:', error.message);
    return res.status(503).json({ success: false, message: 'Unable to synchronize user profile.' });
  }
}

async function setUsername(req, res) {
  const clerkUserId = requireAuth(req, res);
  if (!clerkUserId) return;
  const username = normalizeUsername(req.body?.username);
  if (!/^[a-z0-9_]+$/.test(username)) {
    return res.status(400).json({ success: false, message: 'Username must use letters, numbers, or underscores.' });
  }
  if (username.length < 3 || username.length > 30) {
    return res.status(400).json({ success: false, message: 'Username must be 3 to 30 characters.' });
  }

  try {
    await connectDatabase();
    const user = await User.findOneAndUpdate(
      { clerkUserId },
      { $set: { username } },
      { new: true, runValidators: true }
    ).lean();
    if (!user) return res.status(404).json({ success: false, message: 'User profile has not been synchronized.' });
    return res.json({ success: true, user });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'That username is already taken.' });
    }
    console.error('Username update failed:', error.message);
    return res.status(503).json({ success: false, message: 'Unable to save username.' });
  }
}

async function getCurrentUser(req, res) {
  const clerkUserId = requireAuth(req, res);
  if (!clerkUserId) return;

  try {
    await connectDatabase();
    const user = await User.findOne({ clerkUserId }).lean();
    if (!user) {
      return res.status(404).json({ success: false, message: 'User profile has not been synchronized.' });
    }
    return res.json({ success: true, user });
  } catch (error) {
    console.error('Current user lookup failed:', error.message);
    return res.status(503).json({ success: false, message: 'Unable to load user profile.' });
  }
}

module.exports = { syncUser, getCurrentUser, setUsername };
