import os
import io
import wave
import numpy as np
import scipy.fft as fft
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI(
    title="Py-Stress-Detector API",
    description="Voice Distress & Stress Analysis Microservice",
    version="1.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configurable distress thresholds (User Spec: >= 70 High, >= 90 Critical)
DISTRESS_THRESHOLD_HIGH = float(os.getenv("DISTRESS_THRESHOLD_HIGH", "70"))
DISTRESS_THRESHOLD_CRITICAL = float(os.getenv("DISTRESS_THRESHOLD_CRITICAL", "90"))

def get_status_label(score: float) -> str:
    if score >= DISTRESS_THRESHOLD_CRITICAL:
        return "critical"
    elif score >= DISTRESS_THRESHOLD_HIGH:
        return "high"
    elif score >= 40:
        return "moderate"
    else:
        return "low"

def parse_audio_samples(audio_bytes: bytes):
    """
    Parses audio bytes into a float32 numpy array and sample rate.
    Handles RIFF WAV directly and provides graceful fallback decoding for raw/other PCM streams.
    """
    if not audio_bytes or len(audio_bytes) == 0:
        raise ValueError("Audio payload is empty")

    sample_rate = 16000
    samples = None

    # Try standard RIFF WAV header parsing first
    try:
        with wave.open(io.BytesIO(audio_bytes), 'rb') as wf:
            sample_rate = wf.getframerate()
            n_frames = wf.getnframes()
            n_channels = wf.getnchannels()
            sampwidth = wf.getsampwidth()
            raw_frames = wf.readframes(n_frames)

            dtype_map = {1: np.int8, 2: np.int16, 4: np.int32}
            dtype = dtype_map.get(sampwidth, np.int16)
            data = np.frombuffer(raw_frames, dtype=dtype)

            if n_channels > 1:
                data = data[::n_channels]
            samples = data.astype(np.float32) / np.iinfo(dtype).max
    except Exception:
        # Fallback raw byte stream interpretation
        try:
            raw_data = np.frombuffer(audio_bytes, dtype=np.int16)
            if len(raw_data) > 0:
                samples = raw_data.astype(np.float32) / 32768.0
        except Exception as e:
            raise ValueError(f"Could not parse audio samples: {str(e)}")

    if samples is None or len(samples) < 100:
        raise ValueError("Insufficient audio samples for distress analysis")

    return samples, sample_rate

def extract_acoustic_features(audio_bytes: bytes, filename: str):
    """
    Multi-Indicator Voice Distress Analysis Engine:
    Combines energy dynamics, pitch/ZCR variance, spectral centroid shifts (high-frequency energy),
    pause ratios, and window-based consistency aggregation to produce a robust distress score (0-100).
    """
    samples, sample_rate = parse_audio_samples(audio_bytes)

    # 20ms frame analysis
    frame_length = max(160, int(sample_rate * 0.02))
    hop_length = frame_length // 2
    num_frames = max(1, (len(samples) - frame_length) // hop_length + 1)

    energies = []
    zcrs = []
    centroids = []
    hf_ratios = []
    silence_frames = 0

    for i in range(num_frames):
        start = i * hop_length
        end = start + frame_length
        frame = samples[start:end]

        # 1. RMS Energy
        rms = np.sqrt(np.mean(frame ** 2) + 1e-12)
        energies.append(rms)

        # Silence threshold (-40dB approx)
        if rms < 0.01:
            silence_frames += 1

        # 2. Zero Crossing Rate (Pitch proxy)
        zcr = np.mean(np.abs(np.diff(np.signbit(frame))))
        zcrs.append(zcr)

        # 3. Spectral Centroid & High-Frequency Energy Ratio (FFT)
        if len(frame) >= 16:
            spectrum = np.abs(fft.rfft(frame))
            freqs = fft.rfftfreq(len(frame), 1.0 / sample_rate)
            spec_sum = np.sum(spectrum) + 1e-12

            centroid = np.sum(freqs * spectrum) / spec_sum
            centroids.append(centroid)

            # High-frequency ratio (>1000 Hz energy fraction)
            hf_mask = freqs >= 1000.0
            hf_energy = np.sum(spectrum[hf_mask]) / spec_sum
            hf_ratios.append(hf_energy)
        else:
            centroids.append(0.0)
            hf_ratios.append(0.0)

    energies = np.array(energies)
    zcrs = np.array(zcrs)
    centroids = np.array(centroids)
    hf_ratios = np.array(hf_ratios)

    # Window-based Segment Analysis for False-Alert Protection
    # Group frames into ~1.5 second windows (75 frames at 20ms/10ms hop)
    window_size = max(10, int(1.5 / 0.01))
    window_hop = window_size // 2
    num_windows = max(1, (num_frames - window_size) // window_hop + 1)

    segment_scores = []

    for w in range(num_windows):
        w_start = w * window_hop
        w_end = w_start + window_size
        w_energies = energies[w_start:w_end]
        w_zcrs = zcrs[w_start:w_end]
        w_hf = hf_ratios[w_start:w_end]

        # Energy variation score (0-100)
        e_std = np.std(w_energies) if len(w_energies) > 1 else 0
        w_energy_score = min(100.0, e_std * 2200.0)

        # Pitch variation score (ZCR std dev) (0-100)
        z_std = np.std(w_zcrs) if len(w_zcrs) > 1 else 0
        w_pitch_score = min(100.0, z_std * 1800.0)

        # High-frequency vocal strain score (0-100)
        w_hf_mean = np.mean(w_hf) if len(w_hf) > 0 else 0
        w_hf_score = min(100.0, w_hf_mean * 300.0)

        # Peak-to-average energy spike score (0-100)
        w_max_e = np.max(w_energies) if len(w_energies) > 0 else 0
        w_mean_e = np.mean(w_energies) if len(w_energies) > 0 else 1e-5
        w_papr_score = min(100.0, max(0.0, (w_max_e / (w_mean_e + 1e-5) - 1.0) * 40.0))

        # Silence / Pause ratio in window (0-100)
        w_silence = np.sum(w_energies < 0.01) / max(1, len(w_energies))
        w_pause_score = min(100.0, w_silence * 140.0)

        core_distress = max(w_pitch_score, w_energy_score)
        avg_core = (w_pitch_score + w_energy_score) / 2.0
        aux_distress = max(w_hf_score, w_papr_score)

        seg_score = (0.55 * core_distress +
                     0.30 * avg_core +
                     0.15 * aux_distress)
        segment_scores.append(seg_score)

    segment_scores = np.array(segment_scores)

    # Aggregated Distress Metrics
    max_segment_score = np.max(segment_scores) if len(segment_scores) > 0 else 0.0
    mean_segment_score = np.mean(segment_scores) if len(segment_scores) > 0 else 0.0
    sustained_high_count = np.sum(segment_scores >= DISTRESS_THRESHOLD_HIGH)
    sustained_ratio = sustained_high_count / max(1, len(segment_scores))

    # Composite Distress Score Formula (0-100)
    # 50% Peak Segment + 35% Sustained Mean + 15% Sustained Distress Ratio
    distress_score = round(0.50 * max_segment_score +
                           0.35 * mean_segment_score +
                           0.15 * (sustained_ratio * 100.0))
    distress_score = max(0, min(100, int(distress_score)))

    # Breakdown signals for UI rendering
    pitch_var_signal = min(100, int(np.std(zcrs) * 1200.0))
    energy_var_signal = min(100, int(np.std(energies) * 1600.0))
    pause_pat_signal = min(100, int((silence_frames / max(1, num_frames)) * 100.0))
    speech_pat_signal = min(100, int(np.mean(hf_ratios) * 200.0))

    return {
        "distress_score": distress_score,
        "signals": {
            "pitchVariation": pitch_var_signal,
            "energyVariation": energy_var_signal,
            "pausePattern": pause_pat_signal,
            "speechPattern": speech_pat_signal
        },
        "segment_metrics": {
            "total_segments": len(segment_scores),
            "max_segment_score": round(float(max_segment_score), 1),
            "mean_segment_score": round(float(mean_segment_score), 1),
            "sustained_distress": sustained_ratio >= 0.5
        }
    }


@app.get("/")
def health_check():
    return {
        "service": "Py-Stress-Detector",
        "status": "online",
        "endpoint": "/api/isunderstress",
        "thresholds": {
            "high_alert": DISTRESS_THRESHOLD_HIGH,
            "critical_escalation": DISTRESS_THRESHOLD_CRITICAL
        }
    }


@app.post("/api/isunderstress")
async def is_under_stress(file: UploadFile = File(...)):
    """
    Voice Stress/Distress Analysis Endpoint
    Accepts recorded voice audio file and computes Distress Risk Score (0-100).
    Independent of codewords. Supports score >= 70 (high) and score >= 90 (critical).
    """
    if not file:
        raise HTTPException(status_code=400, detail="No audio file provided.")

    try:
        contents = await file.read()
        if not contents or len(contents) == 0:
            raise HTTPException(status_code=400, detail="Empty audio file provided.")

        result = extract_acoustic_features(contents, file.filename or "recording.wav")
        distress_score = result["distress_score"]
        status = get_status_label(distress_score)
        is_distressed = distress_score >= DISTRESS_THRESHOLD_HIGH
        is_critical = distress_score >= DISTRESS_THRESHOLD_CRITICAL
        segment_metrics = {
            **result["segment_metrics"],
            "sustained_distress": bool(result["segment_metrics"]["sustained_distress"]),
        }

        return {
            "distress_score": distress_score,
            "status": status,
            "is_distressed": is_distressed,
            "is_critical": is_critical,
            "thresholds": {
                "high_alert": DISTRESS_THRESHOLD_HIGH,
                "critical_escalation": DISTRESS_THRESHOLD_CRITICAL
            },
            "signals": result["signals"],
            "segment_metrics": segment_metrics
        }
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Audio analysis failed: {str(err)}")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)

