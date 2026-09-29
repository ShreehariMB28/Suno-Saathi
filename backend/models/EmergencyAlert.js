const mongoose = require('mongoose');

const emergencyAlertSchema = new mongoose.Schema(
  {
    victimClerkUserId: { type: String, required: true, index: true },
    victimUsername: { type: String, required: true },
    contactClerkUserId: { type: String, required: true, index: true },
    message: { type: String, required: true },
    distressScore: { type: Number, min: 0, max: 100, default: 0 },
    location: {
      latitude: { type: Number, required: false },
      longitude: { type: Number, required: false },
    },
    triggeredAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['active', 'read', 'resolved'], default: 'active' },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

emergencyAlertSchema.index({ contactClerkUserId: 1, createdAt: -1 });

module.exports = mongoose.models.EmergencyAlert || mongoose.model('EmergencyAlert', emergencyAlertSchema);
