const { getAuth } = require('@clerk/express');
const { connectDatabase } = require('../config/db');
const PitchHistory = require('../models/PitchHistory');

function requireUserId(req, res) {
  const { isAuthenticated, userId } = getAuth(req);
  if (!isAuthenticated || !userId) {
    res.status(401).json({ success: false, message: 'Authentication required.' });
    return null;
  }
  return userId;
}

async function createPitchHistory(req, res) {
  const userClerkId = requireUserId(req, res);
  if (!userClerkId) return;

  const { pitchTimeline, durationSeconds } = req.body || {};
  if (!Array.isArray(pitchTimeline) || pitchTimeline.length === 0) {
    return res.status(400).json({ success: false, message: 'pitchTimeline must be a non-empty array.' });
  }
  if (!pitchTimeline.every((value) => typeof value === 'number' && Number.isFinite(value))) {
    return res.status(400).json({ success: false, message: 'pitchTimeline values must be finite numbers.' });
  }
  if (typeof durationSeconds !== 'number' || !Number.isFinite(durationSeconds) || durationSeconds < 0) {
    return res.status(400).json({ success: false, message: 'durationSeconds must be a non-negative number.' });
  }

  const normalizedTimeline = pitchTimeline.map((value) => Math.min(1, Math.max(0, value)));
  const pitchAverage = normalizedTimeline.reduce((sum, value) => sum + value, 0) / normalizedTimeline.length;
  const pitchMinimum = Math.min(...normalizedTimeline);
  const pitchMaximum = Math.max(...normalizedTimeline);

  try {
    await connectDatabase();
    const record = await PitchHistory.create({
      userClerkId,
      pitchTimeline: normalizedTimeline,
      pitchAverage,
      pitchMinimum,
      pitchMaximum,
      durationSeconds,
    });

    const records = await PitchHistory.find({ userClerkId })
      .sort({ createdAt: -1 })
      .select('_id')
      .lean();
    const staleIds = records.slice(2).map(({ _id }) => _id);
    if (staleIds.length > 0) {
      await PitchHistory.deleteMany({ userClerkId, _id: { $in: staleIds } });
    }

    return res.status(201).json({ success: true, record: record.toObject() });
  } catch (error) {
    console.error('Pitch history creation failed:', error.message);
    return res.status(503).json({ success: false, message: 'Unable to save pitch history.' });
  }
}

async function listPitchHistory(req, res) {
  const userClerkId = requireUserId(req, res);
  if (!userClerkId) return;

  try {
    await connectDatabase();
    const records = await PitchHistory.find({ userClerkId })
      .sort({ createdAt: -1 })
      .limit(2)
      .lean();
    return res.json({ success: true, records });
  } catch (error) {
    console.error('Pitch history lookup failed:', error.message);
    return res.status(503).json({ success: false, message: 'Unable to load pitch history.' });
  }
}

module.exports = { createPitchHistory, listPitchHistory };
