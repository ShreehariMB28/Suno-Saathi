import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { SignIn, SignUp, UserButton, useAuth } from "@clerk/react";
import { io } from "socket.io-client";
import {
  AlertOctagon,
  CheckCircle2,
  Edit3,
  Globe,
  History,
  Key,
  Loader2,
  MapPin,
  MessageSquare,
  Mic,
  MicOff,
  Plus,
  Phone,
  PhoneIncoming,
  PhoneOff,
  Radio,
  Search,
  ShieldAlert,
  ShieldCheck,
  Square,
  Trash2,
  Upload,
  UserPlus,
  Volume2,
  X,
} from "lucide-react";
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { requestAnalysis, sendEmergencyAlertsApi, type BackendAnalysis, type EmergencyLocation } from "@/services/api";


type EmergencyContact = {
  id: string;
  name: string;
  phone: string;
  relationship: string;
  autoDispatch: boolean;
};

type AppEmergencyContact = {
  _id: string;
  contactUsername: string;
  contactName: string;
};

type EmergencyAlert = {
  _id: string;
  victimUsername: string;
  message: string;
  distressScore: number;
  location?: EmergencyLocation | null;
  triggeredAt: string;
  status: "active" | "read" | "resolved";
};

type PitchHistoryRecord = {
  _id: string;
  pitchTimeline: number[];
  pitchAverage: number;
  pitchMinimum: number;
  pitchMaximum: number;
  durationSeconds: number;
  createdAt: string;
};

type HistoryItem = {
  id: string;
  timestamp: string;
  fileName: string;
  duration: number;
  score: number;
  level: string;
  transcript: string;
  codewordsDetected: string[];
  timelineMarkers?: { timestamp: string; codeword: string }[];
  summary: string;
  signals: {
    pitchVariation: number;
    energyVariation: number;
    pausePattern: number;
    speechPattern: number;
  };
};

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SunoSaathi — Voice Distress Signal Analyzer" },
      { name: "description", content: "Real-time speech distress analyzer & safety codeword detection system." },
    ],
  }),
  component: Dashboard,
});

function formatClock(seconds: number) {
  if (!Number.isFinite(seconds)) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

const SILENCE_TIMEOUT_MS = 15000;
const SILENCE_RMS_THRESHOLD = 0.08;
const LIVE_TIMELINE_POINTS = 60;

function createEmptyLiveTimeline() {
  return Array.from({ length: LIVE_TIMELINE_POINTS }, (_, index) => ({
    time: String(index),
    stress: 0,
  }));
}

function estimatePitch(samples: Uint8Array, sampleRate: number, rms: number) {
  if (rms < SILENCE_RMS_THRESHOLD) return 0;

  const centered = new Float32Array(samples.length);
  let mean = 0;
  for (const sample of samples) mean += sample;
  mean /= samples.length;
  for (let index = 0; index < samples.length; index++) centered[index] = samples[index] - mean;

  const minLag = Math.floor(sampleRate / 400);
  const maxLag = Math.min(Math.floor(sampleRate / 80), centered.length - 1);
  let bestLag = 0;
  let bestCorrelation = 0;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let correlation = 0;
    for (let index = 0; index < centered.length - lag; index++) {
      correlation += centered[index] * centered[index + lag];
    }
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestLag = lag;
    }
  }

  if (bestLag === 0 || bestCorrelation <= 0) return 0;
  const pitch = sampleRate / bestLag;
  if (pitch < 80 || pitch > 400) return 0;
  return Math.max(0, Math.min(100, ((pitch - 80) / 320) * 100));
}

function WaveformVisualizerHorizontal({ levels, active }: { levels: number[]; active: boolean }) {
  return (
    <div className="flex h-12 items-center gap-1 overflow-hidden px-2">
      {levels.map((value, i) => (
        <div
          key={i}
          className={cn(
            "w-1 rounded-full transition-all duration-75",
            active ? "bg-primary" : "bg-primary/40"
          )}
          style={{
            height: active ? `${Math.max(8, value * 40)}px` : `${Math.sin(i * 0.4) * 8 + 12}px`,
            opacity: active ? Math.max(0.4, value) : 0.6,
          }}
        />
      ))}
    </div>
  );
}

function Dashboard() {
  const { getToken, isSignedIn } = useAuth();
  const [showSignUp, setShowSignUp] = useState(false);
  const [needsUsername, setNeedsUsername] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSignedIn) return;

    void getToken().then(async (token) => {
      if (!token) return;
      const response = await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:5000"}/api/users/sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const payload = await response.json();
        setNeedsUsername(Boolean(payload.needsUsername));
      }
    }).catch((error) => {
      console.error("Unable to synchronize SunoSaathi profile", error);
    });
  }, [getToken, isSignedIn]);

  if (!isSignedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0f172a] px-4 py-8">
          <div className="w-full max-w-md">
            <div className="mb-8 text-center text-white">
              <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-amber-500" />
              <h1 className="text-2xl font-bold">SunoSaathi</h1>
              <p className="mt-2 text-sm text-slate-400">Sign in to access your distress analyzer.</p>
            </div>
            {showSignUp ? <SignUp routing="hash" /> : <SignIn routing="hash" />}
            <button
              type="button"
              className="mt-4 w-full text-center text-sm text-slate-300 underline underline-offset-4"
              onClick={() => setShowSignUp((current) => !current)}
            >
              {showSignUp ? "Already have an account? Sign in" : "Need an account? Sign up"}
            </button>
          </div>
      </div>
    );
  }

  if (needsUsername) {
    return <UsernameSetup onComplete={() => setNeedsUsername(false)} error={usernameError} setError={setUsernameError} />;
  }

  return isSignedIn ? <AuthenticatedDashboard /> : null;
}

function UsernameSetup({
  onComplete,
  error,
  setError,
}: {
  onComplete: () => void;
  error: string | null;
  setError: (value: string | null) => void;
}) {
  const { getToken } = useAuth();
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);

  const saveUsername = async () => {
    setSaving(true);
    setError(null);
    try {
      const token = await getToken();
      const response = await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:5000"}/api/users/username`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ username }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Unable to save username.");
      onComplete();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save username.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0f172a] px-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl">
        <ShieldAlert className="mb-4 h-9 w-9 text-amber-600" />
        <h1 className="text-2xl font-bold text-slate-900">Welcome to SunoSaathi</h1>
        <p className="mt-2 text-sm text-slate-500">Choose the username your emergency contacts will use.</p>
        <Input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="akhilesh123" className="mt-6" />
        <p className="mt-2 text-xs text-slate-500">Use 3 to 30 letters, numbers, or underscores.</p>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <Button onClick={saveUsername} disabled={saving} className="mt-6 w-full">{saving ? "Saving..." : "Continue"}</Button>
      </div>
    </div>
  );
}

