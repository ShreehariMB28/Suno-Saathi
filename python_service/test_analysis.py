import io
import wave
import sys
import numpy as np
from main import extract_acoustic_features, get_status_label, DISTRESS_THRESHOLD_HIGH, DISTRESS_THRESHOLD_CRITICAL

def generate_test_wav(distress_level="low"):
    sample_rate = 16000
    duration = 3.0
    t = np.linspace(0, duration, int(sample_rate * duration), False)
    
    if distress_level == "critical":
        # Screams, gasps, rapid pitch breaks & vocal strain
        signal = np.zeros(len(t))
        for i in range(len(t)):
            mod = np.sin(2 * np.pi * 6 * t[i])
            if mod > -0.2:
                freq = 700 + 700 * np.sin(2 * np.pi * 30 * t[i])
                signal[i] = 0.85 * np.sin(2 * np.pi * freq * t[i]) + 0.3 * np.random.normal(0, 1)
            else:
                signal[i] = 0.02 * np.random.normal(0, 1) # sudden gasp pause
    elif distress_level == "high":
        # Elevated pitch fluctuation and moderate energy modulation
        freq = 450 + 350 * np.sin(2 * np.pi * 18 * t)
        amplitude_env = 0.5 + 0.35 * np.sin(2 * np.pi * 7 * t)
        signal = amplitude_env * np.sin(2 * np.pi * freq * t) + 0.1 * np.random.normal(0, 1, len(t))
    else:
        # Steady calm tone
        signal = 0.2 * np.sin(2 * np.pi * 180 * t)
        
    signal_int16 = (np.clip(signal, -1.0, 1.0) * 32767).astype(np.int16)
    
    wav_io = io.BytesIO()
    with wave.open(wav_io, 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(signal_int16.tobytes())
        
    return wav_io.getvalue()

def run_tests():
    print("--- RUNNING ENHANCED VOICE DISTRESS ANALYSIS TESTS ---")
    
    # Test 1: Normal Audio -> Low Distress Score
    normal_wav = generate_test_wav("low")
    res_normal = extract_acoustic_features(normal_wav, "normal.wav")
    score_normal = res_normal["distress_score"]
    status_normal = get_status_label(score_normal)
    print(f"Test 1 (Normal Audio): Score = {score_normal}, Status = {status_normal}, High Alert = {score_normal >= DISTRESS_THRESHOLD_HIGH}")
    assert 0 <= score_normal < DISTRESS_THRESHOLD_HIGH, "Normal audio should stay below high distress threshold"
    
    # Test 2: High Distress Audio -> Score >= 70
    high_wav = generate_test_wav("high")
    res_high = extract_acoustic_features(high_wav, "high_stress.wav")
    score_high = res_high["distress_score"]
    status_high = get_status_label(score_high)
    print(f"Test 2 (High Distress Audio): Score = {score_high}, Status = {status_high}, High Alert = {score_high >= DISTRESS_THRESHOLD_HIGH}")
    assert score_high >= DISTRESS_THRESHOLD_HIGH, "High distress audio should reach threshold >= 70"
    
    # Test 3: Critical Distress Audio -> Score >= 90
    critical_wav = generate_test_wav("critical")
    res_crit = extract_acoustic_features(critical_wav, "critical_stress.wav")
    score_crit = res_crit["distress_score"]
    status_crit = get_status_label(score_crit)
    print(f"Test 3 (Critical Distress Audio): Score = {score_crit}, Status = {status_crit}, Critical Escalation = {score_crit >= DISTRESS_THRESHOLD_CRITICAL}")
    assert score_crit >= DISTRESS_THRESHOLD_CRITICAL, "Critical distress audio should reach threshold >= 90"

    # Test 4: Invalid/Missing Audio -> Graceful Error Handling
    print("Test 4 (Invalid/Missing Audio):")
    try:
        extract_acoustic_features(b"", "empty.wav")
        print("  FAILED: Exception expected for empty audio")
    except ValueError as e:
        print(f"  PASSED: Gracefully caught ValueError -> {e}")
        
    print("\nALL ENHANCED TESTS COMPLETED SUCCESSFULLY!")

if __name__ == "__main__":
    run_tests()

