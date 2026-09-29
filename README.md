# SunoSaathi Report

Build a clean, single-page web app called "Voice Distress Analyzer" for a personal safety hackathon project. This is the FIRST version — it only needs to record or upload an audio file, send it to a backend API, and display a detailed timestamped analysis report. No real-time streaming yet.

## Core Purpose
The app lets a user record or upload a phone-call-style voice clip. The backend analyzes the audio for distress indicators (pitch changes, energy, pauses, breathing proxy, code words). The frontend shows a professional report of what was detected and at what timestamp.

## Tech Constraints
- Use React + Tailwind CSS + shadcn/ui components.
- Use the browser MediaRecorder API for audio recording.
- Send audio as multipart/form-data to a configurable backend endpoint (default: http://localhost:8000/analyze).
- Store the backend URL in a simple config constant at the top of the file so it's easy to change.
- Keep everything in a single page with clear sections. No routing needed.

## Color Scheme (IMPORTANT — follow strictly)
Use a dark, monochrome theme built entirely from shades of black, charcoal, and gray. No bright colors except for severity indicators.

- Background: near-black (#0A0A0A) for the page, #121212 for cards.
- Borders: #262626 (subtle), #333333 (hover).
- Text: #F5F5F5 for primary, #A3A3A3 for secondary, #737373 for muted.
- Primary accent: white (#FFFFFF) for buttons, active states, and highlights.
- Buttons: white background with black text (primary), transparent with gray border (secondary).
- Hover states: slightly lighter grays (#1A1A1A → #262626).
- Shadows: subtle, dark, no colored glow.
- Severity indicators ONLY use muted color:
  - Normal → #4ADE80 (soft green) at 60% opacity
  - Warning → #FBBF24 (soft amber) at 60% opacity
  - Critical → #F87171 (soft red) at 70% opacity
- These severity colors should be used sparingly — small dots, thin badges, or left borders only. Never as large filled areas.
- The distress score gauge should be white/gray by default, and only take on the severity color when the score crosses thresholds.
- Everything else stays monochrome.

Overall feel: sleek, dark, minimal, premium — like a security dashboard or a developer tool. Think Vercel dark mode, Linear, or Raycast.

## Layout (top to bottom)

### 1. Header
- App title: "Voice Distress Analyzer"
- Subtitle: "Record or upload a voice clip to analyze distress indicators."
- Small privacy note: "Audio is processed for analysis only. Raw audio is not stored."

### 2. Input Section (Card)
- Two tabs: "Record" and "Upload".
  - Record tab: big circular record button, live timer, waveform or audio level bar while recording, Stop button when recording.
  - Upload tab: drag-and-drop zone accepting .wav, .mp3, .m4a.
- After recording or upload, show:
  - Audio player (native HTML audio element) so the user can preview.
  - File name, duration, size.
  - "Analyze" button (primary, white background with black text).
  - "Clear" button (secondary, transparent with gray border).

### 3. Loading State
- When Analyze is clicked, show a skeleton loader or spinner with text "Analyzing voice patterns..."
- Disable the Analyze button during processing.
- Use grayscale animation only.

### 4. Report Section (appears after backend responds)
This is the main deliverable. Show the following:

#### 4.1 Summary Card
- Overall distress score (0–100) shown as a large circular gauge.
- Gauge base color: gray (#404040).
- Gauge fill color: white for low, soft amber for moderate, soft red for high.
- Verdict label: "Low Risk", "Moderate Risk", "High Risk" — text color matches severity but muted.
- Number of triggers detected.
- Total audio duration analyzed.
- Timestamp of analysis.

#### 4.2 Trigger Breakdown Card
A grid of small cards, one per indicator, each showing:
- Indicator name: Pitch Anomaly, Energy Anomaly, Pause Anomaly, Breathing Proxy, Code Word Match.
- Status: Detected / Not Detected (monochrome badge — white text on dark gray for detected, muted gray for not detected).
- A short value (e.g., "pitch elevated by 22%").
- Small icon for each, in gray or white.

#### 4.3 Timeline Report (most important)
A vertical timeline showing what was examined at each timestamp.
Each entry includes:
- Timestamp (mm:ss.ms)
- Indicator type (monochrome badge with gray background and white text)
- Short description (e.g., "Pitch rose from 150 Hz to 210 Hz", "Silence detected for 3.2s", "Code word 'blue umbrella' matched")
- Severity tag: a small colored dot only — green / amber / red — next to the entry. No large colored blocks.

Make the timeline scrollable if long. Group entries by second if there are many. Use a thin gray vertical line connecting entries.

#### 4.4 Transcript Card (optional, if backend returns it)
- Show the full transcript with a timestamp next to each sentence.
- Highlight any matched code words with a subtle red underline or a thin red left border. Do not use a bright red filled background — keep it dark and subtle.

#### 4.5 Raw JSON Card (collapsible)
- A collapsible section "View raw backend response" showing the JSON payload for debugging.
- Use a monospace font on a slightly darker background (#0A0A0A).

### 5. Backend Response Shape (expected)
The backend will return JSON in this format — design the UI to handle it:
{
  "distress_score": 78,
  "verdict": "High Risk",
  "duration_seconds": 42.5,
  "analyzed_at": "2026-09-26T15:42:00Z",
  "triggers": {
    "pitch_anomaly": { "detected": true, "summary": "Pitch elevated by 22%" },
    "energy_anomaly": { "detected": true, "summary": "Energy dropped 35%" },
    "pause_anomaly": { "detected": true, "summary": "Longest pause 4.1s" },
    "breathing_proxy": { "detected": false, "summary": "Within normal range" },
    "code_word": { "detected": true, "summary": "Matched 'blue umbrella'" }
  },
  "timeline": [
    { "timestamp": 0.0, "type": "pitch", "description": "Baseline pitch: 152 Hz", "severity": "normal" },
    { "timestamp": 8.4, "type": "energy", "description": "Energy spike detected", "severity": "warning" },
    { "timestamp": 12.1, "type": "pause", "description": "Silence for 3.2s", "severity": "warning" },
    { "timestamp": 18.7, "type": "code_word", "description": "Matched 'blue umbrella'", "severity": "critical" }
  ],
  "transcript": [
    { "timestamp": 0.0, "text": "Hey, how's it going?" },
    { "timestamp": 18.5, "text": "I'll bring the blue umbrella tomorrow." }
  ]
}

### 6. Error Handling
- If the backend is unreachable, show a dark alert card with a thin red left border: "Could not reach backend. Is the server running?"
- If the response is malformed, show a friendly error and the raw response in the JSON card.

## Design Style
- Dark, monochrome, minimal, premium.
- Background near-black, cards slightly lighter charcoal.
- Rounded corners (8–12px), subtle dark shadows, generous spacing.
- Primary accent is white. Use gray shades for hierarchy.
- Severity colors used only as small dots or thin borders — never large fills.
- Font: Inter or system sans-serif. Monospace for JSON and timestamps.
- Mobile responsive.
- Use lucide-react icons in gray/white (mic, upload, activity, alert-triangle, check-circle).

## What NOT to build
- No real-time streaming, no WebSocket, no live monitor.
- No authentication, no routing, no database.
- No code-word configuration UI yet.
- No Telegram/SMS alert UI yet.

Build it as a single page that works end-to-end: record → send → receive → display report.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://sonic-sentinel-tool.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/ae7421ca-d89a-4ca7-9560-512e81bb371e).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
# Suno-Saathi
