'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { Camera, CheckCircle, Loader, UserPlus } from 'lucide-react';
import api from '@/utils/api';

// Use justadudewhohacks/face-api.js compatible model CDN
const MODEL_URL = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights';

// Threshold for the detection box to trigger a verify attempt
const DETECT_CONFIDENCE = 0.6;

const STATUS = {
  INIT:       'init',
  READY:      'ready',
  SCANNING:   'scanning',
  SUCCESS:    'success',
  FAILED:     'failed',
};

export default function FaceScanner({ onSuccess, onCancel, mode = 'verify' }) {
  const videoRef    = useRef(null);
  const canvasRef   = useRef(null);
  const streamRef   = useRef(null);
  const intervalRef = useRef(null);
  const fapiRef     = useRef(null); // stable ref — avoids stale closure

  const [status,   setStatus]   = useState(STATUS.INIT);
  const [message,  setMessage]  = useState('Loading face recognition models...');
  const [progress, setProgress] = useState(0);
  const [result,   setResult]   = useState(null);

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        setMessage('Loading models (1/3)...'); setProgress(15);
        const fapi = await import('face-api.js');
        fapiRef.current = fapi;

        setMessage('Loading detector (2/3)...'); setProgress(40);
        await fapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);

        setMessage('Loading recognizer (3/3)...'); setProgress(70);
        await fapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
        await fapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);

        if (!mounted) return;
        setProgress(100);
        setMessage('Starting camera...');
        await startCamera();
      } catch (err) {
        console.error('face-api init error:', err);
        if (mounted) {
          setMessage('Failed to load models. Check your connection and retry.');
          setStatus(STATUS.FAILED);
        }
      }
    }

    init();
    return () => { mounted = false; stopCamera(); };
  }, []);

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      video.onloadedmetadata = () => {
        video.play();
        setStatus(STATUS.READY);
        setMessage(mode === 'register' ? 'Center your face to register' : 'Center your face to check in');
        startDetection();
      };
    } catch {
      setMessage('Camera access denied. Please allow camera and retry.');
      setStatus(STATUS.FAILED);
    }
  }

  function stopCamera() {
    clearInterval(intervalRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
  }

  // Uses fapiRef so it never goes stale on retry
  const startDetection = useCallback(() => {
    clearInterval(intervalRef.current);

    intervalRef.current = setInterval(async () => {
      const fapi  = fapiRef.current;
      const video = videoRef.current;
      if (!fapi || !video || video.readyState < 2) return;

      try {
        const detection = await fapi
          .detectSingleFace(video, new fapi.TinyFaceDetectorOptions({ scoreThreshold: DETECT_CONFIDENCE }))
          .withFaceLandmarks()
          .withFaceDescriptor();

        // Draw overlay
        if (canvasRef.current) {
          const dims    = fapi.matchDimensions(canvasRef.current, video, true);
          const ctx     = canvasRef.current.getContext('2d');
          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
          if (detection) {
            const resized = fapi.resizeResults(detection, dims);
            fapi.draw.drawDetections(canvasRef.current, resized);
          }
        }

        if (!detection) {
          setMessage(mode === 'register' ? 'No face detected — look at the camera' : 'No face detected — center your face');
          return;
        }

        const score = detection.detection.score;
        setMessage(`Confidence: ${(score * 100).toFixed(0)}% — hold still...`);

        if (score >= DETECT_CONFIDENCE) {
          clearInterval(intervalRef.current);
          setStatus(STATUS.SCANNING);
          const embedding = Array.from(detection.descriptor);

          if (mode === 'register') {
            await registerWithBackend(embedding);
          } else {
            setMessage('Verifying identity...');
            await verifyWithBackend(embedding);
          }
        }
      } catch (e) {
        // silently skip frame errors
      }
    }, 600);
  }, [mode]);

  async function verifyWithBackend(embedding) {
    try {
      const location = await getGPS();
      const { data } = await api.post('/face/verify', {
        embedding,
        ...location,
        device_id: navigator.userAgent.slice(0, 80),
      });

      if (data.success) {
        // Attempt check-in/out
        const today = await api.get('/attendance/status/' + data.data.employee_id).catch(() => null);
        const alreadyIn = today?.data?.data?.status === 'checked_in';

        const endpoint = alreadyIn ? '/attendance/check-out' : '/attendance/check-in';
        try {
          await api.post(endpoint, {
            employee_id: data.data.employee_id,
            ...location,
            method: 'face',
            device_id: navigator.userAgent.slice(0, 80),
          });
        } catch (err) {
          const code = err.response?.data?.error;
          if (code !== 'ALREADY_CHECKED_IN' && code !== 'ALREADY_CHECKED_OUT') {
            console.warn('attendance after face:', err.response?.data?.message);
          }
        }

        setResult({ ...data.data, action: alreadyIn ? 'checkout' : 'checkin' });
        setStatus(STATUS.SUCCESS);
        setMessage(`Welcome, ${data.data.employee_name}!`);
        stopCamera();
        onSuccess?.(data.data);
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Face not recognized.';
      toast.error(msg);
      setStatus(STATUS.READY);
      setMessage('Not recognized — please try again');
      startDetection();
    }
  }

  async function registerWithBackend(embedding) {
    try {
      const empId = prompt('Enter your Employee ID to register your face:')?.trim();
      if (!empId) { setStatus(STATUS.READY); setMessage('Registration cancelled.'); startDetection(); return; }

      await api.post('/face/register', { employee_id: empId, embedding });
      setResult({ employee_name: empId });
      setStatus(STATUS.SUCCESS);
      setMessage('Face registered successfully!');
      stopCamera();
      onSuccess?.({ employee_id: empId });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Registration failed.');
      setStatus(STATUS.READY);
      setMessage('Registration failed — try again');
      startDetection();
    }
  }

  function getGPS() {
    return new Promise(resolve => {
      if (!navigator.geolocation) return resolve({});
      navigator.geolocation.getCurrentPosition(
        p => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
        () => resolve({}),
        { timeout: 5000 }
      );
    });
  }

  return (
    <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-sm w-full mx-auto">
      <div className="text-center mb-4">
        <Camera className="w-8 h-8 text-brand-primary mx-auto mb-2" />
        <h2 className="font-bold text-gray-800 text-lg">
          {mode === 'register' ? 'Register Face' : 'Face Recognition'}
        </h2>
        <p className="text-sm text-gray-500 mt-1">{message}</p>
      </div>

      {/* Progress bar during model load */}
      {status === STATUS.INIT && (
        <div className="w-full bg-gray-100 rounded-full h-2 mb-4">
          <div
            className="bg-brand-primary h-2 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Camera viewport */}
      <div className="relative mb-4 rounded-2xl overflow-hidden bg-gray-900" style={{ aspectRatio: '4/3' }}>
        <video ref={videoRef} className="w-full h-full object-cover" playsInline muted autoPlay />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

        {/* Face guide oval */}
        {(status === STATUS.READY || status === STATUS.SCANNING) && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-44 h-52 border-4 border-white/60 rounded-full" />
          </div>
        )}

        {/* Scanning overlay */}
        {status === STATUS.SCANNING && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <div className="text-center text-white">
              <Loader className="w-10 h-10 animate-spin mx-auto mb-2" />
              <p className="text-sm font-medium">
                {mode === 'register' ? 'Registering...' : 'Verifying...'}
              </p>
            </div>
          </div>
        )}

        {/* Success overlay */}
        {status === STATUS.SUCCESS && (
          <div className="absolute inset-0 flex items-center justify-center bg-cyan-900/60">
            <div className="text-center text-white">
              <CheckCircle className="w-16 h-16 mx-auto mb-2 text-cyan-300" />
              <p className="font-bold text-lg">{result?.employee_name}</p>
              <p className="text-sm opacity-80">
                {mode === 'register'
                  ? 'Face registered ✓'
                  : result?.action === 'checkout' ? 'Checked out ✓' : 'Attendance recorded ✓'}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => { stopCamera(); onCancel?.(); }}
          className="flex-1 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200
                     rounded-xl hover:bg-gray-50 transition"
        >
          Use QR Instead
        </button>
        {status === STATUS.FAILED && (
          <button onClick={() => window.location.reload()} className="btn-primary flex-1 text-sm py-2.5">
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
