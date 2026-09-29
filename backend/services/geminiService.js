const fs = require('fs/promises');

const { GoogleGenAI } = require('@google/genai');

const transcriptionPrompt = [
  'Transcribe the spoken words in this audio accurately.',
  'Return only the transcript.',
  'Do not summarize.',
  'Do not interpret emotion.',
  'Do not add information that is not spoken.',
].join('\n');

async function transcribeAudio(filePath, mimeType) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Gemini API key is not configured.');
  }

  const audioBuffer = await fs.readFile(filePath);
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    contents: [
      {
        inlineData: {
          data: audioBuffer.toString('base64'),
          mimeType,
        },
      },
      { text: transcriptionPrompt },
    ],
  });

  const audioTranscript = response.candidates
    ?.flatMap((candidate) => candidate.content?.parts ?? [])
    .map((part) => part.audioTranscription?.text)
    .find((text) => typeof text === 'string' && text.trim());
  const transcript = audioTranscript?.trim() || response.text?.trim();

  if (!transcript) {
    throw new Error('No transcript returned by Gemini');
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log('Gemini transcript:', transcript);
  }

  return transcript;
}

module.exports = { transcribeAudio };