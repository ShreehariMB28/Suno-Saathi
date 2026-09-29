const fs = require('fs/promises');
const { transcribeAudio } = require('../services/geminiService');
const { analyzeAudio } = require('../services/audioAnalysis');

function buildAnalysis(transcript = '', userCodewords = [], voiceResult = null) {
  const textLower = transcript.toLowerCase();
  const codewordsDetected = userCodewords.filter((cw) =>
    cw.trim() !== '' && textLower.includes(cw.toLowerCase())
  );

  const stressScore = voiceResult?.distress_score ?? 0;
  const codewordScore = Math.min(100, codewordsDetected.length * 50);
  const totalScore = Math.min(100, Math.max(stressScore, codewordScore));
  const level = totalScore >= 90 ? 'Critical Alert' : totalScore >= 70 ? 'High Alert' : totalScore >= 40 ? 'Warning' : 'Normal';

  const signals = voiceResult?.signals || {
    pitchVariation: Math.floor(30 + (stressScore * 0.4)),
    energyVariation: Math.floor(25 + (stressScore * 0.5)),
    pausePattern: Math.floor(20 + (stressScore * 0.3)),
    speechPattern: Math.floor(30 + (stressScore * 0.4)),
  };

  const summary = codewordsDetected.length > 0
    ? `DANGER ALERT: Safety codeword(s) "${codewordsDetected.join(', ')}" detected in voice stream.`
    : stressScore >= 90
    ? `CRITICAL DISTRESS: Severe acoustic agitation and emotional distress detected (Score: ${stressScore}).`
    : stressScore >= 70
    ? `ELEVATED STRESS: Voice acoustic metrics suggest high emotional distress (Score: ${stressScore}).`
    : `NORMAL: No distress codewords detected in speech. Acoustic parameters within baseline.`;

  return {
    score: totalScore,
    level,
    signals,
    summary,
    transcript,
    codewordsDetected,
    stressScore,
    codewordScore,
    emergencyTriggered: codewordsDetected.length > 0 || totalScore >= 70,
  };
}

async function analyzeController(req, res) {
  const uploadedFile = req.file;

  try {
    if (!uploadedFile) {
      return res.status(400).json({
        success: false,
        message: 'Audio file is required.',
      });
    }

    let codewords = ['red velvet', 'help me', 'apple pie', 'mayday', 'danger'];
    if (req.body?.codewords) {
      try {
        codewords = JSON.parse(req.body.codewords);
      } catch {
        if (typeof req.body.codewords === 'string') {
          codewords = req.body.codewords.split(',').map((s) => s.trim());
        }
      }
    }

    const transcript = await transcribeAudio(uploadedFile.path, uploadedFile.mimetype);
    const voiceResult = await analyzeAudio(uploadedFile.path);
    const analysis = buildAnalysis(transcript, codewords, voiceResult);

    return res.json({
      success: true,
      message: 'Audio transcribed and analyzed successfully',
      analysis,
      transcript,
    });
  } catch (error) {
    if (error.message === 'Gemini API key is not configured.') {
      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Unable to transcribe audio with Gemini.',
    });
  } finally {
    if (uploadedFile?.path) {
      try {
        await fs.unlink(uploadedFile.path);
      } catch (cleanupError) {
        if (cleanupError.code !== 'ENOENT') {
          console.error('Failed to remove temporary audio file:', cleanupError.message);
        }
      }
    }
  }
}

module.exports = { analyzeController };