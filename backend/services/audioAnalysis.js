const fs = require('fs');

const PYTHON_ANALYSIS_URL = process.env.PYTHON_ANALYSIS_URL || 'http://localhost:8000/api/isunderstress';

/**
 * Analyzes audio via the Py-Stress-Detector microservice.
 * Output contract:
 * {
 *   distress_score: number (0-100),
 *   status: "low" | "moderate" | "high" | "very_high",
 *   is_distressed: boolean
 * }
 */
async function analyzeAudio(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) {
      return {
        distress_score: 0,
        status: 'low',
        is_distressed: false,
        error: 'Audio file not found',
      };
    }

    const fileBuffer = fs.readFileSync(filePath);
    const blob = new Blob([fileBuffer], { type: 'audio/wav' });

    const formData = new FormData();
    formData.append('file', blob, 'audio.wav');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(PYTHON_ANALYSIS_URL, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      return {
        distress_score: data.distress_score ?? 0,
        status: data.status ?? 'low',
        is_distressed: Boolean(data.is_distressed),
      };
    }
  } catch (err) {
    console.warn('Py-Stress-Detector service unavailable, returning fallback state:', err.message);
  }

  // Graceful fallback when analysis API is unavailable or errors out
  return {
    distress_score: 0,
    status: 'low',
    is_distressed: false,
    available: false,
  };
}

module.exports = { analyzeAudio };