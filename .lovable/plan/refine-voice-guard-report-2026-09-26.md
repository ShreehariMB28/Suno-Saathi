# Refine Voice Guard Report

## Scope
- Preserve the single-page Record, Upload, Analyze, and Clear workflow.
- Replace the oversized centered recorder with a compact, asymmetric audio-input console.
- Add explicit idle, recording, recorded, analyzing, and analyzed states.
- Tie elapsed time to the active `MediaRecorder`, freeze it on stop, and reset it on clear or a new take.
- Add a single mock-analysis switch beside the API configuration; mock mode returns one centralized realistic report after a short delay.
- Rework the report into dense score, summary, signal, event-log, transcript, and raw-response sections.
- Keep the dark monochrome security-tool visual direction, using restrained warning colors only for status.

## Technical details
- Keep browser recording and blob metadata as the source of recorded duration where available.
- Keep the existing backend POST contract unchanged when mock mode is disabled.
- Ensure recorder timers, animation frames, media tracks, object URLs, and pending mock requests clean up safely.
- Validate the updated screen at desktop and mobile widths, including upload-to-analysis and clear flows.