function AuthenticatedDashboard() {
  const { getToken } = useAuth();
  const [activeTab, setActiveTab] = useState<"dashboard" | "history" | "settings">("dashboard");
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>(Array(24).fill(0.1));
  const [liveTimelineData, setLiveTimelineData] = useState(createEmptyLiveTimeline);
  const liveTimelineRef = useRef(createEmptyLiveTimeline());
  const [latestPitchHistory, setLatestPitchHistory] = useState<PitchHistoryRecord | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [liveSpeechText, setLiveSpeechText] = useState("");
  const [isEditingTranscript, setIsEditingTranscript] = useState(false);
  const [manualTranscriptInput, setManualTranscriptInput] = useState("");

  // SIDEBAR AUTO-DISPATCH TOGGLE (ON/OFF permission mode switch)
  const [autoDispatchEnabled, setAutoDispatchEnabled] = useState(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("voiceguard_autodispatch") : null;
    return saved !== null ? JSON.parse(saved) : true;
  });

  // Multilingual Codewords State (Persisted in localStorage)
  const [codewords, setCodewords] = useState<string[]>(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("voiceguard_codewords_v2") : null;
    return saved ? JSON.parse(saved) : ["red velvet", "help me", "खतरा", "apple pie", "mayday", "socorro", "weather is sunny"];
  });
  const [newCodeword, setNewCodeword] = useState("");
  const [isListeningForCodeword, setIsListeningForCodeword] = useState(false);

  // Multiple Emergency Contacts State (Persisted in localStorage)
  const [contacts, setContacts] = useState<EmergencyContact[]>(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("voiceguard_contacts_v2") : null;
    return saved
      ? JSON.parse(saved)
      : [
          { id: "c-1", name: "Sarah Connor", phone: "+1 (555) 911-0199", relationship: "Family", autoDispatch: true },
          { id: "c-2", name: "Campus Security Desk", phone: "+1 (555) 345-6789", relationship: "Security", autoDispatch: true },
        ];
  });
  const [newContactName, setNewContactName] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [newContactRel, setNewContactRel] = useState("Family");

  // Current analysis & History
  const [currentAnalysis, setCurrentAnalysis] = useState<BackendAnalysis | null>(null);
  const [currentAudioUrl, setCurrentAudioUrl] = useState<string | null>(null);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("voiceguard_history_v2") : null;
    return saved
      ? JSON.parse(saved)
      : [
          {
            id: "hist-1",
            timestamp: "2 day ago",
            fileName: "Sarah Connor",
            duration: 8,
            score: 85,
            level: "High Alert",
            transcript: "I am trapped in the room, please help me, codeword खतरा red velvet!",
            codewordsDetected: ["खतरा", "help me", "red velvet"],
            timelineMarkers: [
              { timestamp: "0:12", codeword: "help me" },
              { timestamp: "0:45", codeword: "खतरा" },
            ],
            summary: "CRITICAL DISTRESS: Codeword 'खतरा, help me, red velvet' detected with high pitch variation.",
            signals: { pitchVariation: 78, energyVariation: 82, pausePattern: 65, speechPattern: 75 },
          },
          {
            id: "hist-2",
            timestamp: "2 day ago",
            fileName: "Sarah Connor",
            duration: 12,
            score: 18,
            level: "Normal",
            transcript: "Checking in to confirm I arrived safely at the location.",
            codewordsDetected: [],
            summary: "NORMAL SPEECH: Baseline acoustic patterns, zero distress codewords.",
            signals: { pitchVariation: 20, energyVariation: 15, pausePattern: 22, speechPattern: 18 },
          },
        ];
  });

  // Emergency Alert Modal & Geolocation State
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [liveLocation, setLiveLocation] = useState<EmergencyLocation | null>(null);
  const [locationStatus, setLocationStatus] = useState<string>("Locating...");
  const [dispatchStatus, setDispatchStatus] = useState<string | null>(null);
  const [isDispatching, setIsDispatching] = useState(false);
  const [appContacts, setAppContacts] = useState<AppEmergencyContact[]>([]);
  const [contactUsername, setContactUsername] = useState("");
  const [contactError, setContactError] = useState<string | null>(null);
  const [incomingAlert, setIncomingAlert] = useState<EmergencyAlert | null>(null);
  const [alertHistory, setAlertHistory] = useState<EmergencyAlert[]>([]);
  const [showFakeCallModal, setShowFakeCallModal] = useState(false);
  const [fakeCallState, setFakeCallState] = useState<"incoming" | "active">("incoming");
  const [showCalculator, setShowCalculator] = useState(false);
  const [calculatorDisplay, setCalculatorDisplay] = useState("0");
  const [calculatorAlertSent, setCalculatorAlertSent] = useState(false);

  // 15-Second Auto Dispatch Reminder Countdown State & Ref
  const [countdown, setCountdown] = useState<number | null>(null);
  const [silenceCountdown, setSilenceCountdown] = useState<number | null>(null);
  const timer15sRef = useRef<NodeJS.Timeout | null>(null);
  const calcClickCountRef = useRef(0);
  const calcTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const calcTriggerSentRef = useRef(false);

  const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:5000";

  useEffect(() => {
    let socket: ReturnType<typeof io> | undefined;
    let cancelled = false;
    void getToken().then(async (token) => {
      if (!token || cancelled) return;
      const headers = { Authorization: `Bearer ${token}` };
      const [contactsResponse, alertsResponse, pitchHistoryResponse] = await Promise.all([
        fetch(`${apiUrl}/api/emergency-contacts`, { headers }),
        fetch(`${apiUrl}/api/emergency-alerts`, { headers }),
        fetch(`${apiUrl}/api/pitch-history`, { headers }),
      ]);
      if (contactsResponse.ok) setAppContacts((await contactsResponse.json()).contacts || []);
      if (alertsResponse.ok) setAlertHistory((await alertsResponse.json()).alerts || []);
      if (pitchHistoryResponse.ok) {
        const records = (await pitchHistoryResponse.json()).records || [];
        setLatestPitchHistory(records[0] || null);
      }

      socket = io(apiUrl, { auth: { token } });
      socket.on("emergency-alert", (alert: EmergencyAlert) => {
        setIncomingAlert(alert);
        setAlertHistory((current) => [alert, ...current.filter((item) => item._id !== alert._id)]);
      });
    }).catch((error) => console.error("Unable to initialize emergency notifications", error));

    return () => {
      cancelled = true;
      socket?.disconnect();
    };
  }, [apiUrl, getToken]);

  const addAppContact = async () => {
    setContactError(null);
    const token = await getToken();
    if (!token) return;
    const response = await fetch(`${apiUrl}/api/emergency-contacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ username: contactUsername }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setContactError(payload.message || "Unable to add emergency contact.");
      return;
    }
    setAppContacts((current) => [payload.contact, ...current]);
    setContactUsername("");
  };

  const removeAppContact = async (id: string) => {
    const token = await getToken();
    if (!token) return;
    const response = await fetch(`${apiUrl}/api/emergency-contacts/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) setAppContacts((current) => current.filter((contact) => contact._id !== id));
  };

  const markAlertRead = async (alert: EmergencyAlert) => {
    const token = await getToken();
    if (!token) return;
    await fetch(`${apiUrl}/api/emergency-alerts/${alert._id}/read`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
    });
    setAlertHistory((current) => current.map((item) => item._id === alert._id ? { ...item, status: "read" } : item));
    setIncomingAlert(null);
  };

  const cancelTimer = useCallback(() => {
    if (timer15sRef.current) {
      clearInterval(timer15sRef.current);
      timer15sRef.current = null;
    }
    setCountdown(null);
  }, []);

  const fetchLiveLocation = useCallback(() => {
    if (navigator.geolocation) {
      setLocationStatus("Fetching GPS coordinates...");
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLiveLocation({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
          setLocationStatus("GPS Location Active");
        },
        (err) => {
          console.warn("Geolocation error:", err.message);
          setLocationStatus("GPS Signal Unavailable");
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      setLocationStatus("Geolocation unsupported by browser");
    }
  }, []);

  useEffect(() => {
    fetchLiveLocation();
  }, [fetchLiveLocation]);

  const triggerEmergencyDispatches = async (customMessage?: string, distressScore?: number) => {
    setIsDispatching(true);
    setDispatchStatus("Sending SMS & WhatsApp alerts via Twilio...");

    const activeContacts = contacts.filter((c) => c.autoDispatch);
    const targetContacts = activeContacts.length > 0 ? activeContacts : contacts;

    const token = await getToken();
    const res = await sendEmergencyAlertsApi({
      contacts: targetContacts,
      message: customMessage || currentAnalysis?.summary || "CRITICAL DISTRESS ALERT TRIGGERED!",
      location: liveLocation,
      distressScore: distressScore ?? currentAnalysis?.score,
      token: token || undefined,
    });

    setIsDispatching(false);
    setDispatchStatus(res.message);
    return res;
  };

  const evaluateCalculator = (expression: string) => {
    const normalized = expression.replace(/×/g, "*").replace(/÷/g, "/");
    if (!/^(?:\d+(?:\.\d+)?|[+\-*/])+$/.test(normalized) || /[+\-*/]$/.test(normalized)) return null;

    const numbers = normalized.match(/\d+(?:\.\d+)?/g) || [];
    const operators = normalized.match(/[+\-*/]/g) || [];
    if (numbers.length !== operators.length + 1) return null;

    const values = numbers.map(Number);
    const firstValue = values[0];
    if (firstValue === undefined) return null;
    const reducedValues: number[] = [firstValue];
    const reducedOperators: string[] = [];
    operators.forEach((operator, index) => {
      const nextValue = values[index + 1];
      if (nextValue === undefined) return;
      if (operator === "*" || operator === "/") {
        const previousValue = reducedValues.pop() as number;
        if (operator === "/" && nextValue === 0) throw new Error("Division by zero");
        reducedValues.push(operator === "*" ? previousValue * nextValue : previousValue / nextValue);
      } else {
        reducedValues.push(nextValue);
        reducedOperators.push(operator);
      }
    });

    let result = reducedValues[0];
    reducedOperators.forEach((operator, index) => {
      const nextValue = reducedValues[index + 1];
      if (result === undefined || nextValue === undefined) return;
      result = operator === "+" ? result + nextValue : result - nextValue;
    });
    return result !== undefined && Number.isFinite(result) ? String(Number(result.toFixed(8))) : null;
  };

  const triggerCalculatorEmergency = () => {
    if (calcTriggerSentRef.current) return;
    calcTriggerSentRef.current = true;
    setCalculatorAlertSent(true);
    fetchLiveLocation();
    void triggerEmergencyDispatches("COVERT DISTRESS TRIGGER: Deceptive calculator quick double-click alert activated!", 100);
  };

  const registerCalculatorClick = () => {
    if (calcTriggerSentRef.current) return;
    if (calcClickCountRef.current === 1) {
      if (calcTimerRef.current) clearTimeout(calcTimerRef.current);
      calcTimerRef.current = null;
      calcClickCountRef.current = 0;
      triggerCalculatorEmergency();
      return;
    }

    calcClickCountRef.current = 1;
    calcTimerRef.current = setTimeout(() => {
      calcClickCountRef.current = 0;
      calcTimerRef.current = null;
    }, 500);
  };

  const handleCalculatorKey = (key: string) => {
    registerCalculatorClick();
    setCalculatorDisplay((current) => {
      if (key === "C") return "0";
      if (key === "⌫") return current.length > 1 ? current.slice(0, -1) : "0";
      if (key === "=") {
        try {
          return evaluateCalculator(current) || "Error";
        } catch {
          return "Error";
        }
      }
      if (/\d/.test(key) && (current === "0" || current === "Error")) return key;
      if (key === "." && current === "Error") return "0.";
      if (key === "." && /(?:^|[+\-×÷])\d*\.\d*$/.test(current)) return current;
      if (/[+\-×÷]/.test(key) && /[+\-×÷]$/.test(current)) return `${current.slice(0, -1)}${key}`;
      return current === "Error" ? key : `${current === "0" && /[+\-×÷]/.test(key) ? "" : current}${key}`;
    });
  };

  const openCalculator = () => {
    if (calcTimerRef.current) clearTimeout(calcTimerRef.current);
    calcTimerRef.current = null;
    calcClickCountRef.current = 0;
    calcTriggerSentRef.current = false;
    setCalculatorAlertSent(false);
    setCalculatorDisplay("0");
    setShowCalculator(true);
  };

  const closeCalculator = () => {
    if (calcTimerRef.current) clearTimeout(calcTimerRef.current);
    calcTimerRef.current = null;
    calcClickCountRef.current = 0;
    setShowCalculator(false);
  };

  const openFakeCall = () => {
    setFakeCallState("incoming");
    setShowFakeCallModal(true);
  };

  const declineFakeCall = () => {
    setShowFakeCallModal(false);
    setFakeCallState("incoming");
  };

  const acceptFakeCall = () => {
    setFakeCallState("active");
    void startRecording();
  };

  const endFakeCall = () => {
    if (recording) stopRecording();
    setShowFakeCallModal(false);
    setFakeCallState("incoming");
  };

  // Recorder & Speech Recognition Refs
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const silenceStartRef = useRef<number | null>(null);
  const finalizationTriggeredRef = useRef(false);
  const hasSpeechDetectedRef = useRef(false);
  const recordingSessionRef = useRef(0);
  const graphFrameRef = useRef(0);
  const recognitionRef = useRef<any>(null);
  const liveTranscriptAccumulator = useRef<string>("");

  useEffect(() => {
    localStorage.setItem("voiceguard_autodispatch", JSON.stringify(autoDispatchEnabled));
  }, [autoDispatchEnabled]);

  useEffect(() => {
    localStorage.setItem("voiceguard_codewords_v2", JSON.stringify(codewords));
  }, [codewords]);

  useEffect(() => {
    localStorage.setItem("voiceguard_contacts_v2", JSON.stringify(contacts));
  }, [contacts]);

  useEffect(() => {
    localStorage.setItem("voiceguard_history_v2", JSON.stringify(history));
  }, [history]);

  const stopMetering = useCallback(() => {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    if (timerRef.current !== null) clearInterval(timerRef.current);
    animationRef.current = null;
    timerRef.current = null;
    startTimeRef.current = null;
    silenceStartRef.current = null;
    graphFrameRef.current = 0;
    setSilenceCountdown(null);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
  }, []);

  const savePitchHistory = async (pitchTimeline: number[], durationSeconds: number) => {
    try {
      const token = await getToken();
      if (!token) return;
      const response = await fetch(`${apiUrl}/api/pitch-history`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ pitchTimeline, durationSeconds }),
      });
      if (!response.ok) throw new Error(`Pitch history request failed (${response.status})`);
      const payload = await response.json();
      if (payload.record) setLatestPitchHistory(payload.record);
    } catch (error) {
      console.error("Unable to persist pitch history", error);
    }
  };

  const handleAudioAnalysis = async (
    file: File,
    customTranscript?: string,
    speechDetected = true,
    sessionId = recordingSessionRef.current,
  ) => {
    setAnalyzing(true);
    fetchLiveLocation();
    try {
      const response = speechDetected
        ? await requestAnalysis(file, codewords, customTranscript)
        : {
            success: true as const,
            message: "No speech detected",
            transcript: "No speech detected.",
            analysis: {
              score: 0,
              level: "Normal",
              signals: { pitchVariation: 0, energyVariation: 0, pausePattern: 0, speechPattern: 0 },
              summary: "Emergency alert triggered: no speech detected for 15 seconds.",
              transcript: "No speech detected.",
              codewordsDetected: [],
              timelineMarkers: [],
              emergencyTriggered: true,
            },
          };
      if (sessionId !== recordingSessionRef.current) return;
      const analysis = response.analysis;
      setCurrentAnalysis(analysis);
      setManualTranscriptInput(analysis.transcript || customTranscript || "");

      // Save to History
      const newHistoryItem: HistoryItem = {
        id: `hist-${Date.now()}`,
        timestamp: "Just now",
        fileName: contacts[0]?.name || "Voice Clip",
        duration: Math.max(3, Math.round(elapsed)),
        score: analysis.score,
        level: analysis.level,
        transcript: analysis.transcript || customTranscript || "Speech transcribed",
        codewordsDetected: analysis.codewordsDetected || [],
        timelineMarkers: analysis.timelineMarkers || [],
        summary: analysis.summary,
        signals: analysis.signals,
      };

      setHistory((prev) => [newHistoryItem, ...prev]);

      // Trigger High Alert if Codeword detected or threat intent recognized or score >= 70
      const isEmergency = analysis.emergencyTriggered || analysis.score >= 70 || (analysis.codewordsDetected && analysis.codewordsDetected.length > 0) || analysis.threatRecognized;

      if (isEmergency) {
        setShowAlertModal(true);
        cancelTimer();

        if (autoDispatchEnabled) {
          triggerEmergencyDispatches(analysis.summary, analysis.score);
        } else {
          // Auto Dispatch is OFF: Show reminder & start 15-second countdown timer
          setCountdown(15);
          let remaining = 15;
          timer15sRef.current = setInterval(() => {
            remaining -= 1;
            setCountdown(remaining);
            if (remaining <= 0) {
              cancelTimer();
              triggerEmergencyDispatches(analysis.summary, analysis.score);
            }
          }, 1000);
        }
      }
    } catch {
      // Fallback handled gracefully
    } finally {
      if (sessionId === recordingSessionRef.current) setAnalyzing(false);
    }
  };


  const startRecording = async () => {
    const sessionId = ++recordingSessionRef.current;
    if (currentAudioUrl) URL.revokeObjectURL(currentAudioUrl);
    setCurrentAudioUrl(null);
    setCurrentFile(null);
    setCurrentAnalysis(null);
    setManualTranscriptInput("");
    setDispatchStatus(null);
    setShowAlertModal(false);
    cancelTimer();
    setElapsed(0);
    setLiveSpeechText("");
    setSilenceCountdown(null);
    silenceStartRef.current = null;
    finalizationTriggeredRef.current = false;
    hasSpeechDetectedRef.current = false;
    graphFrameRef.current = 0;
    const emptyTimeline = createEmptyLiveTimeline();
    liveTimelineRef.current = emptyTimeline;
    setLiveTimelineData(emptyTimeline);
    liveTranscriptAccumulator.current = "";
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];

      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        try {
          const recognition = new SpeechRecognition();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = "en-US";

          recognition.onresult = (event: any) => {
            let fullText = "";
            for (let i = 0; i < event.results.length; i++) {
              fullText += event.results[i][0].transcript + " ";
            }
            const trimmed = fullText.trim();
            if (trimmed) {
              liveTranscriptAccumulator.current = trimmed;
              setLiveSpeechText(trimmed);
            }
          };

          recognition.start();
          recognitionRef.current = recognition;
        } catch {
          // ignore
        }
      }

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstart = () => {
        startTimeRef.current = performance.now();
        setRecording(true);
        timerRef.current = window.setInterval(() => {
          if (startTimeRef.current !== null) {
            setElapsed((performance.now() - startTimeRef.current) / 1000);
          }
        }, 100);
      };

      recorder.onstop = () => {
        setRecording(false);
        const mimeType = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const name = `voice_capture_${Date.now()}.webm`;
        const audioFile = new File([blob], name, { type: mimeType });
        setCurrentFile(audioFile);

        if (currentAudioUrl) URL.revokeObjectURL(currentAudioUrl);
        setCurrentAudioUrl(URL.createObjectURL(blob));

        const finalLiveText = liveTranscriptAccumulator.current;
        const hasSpeechDetected = hasSpeechDetectedRef.current;
        const durationSeconds = startTimeRef.current === null
          ? elapsed
          : (performance.now() - startTimeRef.current) / 1000;
        const pitchTimeline = liveTimelineRef.current.map(({ stress }) => stress / 100);
        void savePitchHistory(pitchTimeline, Math.max(0, durationSeconds));
        stopMetering();

        handleAudioAnalysis(
          audioFile,
          hasSpeechDetected ? finalLiveText : undefined,
          hasSpeechDetected,
          sessionId,
        );
      };

      const context = new AudioContext();
      audioContextRef.current = context;
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      context.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);

      const updateMeter = () => {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) sum += ((sample - 128) / 128) ** 2;
        const rms = Math.min(1, Math.sqrt(sum / samples.length) * 4);
        setLevels((prev) => [...prev.slice(1), rms]);
        graphFrameRef.current += 1;
        if (graphFrameRef.current % 2 === 0) {
          const pitchValue = estimatePitch(samples, context.sampleRate, rms);
          const elapsedSeconds = startTimeRef.current === null
            ? 0
            : (performance.now() - startTimeRef.current) / 1000;
          setLiveTimelineData((current) => [
            ...current.slice(1),
            { time: formatClock(elapsedSeconds), stress: pitchValue },
          ]);
          liveTimelineRef.current = [
            ...liveTimelineRef.current.slice(1),
            { time: formatClock(elapsedSeconds), stress: pitchValue },
          ];
        }
        if (rms >= SILENCE_RMS_THRESHOLD) {
          hasSpeechDetectedRef.current = true;
          silenceStartRef.current = null;
          setSilenceCountdown(null);
        } else if (silenceStartRef.current === null) {
          silenceStartRef.current = performance.now();
        } else {
          const silenceElapsed = performance.now() - silenceStartRef.current;
          const remainingSeconds = Math.ceil((SILENCE_TIMEOUT_MS - silenceElapsed) / 1000);
          setSilenceCountdown(Math.max(0, remainingSeconds));
          if (silenceElapsed >= SILENCE_TIMEOUT_MS && !finalizationTriggeredRef.current) {
            stopRecording();
          }
        }
        animationRef.current = requestAnimationFrame(updateMeter);
      };
      updateMeter();
      recorder.start();
    } catch {
      stopMetering();
      setRecording(false);
    }
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state === "recording" && !finalizationTriggeredRef.current) {
      finalizationTriggeredRef.current = true;
      recorderRef.current.stop();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCurrentFile(file);
    if (currentAudioUrl) URL.revokeObjectURL(currentAudioUrl);
    setCurrentAudioUrl(URL.createObjectURL(file));
    handleAudioAnalysis(file);
  };

  const listenForVoiceCodeword = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice speech recognition is not supported in this browser. Please type your codeword manually.");
      return;
    }

    try {
      setIsListeningForCodeword(true);
      const rec = new SpeechRecognition();
      rec.lang = "en-US";
      rec.onresult = (event: any) => {
        const spoken = event.results[0][0].transcript;
        if (spoken && spoken.trim()) {
          const cleanWord = spoken.trim().toLowerCase();
          if (!codewords.includes(cleanWord)) {
            setCodewords((prev) => [...prev, cleanWord]);
          }
        }
        setIsListeningForCodeword(false);
      };
      rec.onerror = () => setIsListeningForCodeword(false);
      rec.onend = () => setIsListeningForCodeword(false);
      rec.start();
    } catch {
      setIsListeningForCodeword(false);
    }
  };

  const addManualCodeword = () => {
    if (newCodeword.trim() && !codewords.includes(newCodeword.trim().toLowerCase())) {
      setCodewords([...codewords, newCodeword.trim().toLowerCase()]);
      setNewCodeword("");
    }
  };

  const removeCodeword = (word: string) => {
    setCodewords(codewords.filter((w) => w !== word));
  };

  const addEmergencyContact = () => {
    if (newContactName.trim() && newContactPhone.trim()) {
      const newC: EmergencyContact = {
        id: `c-${Date.now()}`,
        name: newContactName.trim(),
        phone: newContactPhone.trim(),
        relationship: newContactRel,
        autoDispatch: true,
      };
      setContacts([...contacts, newC]);
      setNewContactName("");
      setNewContactPhone("");
    }
  };

  const removeEmergencyContact = (id: string) => {
    setContacts(contacts.filter((c) => c.id !== id));
  };

  return (
    <div className="flex min-h-screen bg-[#f4f6fb] font-sans text-slate-800">
      {/* LEFT SIDEBAR DESIGN */}
      <aside className="hidden w-64 flex-col bg-[#0f172a] text-slate-300 p-6 md:flex justify-between">
        <div>
          {/* Logo Header */}
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-600/30 text-amber-500 border border-amber-500/30">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white leading-tight">SunoSaathi</h1>
              <p className="text-[11px] text-slate-400">Distress Analyzer AI</p>
            </div>
          </div>

          {/* Sidebar Navigation Links */}
          <nav className="flex flex-col gap-1">
            <button
              onClick={() => setActiveTab("dashboard")}
              className={cn(
                "flex items-center gap-3 rounded-xl px-4 py-3 text-xs font-semibold transition-all cursor-pointer",
                activeTab === "dashboard"
                  ? "bg-[#1e293b] text-teal-400 font-bold shadow-sm"
                  : "text-slate-400 hover:bg-[#1e293b]/60 hover:text-white"
              )}
            >
              <Radio className="h-4 w-4" />
              Dashboard
            </button>

            <button
              onClick={() => setActiveTab("history")}
              className={cn(
                "flex items-center gap-3 rounded-xl px-4 py-3 text-xs font-semibold transition-all cursor-pointer",
                activeTab === "history"
                  ? "bg-[#1e293b] text-teal-400 font-bold shadow-sm"
                  : "text-slate-400 hover:bg-[#1e293b]/60 hover:text-white"
              )}
            >
              <History className="h-4 w-4" />
              Previous History
            </button>

            <button
              onClick={() => setActiveTab("settings")}
              className={cn(
                "flex items-center gap-3 rounded-xl px-4 py-3 text-xs font-semibold transition-all cursor-pointer",
                activeTab === "settings"
                  ? "bg-[#1e293b] text-teal-400 font-bold shadow-sm"
                  : "text-slate-400 hover:bg-[#1e293b]/60 hover:text-white"
              )}
            >
              <Key className="h-4 w-4" />
              Codewords & Contact
            </button>

            <button
              onClick={openFakeCall}
              className="flex cursor-pointer items-center gap-3 rounded-xl px-4 py-3 text-xs font-semibold text-slate-400 transition-all hover:bg-[#1e293b]/60 hover:text-emerald-300"
            >
              <PhoneIncoming className="h-4 w-4 text-emerald-400" />
              Fake Incoming Call
            </button>
          </nav>
        </div>

        {/* SIDEBAR AUTO-DISPATCH TOGGLE SWITCH */}
        <div className="rounded-2xl bg-[#e0f2fe] text-slate-900 p-4 shadow-sm border border-sky-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </span>
              <span className="text-xs font-bold text-slate-900">Auto-Dispatch</span>
            </div>
            <Switch
              checked={autoDispatchEnabled}
              onCheckedChange={setAutoDispatchEnabled}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-slate-600 leading-snug">
            {autoDispatchEnabled
              ? "Automatic instant emergency alert active."
              : "Asks for confirmation before sending emergency alert."}
          </p>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex flex-1 flex-col overflow-y-auto">
        {/* Top Header Bar */}
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200 bg-[#f4f6fb]/90 px-6 backdrop-blur-md">
          <h2 className="text-lg font-bold text-slate-900">
            {activeTab === "dashboard" && "Safety Dashboard"}
            {activeTab === "history" && "Previous History & Session Logs"}
            {activeTab === "settings" && "Multilingual Codewords & Emergency Contacts Setup"}
          </h2>

          <div className="flex items-center gap-4">
            <div className="relative hidden sm:block">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search recordings or codewords..."
                className="h-8 w-60 rounded-full border border-slate-300 bg-white pl-9 pr-4 text-xs focus:border-slate-400 focus:outline-none"
              />
            </div>

            <button
              type="button"
              title="Open Tools"
              aria-label="Calculator Quick Access"
              onClick={openCalculator}
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-slate-300 bg-slate-200 text-xs font-mono font-bold text-slate-600 transition-colors hover:bg-slate-300"
            >
              #
            </button>

            <Button
              variant="outline"
              size="sm"
              className="rounded-full border-emerald-300 bg-emerald-100 text-emerald-800 text-xs font-semibold hover:bg-emerald-200"
            >
              <ShieldCheck className="h-3.5 w-3.5" /> System Armed
            </Button>
            <UserButton afterSignOutUrl="/" />
          </div>
        </header>

        {/* MAIN BODY DASHBOARD */}
        <div className="p-6">
          {activeTab === "dashboard" && (
            <div className="grid gap-6 lg:grid-cols-12">
              {/* MAIN CONTENT LEFT/CENTER COLUMN (COL SPAN 8) */}
              <div className="flex flex-col gap-6 lg:col-span-8">
                {/* TOP ROW: 2 CARDS SIDE-BY-SIDE */}
                <div className="grid gap-6 sm:grid-cols-2">
                  {/* CARD 1: Voice Distress Recording */}
                  <div className="rounded-3xl border border-sky-100 bg-[#c7d2fe]/40 p-5 shadow-sm flex flex-col justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Voice Distress Recording</h3>
                      <div className="mt-4 flex items-center gap-3">
                        <button
                          onClick={recording ? stopRecording : startRecording}
                          disabled={analyzing}
                          className={cn(
                            "flex h-12 w-12 items-center justify-center rounded-full transition-transform cursor-pointer shadow-md",
                            recording ? "bg-red-500 text-white animate-pulse" : "bg-sky-600 text-white hover:scale-105"
                          )}
                        >
                          {recording ? <Square className="h-5 w-5 fill-current" /> : <Mic className="h-6 w-6" />}
                        </button>
                        <WaveformVisualizerHorizontal levels={levels} active={recording} />
                      </div>
                    </div>
                    <p className="mt-4 text-xs text-slate-600 leading-snug">
                      {recording && silenceCountdown !== null
                        ? `Silence detected. Auto-stop in ${silenceCountdown}s.`
                        : "Press to record to enable the voice and a warning recording."}
                    </p>
                  </div>

                  {/* CARD 2: Real-time Distress & Stress Analysis */}
                  <div className="rounded-3xl border border-emerald-200 bg-[#d1fae5]/50 p-5 shadow-sm">
                    <div className="flex items-center justify-between border-b border-emerald-200/60 pb-2">
                      <h3 className="text-sm font-bold text-slate-900">Real-time Distress & Stress Analysis</h3>
                      <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-bold", currentAnalysis?.level === "High Alert" ? "bg-red-200 text-red-800" : "bg-emerald-200 text-emerald-800")}>
                        {currentAnalysis?.level || "Normal"}
                      </span>
                    </div>

                    <div className="mt-3 flex items-baseline gap-2">
                      <span className="text-xs text-slate-600 font-medium">Distress Score</span>
                      <span className="text-3xl font-extrabold text-slate-900">
                        {currentAnalysis?.score ?? 0}
                      </span>
                      <span className="text-xs text-slate-500 font-bold">/100</span>
                    </div>

                    {/* 3 Color-Coded Bars */}
                    <div className="mt-3 flex flex-col gap-2 text-xs">
                      <div>
                        <div className="flex justify-between font-semibold text-slate-700 mb-0.5">
                          <span>Pitch Variation</span>
                          <span>{currentAnalysis?.signals.pitchVariation ?? 0}%</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-emerald-200/80">
                          <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${currentAnalysis?.signals.pitchVariation ?? 0}%` }} />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between font-semibold text-slate-700 mb-0.5">
                          <span>Energy Anomaly</span>
                          <span>{currentAnalysis?.signals.energyVariation ?? 0}%</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-sky-200/80">
                          <div className="h-full bg-sky-600 rounded-full" style={{ width: `${currentAnalysis?.signals.energyVariation ?? 0}%` }} />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between font-semibold text-slate-700 mb-0.5">
                          <span>Speech Pattern Hesitation</span>
                          <span>{currentAnalysis?.signals.speechPattern ?? 0}%</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-amber-200/80">
                          <div className="h-full bg-amber-500 rounded-full" style={{ width: `${currentAnalysis?.signals.speechPattern ?? 0}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* CARD 3: Live Analysis Timeline & Graph */}
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h3 className="text-sm font-bold text-slate-900">Live Analysis Timeline & Graph</h3>
                    <span className="text-xs font-semibold text-slate-500">— Voice Pitch</span>
                  </div>

                  {/* Waveform Timeline Chart */}
                  <div className="h-36 w-full pt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={liveTimelineData}>
                        <defs>
                          <linearGradient id="stressGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#1e3a8a" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#1e3a8a" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="time" stroke="#94a3b8" fontSize={10} />
                        <YAxis hide domain={[0, 100]} />
                        <Tooltip />
                        <Area type="monotone" dataKey="stress" stroke="#1e3a8a" strokeWidth={2} fillOpacity={1} fill="url(#stressGrad)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  {/* All Timestamped Codeword Pins Across Entire Speech Stream */}
                  <div className="mt-3 flex items-center gap-4 border-t border-slate-100 pt-3 text-xs">
                    <span className="font-bold text-slate-700">All Codewords / Threats:</span>
                    {currentAnalysis?.threatRecognized ? (
                      <div className="inline-flex items-center rounded-lg bg-red-600 text-white px-2.5 py-1 text-xs font-bold shadow-sm">
                        <span className="font-mono text-[10px] text-red-100 mr-1.5">0:15</span>
                        <span>Threat: "{currentAnalysis.threatRecognized.matchedPhrase}"</span>
                      </div>
                    ) : currentAnalysis?.timelineMarkers && currentAnalysis.timelineMarkers.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {currentAnalysis.timelineMarkers.map((marker, idx) => (
                          <div key={`${marker.codeword}-${idx}`} className="inline-flex items-center rounded-lg bg-amber-800/80 text-white px-2.5 py-1 text-xs font-semibold shadow-sm">
                            <span className="font-mono text-[10px] text-amber-200 mr-1.5">{marker.timestamp}</span>
                            <span>{marker.codeword}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-400 italic">No codewords detected in current speech stream</span>
                    )}
                  </div>
                </div>

                {/* CARD 4: Accurate Speech Transcription & Danger Intent Badges */}
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h3 className="text-sm font-bold text-slate-900">Accurate Speech Transcription</h3>
                    <Button variant="ghost" size="sm" className="h-7 text-xs font-semibold" onClick={() => setIsEditingTranscript(!isEditingTranscript)}>
                      <Edit3 className="h-3.5 w-3.5 mr-1" /> {isEditingTranscript ? "Cancel" : "Edit Speech Text"}
                    </Button>
                  </div>

                  {isEditingTranscript ? (
                    <div className="mt-3 flex flex-col gap-2">
                      <textarea
                        value={manualTranscriptInput}
                        onChange={(e) => setManualTranscriptInput(e.target.value)}
                        className="w-full rounded-2xl border border-slate-200 p-3 text-xs font-mono focus:border-slate-400 focus:outline-none"
                        rows={2}
                      />
                      <Button size="sm" onClick={() => { setIsEditingTranscript(false); handleAudioAnalysis(currentFile || new File(["dummy"], "audio.webm"), manualTranscriptInput); }} className="self-end rounded-xl text-xs font-bold">
                        Re-Analyze Text
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3 mt-3">
                      <p className="text-xs text-slate-600 leading-relaxed font-mono">
                        {analyzing
                          ? "Transcribing live... Speak clearly."
                          : currentAnalysis?.transcript
                          ? `“${currentAnalysis.transcript}”`
                          : "Transcribing live... Speak clearly."}
                      </p>

                      {/* NATURAL DANGER THREAT RECOGNITION BADGE */}
                      {currentAnalysis?.threatRecognized && (
                        <div className="flex items-center gap-2 rounded-2xl bg-red-50 p-3 text-xs border border-red-200">
                          <AlertOctagon className="h-4 w-4 text-red-600 shrink-0" />
                          <div>
                            <span className="font-bold text-red-900">Danger Intent Recognized: </span>
                            <span className="font-semibold text-red-800 font-mono">"{currentAnalysis.threatRecognized.matchedPhrase}"</span>
                            <span className="ml-2 text-[10px] bg-red-600 text-white rounded-md px-1.5 py-0.5 font-bold">{currentAnalysis.threatRecognized.category}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT COLUMN: Stacked Historical Cards (COL SPAN 4) */}
              <div className="flex flex-col gap-6 lg:col-span-4">
                {/* CARD 5: Recent Voice Pitch */}
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">Recent Voice Pitch</h3>
                  {latestPitchHistory ? (
                    <div className="h-32 w-full mt-1">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={latestPitchHistory.pitchTimeline.map((pitch, index) => ({ time: String(index), pitch: pitch * 100 }))}>
                          <XAxis dataKey="time" hide />
                          <YAxis hide domain={[0, 100]} />
                          <Area type="monotone" dataKey="pitch" stroke="#b91c1c" fill="#fca5a5" fillOpacity={0.3} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="mt-8 text-center text-xs text-slate-400">No historical pitch data yet.</p>
                  )}
                  <span className="text-[10px] text-slate-400">Latest recording</span>
                </div>

                {/* CARD 6: Historical Log Table */}
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">Historical Log</h3>

                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="text-slate-400 border-b border-slate-100 font-semibold text-[11px]">
                          <th className="pb-2">Name</th>
                          <th className="pb-2">Codeword / Threat</th>
                          <th className="pb-2 text-right">Time</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {history.slice(0, 4).map((h) => (
                          <tr key={h.id} className="text-slate-700">
                            <td className="py-2.5 font-medium">{h.fileName}</td>
                            <td className="py-2.5 text-red-600 font-bold">
                              {h.codewordsDetected[0] || "following threat"}
                            </td>
                            <td className="py-2.5 text-right text-slate-400 text-[11px]">{h.timestamp}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* PREVIOUS HISTORY TAB */}
          {activeTab === "history" && (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <h3 className="text-base font-bold text-slate-900">Recorded Speech History & Session Logs</h3>
                {history.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setHistory([])} className="text-xs text-red-500 cursor-pointer">
                    <Trash2 className="h-3.5 w-3.5" /> Clear All History
                  </Button>
                )}
              </div>

              <div className="mt-4 divide-y divide-slate-100">
                {history.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col gap-1 py-3.5 hover:bg-slate-50 px-3 rounded-2xl cursor-pointer"
                    onClick={() => {
                      setCurrentAnalysis({
                        score: item.score,
                        level: item.level,
                        signals: item.signals,
                        summary: item.summary,
                        transcript: item.transcript,
                        codewordsDetected: item.codewordsDetected,
                        ...(item.timelineMarkers ? { timelineMarkers: item.timelineMarkers } : {}),
                      });
                      setManualTranscriptInput(item.transcript);
                      setActiveTab("dashboard");
                    }}
                  >
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="text-slate-900">{item.fileName}</span>
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", item.level === "High Alert" ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700")}>
                        Distress Score: {item.score}/100
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 italic font-mono">“{item.transcript}”</p>
                  </div>
                ))}
              </div>

              <div className="mt-6 border-t border-red-100 pt-4">
                <h4 className="text-sm font-bold text-red-900">Emergency Alerts</h4>
                <div className="mt-3 flex flex-col gap-2">
                  {alertHistory.length === 0 && <p className="text-xs text-slate-500">No in-app alerts received.</p>}
                  {alertHistory.slice(0, 10).map((alert) => (
                    <div key={alert._id} className="rounded-xl bg-red-50 p-3 text-xs">
                      <p className="font-bold text-red-800">@{alert.victimUsername} · score {alert.distressScore}</p>
                      <p className="mt-1 text-slate-600">{alert.message}</p>
                      {alert.location && (
                        <div className="mt-2 flex items-start gap-1.5 text-emerald-700">
                          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <a
                            href={`https://www.google.com/maps?q=${alert.location.latitude},${alert.location.longitude}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono underline hover:text-emerald-900"
                          >
                            Live GPS Location: {alert.location.latitude.toFixed(5)}, {alert.location.longitude.toFixed(5)} (Google Maps)
                          </a>
                        </div>
                      )}
                      <p className="mt-1 text-[10px] text-slate-400">{new Date(alert.triggeredAt).toLocaleString()} · {alert.status}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* CODEWORDS & MULTI-CONTACT SETUP TAB */}
          {activeTab === "settings" && (
            <div className="grid gap-6 lg:grid-cols-2">
              {/* MULTILINGUAL CODEWORDS DICTIONARY */}
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Globe className="h-4 w-4 text-sky-600" /> Multilingual Codewords Dictionary
                  </h3>
                </div>

                <p className="mt-2 text-xs text-slate-500 leading-relaxed">
                  Add safety codewords in any language (English, Devanagari Hindi like 'खतरा', Spanish, etc.). Supports transliterated script matching & voice input!
                </p>

                <div className="mt-4 flex gap-2">
                  <Input
                    placeholder="Type codeword in any language (e.g., 'खतरा', 'socorro')..."
                    value={newCodeword}
                    onChange={(e) => setNewCodeword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addManualCodeword()}
                    className="rounded-xl text-xs"
                  />
                  <Button onClick={addManualCodeword} size="sm" className="rounded-xl font-bold cursor-pointer">
                    <Plus className="h-4 w-4" /> Add
                  </Button>

                  <Button
                    onClick={listenForVoiceCodeword}
                    size="sm"
                    variant={isListeningForCodeword ? "destructive" : "outline"}
                    className={cn("rounded-xl font-bold cursor-pointer", isListeningForCodeword && "animate-pulse")}
                    title="Speak codeword via microphone to add"
                  >
                    <Mic className="h-4 w-4" /> {isListeningForCodeword ? "Listening..." : "Voice Add"}
                  </Button>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {codewords.map((word) => (
                    <span
                      key={word}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-800"
                    >
                      {word}
                      <button onClick={() => removeCodeword(word)} className="text-slate-400 hover:text-red-500 cursor-pointer">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* MULTIPLE EMERGENCY CONTACTS MANAGER */}
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <UserPlus className="h-4 w-4 text-emerald-600" /> Multiple Emergency Contacts
                  </h3>
                </div>

                  <div className="mt-4 rounded-2xl border border-red-100 bg-red-50/60 p-4">
                    <p className="text-xs font-bold text-red-900">In-app emergency contacts</p>
                    <div className="mt-2 flex gap-2">
                      <Input
                        placeholder="SunoSaathi username"
                        value={contactUsername}
                        onChange={(event) => setContactUsername(event.target.value)}
                        className="rounded-xl bg-white text-xs"
                      />
                      <Button onClick={addAppContact} size="sm" className="rounded-xl bg-red-600 font-bold text-white hover:bg-red-700">
                        <Plus className="h-3.5 w-3.5" /> Add
                      </Button>
                    </div>
                    {contactError && <p className="mt-2 text-xs font-medium text-red-700">{contactError}</p>}
                    <div className="mt-3 flex flex-col gap-2">
                      {appContacts.map((contact) => (
                        <div key={contact._id} className="flex items-center justify-between rounded-xl bg-white p-2.5 text-xs">
                          <span><b>{contact.contactName}</b> <span className="text-slate-500">@{contact.contactUsername}</span></span>
                          <button onClick={() => removeAppContact(contact._id)} className="text-slate-400 hover:text-red-500" aria-label={`Remove ${contact.contactUsername}`}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <Input
                    placeholder="Contact Name"
                    value={newContactName}
                    onChange={(e) => setNewContactName(e.target.value)}
                    className="rounded-xl text-xs"
                  />
                  <Input
                    placeholder="Phone Number"
                    value={newContactPhone}
                    onChange={(e) => setNewContactPhone(e.target.value)}
                    className="rounded-xl text-xs"
                  />
                  <Button onClick={addEmergencyContact} size="sm" className="rounded-xl font-bold cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white">
                    <Plus className="h-3.5 w-3.5" /> Add Contact
                  </Button>
                </div>

                <div className="mt-4 flex flex-col gap-2">
                  {contacts.map((c) => (
                    <div key={c.id} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 p-3 text-xs">
                      <div>
                        <p className="font-bold text-slate-900">{c.name} <span className="text-[10px] font-normal text-slate-400">({c.relationship})</span></p>
                        <p className="font-mono text-slate-500">{c.phone}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-semibold text-emerald-600">Auto-SMS</span>
                        <button onClick={() => removeEmergencyContact(c.id)} className="text-slate-400 hover:text-red-500 cursor-pointer">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Credit */}
        <footer className="mt-auto border-t border-slate-200 py-3 text-center text-[11px] font-medium text-slate-400">
          Advanced Distress Analyzer AI by ShieldTech
        </footer>
      </main>

      {/* EMERGENCY ALERT MODAL WITH PERMISSION PROMPT MODE & TWILIO DISPATCH */}
      {showAlertModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-3xl border border-red-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-600 text-white shadow-lg shadow-red-600/30">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-red-600">
                  {autoDispatchEnabled
                    ? (currentAnalysis?.score && currentAnalysis.score >= 90 ? "CRITICAL EMERGENCY ESCALATION!" : "HIGH DISTRESS ALERT DISPATCHED!")
                    : "DANGER DETECTED — AUTO DISPATCH OFF"}
                </h3>
                <p className="text-xs text-slate-500">
                  {currentAnalysis?.summary || "Codeword spoken or acoustic danger score detected"}
                </p>
              </div>
            </div>

            {/* 15-SECOND REMINDER TIMER DISPLAY WHEN AUTO DISPATCH IS OFF */}
            {!autoDispatchEnabled && countdown !== null && (
              <div className="my-3 rounded-2xl bg-amber-50 p-3 border border-amber-200 text-xs font-semibold text-amber-900 flex items-center justify-between shadow-sm">
                <span className="flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
                  </span>
                  Auto-Dispatch is OFF. Automatic dispatch in:
                </span>
                <span className="font-mono text-xs font-extrabold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-lg border border-amber-300">
                  {countdown}s
                </span>
              </div>
            )}

            {/* LIVE GPS LOCATION DISPLAY */}
            <div className="my-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3 flex items-center gap-2.5">
              <MapPin className="h-4 w-4 text-emerald-600 shrink-0" />
              <div className="text-xs">
                <p className="font-bold text-emerald-950 flex items-center gap-1.5">
                  Live GPS Location
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                </p>
                {liveLocation ? (
                  <a
                    href={`https://www.google.com/maps?q=${liveLocation.latitude},${liveLocation.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] font-mono text-emerald-700 underline hover:text-emerald-900"
                  >
                    {liveLocation.latitude.toFixed(5)}, {liveLocation.longitude.toFixed(5)} (Google Maps)
                  </a>
                ) : (
                  <p className="text-[11px] text-emerald-700 font-medium">{locationStatus}</p>
                )}
              </div>
            </div>

            <div className="my-3 rounded-2xl bg-red-50 p-4 border border-red-100">
              <p className="text-xs font-bold text-red-900 flex items-center justify-between">
                <span>{autoDispatchEnabled ? "Emergency SMS & WhatsApp Transmitted:" : "Emergency Contacts Ready for Dispatch:"}</span>
                <span className="text-[10px] text-red-700 bg-red-100 px-2 py-0.5 rounded-full font-semibold">Twilio SMS/WA</span>
              </p>
              <div className="mt-2 flex flex-col gap-1.5">
                {contacts.map((c) => (
                  <div key={c.id} className="flex justify-between items-center text-xs font-semibold text-slate-800">
                    <span className="flex items-center gap-1">
                      <MessageSquare className="h-3 w-3 text-red-500" />
                      {c.name}
                    </span>
                    <span className="font-mono text-slate-500 text-[11px]">{c.phone}</span>
                  </div>
                ))}
              </div>
            </div>

            {dispatchStatus && (
              <p className="mb-3 text-center text-xs font-medium text-emerald-700 bg-emerald-50 p-2 rounded-xl border border-emerald-100">
                {dispatchStatus}
              </p>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 rounded-xl cursor-pointer"
                onClick={() => {
                  cancelTimer();
                  setShowAlertModal(false);
                }}
              >
                {autoDispatchEnabled ? "Dismiss" : "Cancel (Don't Send)"}
              </Button>
              <Button
                variant="destructive"
                className="flex-1 rounded-xl font-bold bg-red-600 hover:bg-red-700 cursor-pointer"
                disabled={isDispatching}
                onClick={async () => {
                  cancelTimer();
                  await triggerEmergencyDispatches();
                }}
              >
                {isDispatching ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Phone className="h-4 w-4 mr-1" />}
                {autoDispatchEnabled ? "Resend Twilio Alerts" : "Send SMS & WhatsApp"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {incomingAlert && (
        <div className="fixed right-4 top-4 z-[60] w-[min(24rem,calc(100vw-2rem))] rounded-2xl border-2 border-red-500 bg-white p-4 shadow-2xl">
          <div className="flex items-start gap-3">
            <ShieldAlert className="h-6 w-6 shrink-0 text-red-600" />
            <div className="min-w-0 flex-1">
              <p className="font-extrabold text-red-700">🚨 EMERGENCY ALERT</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">{incomingAlert.victimUsername} (@{incomingAlert.victimUsername}) has triggered a safety alert.</p>
              <p className="mt-1 text-xs text-slate-600">Distress Score: {incomingAlert.distressScore}</p>
              <p className="mt-1 text-xs text-slate-500">Time: {new Date(incomingAlert.triggeredAt).toLocaleString()}</p>
              <p className="mt-1 text-xs text-slate-500">{incomingAlert.message}</p>
              {incomingAlert.location && (
                <a
                  href={`https://www.google.com/maps?q=${incomingAlert.location.latitude},${incomingAlert.location.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 flex items-center gap-1.5 text-xs font-medium text-emerald-700 underline hover:text-emerald-900"
                >
                  <MapPin className="h-3.5 w-3.5" />
                  Live GPS Location: {incomingAlert.location.latitude.toFixed(5)}, {incomingAlert.location.longitude.toFixed(5)} (Google Maps)
                </a>
              )}
              <div className="mt-3 flex gap-2">
                <Button size="sm" className="bg-red-600 text-xs hover:bg-red-700" onClick={() => { setActiveTab("history"); setIncomingAlert(null); }}>View Alert</Button>
                <Button size="sm" variant="outline" className="text-xs" onClick={() => markAlertRead(incomingAlert)}>Mark read</Button>
                <Button size="sm" variant="outline" className="text-xs" onClick={() => setIncomingAlert(null)}>Dismiss</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCalculator && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md">
          <div className="w-full max-w-xs rounded-2xl border border-slate-700 bg-slate-900 p-4 text-slate-100 shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] tracking-wider text-slate-400">CALCULATOR v2.4</span>
              <button type="button" onClick={closeCalculator} aria-label="Close calculator" className="cursor-pointer rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 rounded-xl border border-slate-700 bg-slate-950 p-3 text-right font-mono">
              <div className="text-[10px] text-slate-500">STD MODE</div>
              <div className="mt-2 min-h-10 break-all text-3xl text-emerald-400">{calculatorDisplay}</div>
              {calculatorAlertSent && <div className="mt-1 text-[10px] text-emerald-500">● ALERT SENT !</div>}
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2">
              {[
                { key: "C", style: "bg-slate-700 text-slate-200 hover:bg-slate-600" },
                { key: "÷", style: "bg-amber-600 text-white hover:bg-amber-500" },
                { key: "×", style: "bg-amber-600 text-white hover:bg-amber-500" },
                { key: "⌫", style: "bg-slate-700 text-slate-200 hover:bg-slate-600" },
                { key: "7", style: "bg-slate-800 text-white hover:bg-slate-700" },
                { key: "8", style: "bg-slate-800 text-white hover:bg-slate-700" },
                { key: "9", style: "bg-slate-800 text-white hover:bg-slate-700" },
                { key: "-", style: "bg-amber-600 text-white hover:bg-amber-500" },
                { key: "4", style: "bg-slate-800 text-white hover:bg-slate-700" },
                { key: "5", style: "bg-slate-800 text-white hover:bg-slate-700" },
                { key: "6", style: "bg-slate-800 text-white hover:bg-slate-700" },
                { key: "+", style: "bg-amber-600 text-white hover:bg-amber-500" },
                { key: "1", style: "bg-slate-800 text-white hover:bg-slate-700" },
                { key: "2", style: "bg-slate-800 text-white hover:bg-slate-700" },
                { key: "3", style: "bg-slate-800 text-white hover:bg-slate-700" },
                { key: "=", style: "bg-emerald-600 text-white hover:bg-emerald-500" },
                { key: "0", style: "bg-slate-800 text-white hover:bg-slate-700" },
                { key: ".", style: "bg-slate-800 text-white hover:bg-slate-700" },
              ].map(({ key, style }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleCalculatorKey(key)}
                  className={cn("h-12 cursor-pointer rounded-xl text-lg font-semibold transition-colors", style, key === "=" && "row-span-2 h-full")}
                >
                  {key}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showFakeCallModal && (
        <div className="fixed inset-0 z-[100] flex min-h-screen flex-col items-center justify-between bg-[#0b0f19] px-6 py-10 text-white">
          {fakeCallState === "incoming" ? (
            <>
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <PhoneIncoming className="h-4 w-4" />
                Incoming Call...
              </div>
              <div className="flex flex-col items-center">
                <div className="relative flex h-36 w-36 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-sky-600 text-6xl font-semibold shadow-2xl shadow-emerald-500/20 before:absolute before:inset-[-18px] before:rounded-full before:border before:border-emerald-400/30 before:animate-ping after:absolute after:inset-[-8px] after:rounded-full after:border after:border-emerald-400/40">
                  M
                </div>
                <h2 className="mt-10 text-3xl font-semibold">Mom</h2>
              </div>
              <div className="flex w-full max-w-sm justify-between px-8">
                <button type="button" onClick={declineFakeCall} className="flex cursor-pointer flex-col items-center gap-3 text-sm text-slate-300">
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 shadow-lg shadow-red-600/30 transition-transform hover:scale-105"><PhoneOff className="h-7 w-7" /></span>
                  Decline
                </button>
                <button type="button" onClick={acceptFakeCall} className="flex cursor-pointer flex-col items-center gap-3 text-sm text-slate-300">
                  <span className="flex h-16 w-16 animate-pulse items-center justify-center rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/30 transition-transform hover:scale-105"><Phone className="h-7 w-7" /></span>
                  Accept
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="text-center">
                <h2 className="text-3xl font-semibold">Mom</h2>
                <p className="mt-2 font-mono text-2xl text-slate-300">{formatClock(elapsed)}</p>
                <p className="mt-4 flex items-center justify-center gap-2 text-xs text-emerald-400"><Mic className="h-4 w-4 animate-pulse" /> Recording speech &amp; analyzing codewords...</p>
              </div>
              <div className="flex flex-col items-center text-center">
                <div className="flex h-40 w-40 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-sky-600 text-7xl font-semibold shadow-2xl shadow-emerald-500/20">M</div>
                <p className="mt-8 max-w-sm text-sm leading-relaxed text-slate-400">Microphone is listening in background. Codewords spoken will trigger emergency alert dispatch.</p>
              </div>
              <div className="flex flex-col items-center gap-8">
                <div className="flex gap-5">
                  {([ [MicOff, "Mute"], [Volume2, "Speaker"], [Key, "Keypad"] ] as const).map(([ControlIcon, label]) => {
                    return <div key={label} className="flex flex-col items-center gap-2 text-xs text-slate-400"><span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-800"><ControlIcon className="h-5 w-5" /></span>{label}</div>;
                  })}
                </div>
                <button type="button" onClick={endFakeCall} className="flex cursor-pointer flex-col items-center gap-2 text-sm text-slate-300">
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 shadow-lg shadow-red-600/30 transition-transform hover:scale-105"><PhoneOff className="h-7 w-7" /></span>
                  End Call
                </button>
              </div>
            </>
          )}
        </div>
      )}

    </div>
  );
}