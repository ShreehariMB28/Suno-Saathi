const twilio = require('twilio');

function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (
    !accountSid ||
    !authToken ||
    accountSid.includes('your_twilio') ||
    authToken.includes('your_twilio')
  ) {
    return null;
  }

  try {
    return twilio(accountSid, authToken);
  } catch (err) {
    console.error('Failed to initialize Twilio client:', err.message);
    return null;
  }
}

async function sendEmergencyAlerts({ contacts, message, location }) {
  const client = getTwilioClient();
  const fromSMS = process.env.TWILIO_PHONE_NUMBER;
  const fromWhatsApp = process.env.TWILIO_WHATSAPP_NUMBER || '+14155238886';

  let locationText = '';
  if (location && location.latitude && location.longitude) {
    const mapUrl = `https://www.google.com/maps?q=${location.latitude},${location.longitude}`;
    locationText = `\n📍 Live Location: ${mapUrl}`;
  }

  const alertBody = `🚨 SUNOSAATHI EMERGENCY ALERT 🚨\n${message}${locationText}\n\nPlease take immediate action.`;

  const results = [];

  for (const contact of contacts) {
    const rawPhone = contact.phone || '';
    const cleanPhone = rawPhone.replace(/[^\d+]/g, '');

    if (!cleanPhone) {
      results.push({ contact: contact.name, status: 'skipped', reason: 'Invalid phone number' });
      continue;
    }

    if (!client) {
      console.log(`[MOCK DISPATCH] To: ${contact.name} (${cleanPhone}) | Body: ${alertBody}`);
      results.push({
        contact: contact.name,
        phone: cleanPhone,
        status: 'simulated',
        note: 'Twilio keys not configured in backend/.env',
      });
      continue;
    }

    // Send SMS
    try {
      if (fromSMS) {
        const smsRes = await client.messages.create({
          body: alertBody,
          from: fromSMS,
          to: cleanPhone,
        });
        results.push({ contact: contact.name, channel: 'SMS', sid: smsRes.sid, status: 'sent' });
      }
    } catch (err) {
      console.error(`Failed to send SMS to ${contact.name}:`, err.message);
      results.push({ contact: contact.name, channel: 'SMS', status: 'error', error: err.message });
    }

    // Send WhatsApp Message
    try {
      const waTo = cleanPhone.startsWith('whatsapp:') ? cleanPhone : `whatsapp:${cleanPhone}`;
      const waFrom = fromWhatsApp.startsWith('whatsapp:') ? fromWhatsApp : `whatsapp:${fromWhatsApp}`;

      const waRes = await client.messages.create({
        body: alertBody,
        from: waFrom,
        to: waTo,
      });
      results.push({ contact: contact.name, channel: 'WhatsApp', sid: waRes.sid, status: 'sent' });
    } catch (err) {
      console.error(`Failed to send WhatsApp to ${contact.name}:`, err.message);
      results.push({ contact: contact.name, channel: 'WhatsApp', status: 'error', error: err.message });
    }
  }

  return results;
}

module.exports = { sendEmergencyAlerts };
