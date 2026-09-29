const mongoose = require('mongoose');

const emergencyContactSchema = new mongoose.Schema(
  {
    ownerClerkUserId: { type: String, required: true, index: true },
    contactClerkUserId: { type: String, required: true, index: true },
    contactUsername: { type: String, required: true },
    contactName: { type: String, default: '' },
  },
  { timestamps: true }
);

emergencyContactSchema.index(
  { ownerClerkUserId: 1, contactClerkUserId: 1 },
  { unique: true }
);

module.exports = mongoose.models.EmergencyContact || mongoose.model('EmergencyContact', emergencyContactSchema);
