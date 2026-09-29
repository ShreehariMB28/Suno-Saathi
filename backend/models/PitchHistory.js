const mongoose = require('mongoose');

const pitchHistorySchema = new mongoose.Schema(
  {
    userClerkId: { type: String, required: true, index: true },
    pitchTimeline: { type: [Number], required: true },
    pitchAverage: { type: Number, required: true },
    pitchMinimum: { type: Number, required: true },
    pitchMaximum: { type: Number, required: true },
    durationSeconds: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

pitchHistorySchema.index({ userClerkId: 1, createdAt: -1 });

module.exports = mongoose.models.PitchHistory || mongoose.model('PitchHistory', pitchHistorySchema);
