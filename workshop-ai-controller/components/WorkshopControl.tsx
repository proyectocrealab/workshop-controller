import React, { useState, useRef, useCallback, useEffect } from 'react';
// FIX: Removed unexported 'LiveSession' type from import.
import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type } from '@google/genai';
import { PowerIcon, CameraIcon, MicIcon, StopCircleIcon, RssIcon, CncIcon, PlayIcon, PauseIcon, StopIcon, WifiIcon, PlugXIcon, ScanIcon } from './Icons';

// Audio helper functions
function encode(bytes: Uint8Array): string {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function decode(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

async function decodeAudioData(
    data: Uint8Array,
    ctx: AudioContext,
    sampleRate: number,
    numChannels: number,
): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
        const channelData = buffer.getChannelData(channel);
        for (let i = 0; i < frameCount; i++) {
            channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
        }
    }
    return buffer;
}


interface LightState {
    power: 'on' | 'off';
    r: number;
    g: number;
    b: number;
}

interface Transcript {
    id: number;
    speaker: 'user' | 'model';
    text: string;
}

type CncStatus = 'Disconnected' | 'Connecting' | 'Idle' | 'Running' | 'Paused';
type LightConnectionStatus = 'Disconnected' | 'Connecting' | 'Connected' | 'Error';


// Gemini Function Declarations
const controlDustCollector: FunctionDeclaration = {
    name: 'controlDustCollector',
    parameters: {
        type: Type.OBJECT,
        description: 'Turns the dust collector on or off.',
        properties: { power: { type: Type.STRING, description: 'The desired state: `on` or `off`.' } },
        required: ['power']
    }
};

const controlLights: FunctionDeclaration = {
    name: 'controlLights',
    parameters: {
        type: Type.OBJECT,
        description: 'Controls the workshop lights, including power and RGB color.',
        properties: {
            power: { type: Type.STRING, description: 'The desired power state: `on` or `off`.' },
            r: { type: Type.NUMBER, description: 'Red color value from 0 to 255.' },
            g: { type: Type.NUMBER, description: 'Green color value from 0 to 255.' },
            b: { type: Type.NUMBER, description: 'Blue color value from 0 to 255.' },
        }
    }
};

const controlCamera: FunctionDeclaration = {
    name: 'controlCamera',
    parameters: {
        type: Type.OBJECT,
        description: 'Controls the workshop camera, including power and recording state.',
        properties: {
            power: { type: Type.STRING, description: 'The desired power state: `on` or `off`.' },
            recording: { type: Type.BOOLEAN, description: 'Set to `true` to start recording, `false` to stop.' }
        }
    }
};

const startCncCycle: FunctionDeclaration = { name: 'startCncCycle', description: 'Starts or resumes the G-code execution on the CNC machine.', parameters: { type: Type.OBJECT, properties: {} } };
const pauseCncCycle: FunctionDeclaration = { name: 'pauseCncCycle', description: 'Pauses the G-code execution on the CNC machine.', parameters: { type: Type.OBJECT, properties: {} } };
const stopCncCycle: FunctionDeclaration = { name: 'stopCncCycle', description: 'Stops the G-code execution on the CNC machine and resets the progress.', parameters: { type: Type.OBJECT, properties: {} } };

const NetworkScanner: React.FC<{
    onSelectIp: (ip: string) => void;
    onClose: () => void;
}> = ({ onSelectIp, onClose }) => {
    const [scanIpBase, setScanIpBase] = useState('192.168.1');
    const [isScanning, setIsScanning] = useState(false);
    const [scanProgress, setScanProgress] = useState(0);
    const [scanResults, setScanResults] = useState<string[]>([]);
    const scanAbortControllerRef = useRef<AbortController | null>(null);

    const handleStartScan = async () => {
        setIsScanning(true);
        setScanProgress(0);
        setScanResults([]);
        scanAbortControllerRef.current = new AbortController();
        const signal = scanAbortControllerRef.current.signal;

        const promises = [];
        // This will hold a controller for each fetch request
        const perRequestControllers: AbortController[] = [];

        // If the main signal is aborted (e.g., user clicks "Stop"), abort all individual fetch requests.
        const onGlobalAbort = () => {
            perRequestControllers.forEach(controller => controller.abort());
        };
        signal.addEventListener('abort', onGlobalAbort);

        for (let i = 1; i <= 254; i++) {
            const ip = `${scanIpBase}.${i}`;
            
            // Create a controller for this specific request to handle its own timeout
            const perRequestController = new AbortController();
            perRequestControllers.push(perRequestController);

            // Set a timeout to abort this specific request
            const timeoutId = setTimeout(() => perRequestController.abort(), 1500);
            
            // FIX: Replaced `AbortSignal.any` which may not be available in all TS environments.
            // This implementation manually combines a global abort signal with a per-request timeout signal.
            const promise = fetch(`http://${ip}/status`, {
                signal: perRequestController.signal
            }).then(response => {
                if (response.ok) {
                    setScanResults(prev => [...prev, ip]);
                }
            }).catch(() => {
                // Ignore errors (timeouts, network errors, etc.)
            }).finally(() => {
                // Clean up the timeout and update progress regardless of outcome
                clearTimeout(timeoutId);
                setScanProgress(p => p + 1);
            });
            promises.push(promise);
        }

        try {
            await Promise.allSettled(promises);
        } finally {
            // Clean up the global abort listener and set scanning state to false
            signal.removeEventListener('abort', onGlobalAbort);
            setIsScanning(false);
        }
    };

    const handleStopScan = () => {
        scanAbortControllerRef.current?.abort();
        setIsScanning(false);
    };

    const handleIpSelect = (ip: string) => {
        onSelectIp(`http://${ip}`);
        onClose();
    };
    
    useEffect(() => {
        return () => {
            scanAbortControllerRef.current?.abort();
        };
    }, []);

    return (
        <div className="absolute inset-0 bg-gray-900/80 backdrop-blur-sm z-20 flex items-center justify-center p-4">
            <div className="bg-gray-800 rounded-lg shadow-2xl p-6 w-full max-w-md relative animate-fade-in">
                <h4 className="text-lg font-bold text-white mb-4">Scan for Lights</h4>
                <div className="flex items-center gap-2 mb-4">
                    <input
                        type="text"
                        value={scanIpBase}
                        onChange={(e) => setScanIpBase(e.target.value)}
                        placeholder="e.g., 192.168.1"
                        disabled={isScanning}
                        className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:ring-2 focus:ring-cyan-500 focus:outline-none disabled:opacity-50"
                    />
                    <button
                        onClick={isScanning ? handleStopScan : handleStartScan}
                        className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors w-28 text-white ${isScanning ? 'bg-red-600 hover:bg-red-700' : 'bg-cyan-600 hover:bg-cyan-700'}`}
                    >
                        {isScanning ? 'Stop' : 'Scan'}
                    </button>
                </div>
                {isScanning && (
                    <div className="mb-4">
                        <div className="flex justify-between text-xs text-gray-400 mb-1">
                            <span>Progress</span>
                            <span>{Math.round((scanProgress / 254) * 100)}%</span>
                        </div>
                        <div className="w-full bg-gray-700 rounded-full h-2.5">
                            <div className="bg-cyan-500 h-2.5 rounded-full transition-all duration-150" style={{ width: `${(scanProgress / 254) * 100}%` }}></div>
                        </div>
                    </div>
                )}
                <div className="bg-gray-900/50 rounded-md p-3 min-h-[120px] max-h-48 overflow-y-auto">
                    {scanResults.length > 0 ? (
                        <ul className="space-y-1">
                            {scanResults.map(ip => (
                                <li key={ip}>
                                    <button onClick={() => handleIpSelect(ip)} className="w-full text-left p-2 rounded-md hover:bg-cyan-800/50 text-cyan-300 font-mono text-sm">
                                        {ip}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    ) : (
                         <p className="text-gray-500 text-center text-sm p-4">
                           {isScanning ? `Scanning ${scanIpBase}.1-254...` : 'No devices found. Ensure they are on the same network.'}
                        </p>
                    )}
                </div>
                 <button onClick={onClose} className="mt-4 w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg">
                    Close
                </button>
            </div>
        </div>
    );
};

export const WorkshopControl: React.FC<{ apiKey: string | null }> = ({ apiKey }) => {
    // Component State
    const [dustCollectorOn, setDustCollectorOn] = useState(false);
    const [lights, setLights] = useState<LightState>({ power: 'off', r: 255, g: 220, b: 180 });
    const [isUpdatingLight, setIsUpdatingLight] = useState(false);
    const [lightIpAddress, setLightIpAddress] = useState('http://192.168.1.50');
    const [lightConnectionStatus, setLightConnectionStatus] = useState<LightConnectionStatus>('Disconnected');
    const [isScannerOpen, setIsScannerOpen] = useState(false);
    const [camera, setCamera] = useState({ power: false, recording: false });
    const [isListening, setIsListening] = useState(false);
    const [transcripts, setTranscripts] = useState<Transcript[]>([]);
    const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
    const [zoomLevel, setZoomLevel] = useState(1);
    const [zoomCapabilities, setZoomCapabilities] = useState<{ min: number; max: number; step: number; } | null>(null);
    const [cncStatus, setCncStatus] = useState<CncStatus>('Disconnected');
    const [gcodeFile, setGcodeFile] = useState<string | null>(null);
    const [gcodeProgress, setGcodeProgress] = useState(0);
    const [wsAddress, setWsAddress] = useState('ws://192.168.1.123:8765');
    
    // Refs
    // FIX: Replaced unexported 'LiveSession' with 'any' for the session promise ref.
    const sessionPromise = useRef<Promise<any> | null>(null);
    const mediaStream = useRef<MediaStream | null>(null);
    const audioContext = useRef<AudioContext | null>(null);
    const scriptProcessor = useRef<ScriptProcessorNode | null>(null);
    const mediaStreamSource = useRef<MediaStreamAudioSourceNode | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordedChunksRef = useRef<Blob[]>([]);
    const websocketRef = useRef<WebSocket | null>(null);
    const lightColorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // --- Smart Light Control ---
    const handleConnectLight = async () => {
        if (!lightIpAddress) return;
        setLightConnectionStatus('Connecting');
        try {
            // Most local APIs have a status/ping endpoint. This simulates that check.
            const response = await fetch(`${lightIpAddress.trim()}/status`, {
                method: 'GET',
                signal: AbortSignal.timeout(3000) // 3-second timeout for quick feedback
            });
            if (!response.ok) throw new Error('Device not responding or incorrect API format.');
            
            // Optional: You could parse the response to get the light's initial state
            // const data = await response.json();
            // setLights(data.state);

            setLightConnectionStatus('Connected');
        } catch (error) {
            console.error("Failed to connect to light:", error);
            setLightConnectionStatus('Error');
        }
    };

    const handleDisconnectLight = () => {
        setLightConnectionStatus('Disconnected');
    };

    const updateLightState = useCallback(async (newState: Partial<LightState>) => {
        if (lightConnectionStatus !== 'Connected' || isUpdatingLight) return;

        const originalState = { ...lights };
        const updatedState = { ...originalState, ...newState };

        setLights(updatedState); // Optimistic UI update
        setIsUpdatingLight(true);

        try {
            const payload: any = {};
            if (newState.power !== undefined) payload.power = newState.power;
            if (newState.r !== undefined || newState.g !== undefined || newState.b !== undefined) {
                payload.color = { r: updatedState.r, g: updatedState.g, b: updatedState.b };
            }
            if (Object.keys(payload).length === 0) return;

            const response = await fetch(`${lightIpAddress.trim()}/state`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(3000)
            });

            if (!response.ok) {
                throw new Error(`Command failed with status: ${response.status}`);
            }
        } catch (error) {
            console.error("Failed to update light state:", error);
            alert("Error: Could not control the light. Check IP and network connection.");
            setLights(originalState); // Revert on failure
            setLightConnectionStatus('Error');
        } finally {
            setIsUpdatingLight(false);
        }
    }, [lightIpAddress, lightConnectionStatus, isUpdatingLight, lights]);
    
    const handleLightPowerToggle = () => {
        updateLightState({ power: lights.power === 'on' ? 'off' : 'on' });
    };

    const handleLightColorChange = (color: keyof Omit<LightState, 'power'>, value: number) => {
        setLights(prev => ({ ...prev, [color]: value }));
        
        if (lightColorTimeoutRef.current) {
            clearTimeout(lightColorTimeoutRef.current);
        }

        lightColorTimeoutRef.current = setTimeout(() => {
            setLights(latestLights => {
                updateLightState({ r: latestLights.r, g: latestLights.g, b: latestLights.b });
                return latestLights;
            });
        }, 250); // Debounce API calls for smooth slider experience
    };

    const applyLightStateFromVoice = (newState: Partial<LightState>) => {
        updateLightState(newState);
    };

    // CNC Control Handlers
    const connectUCCNC = useCallback(() => {
        if (!wsAddress || cncStatus !== 'Disconnected') return;

        setCncStatus('Connecting');
        websocketRef.current = new WebSocket(wsAddress);

        websocketRef.current.onopen = () => {
            console.log('WebSocket connection established.');
        };

        websocketRef.current.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.status) setCncStatus(data.status);
                if (data.gcodeFile) setGcodeFile(data.gcodeFile);
                if (typeof data.progress === 'number') setGcodeProgress(data.progress);
            } catch (e) {
                console.error('Failed to parse incoming WebSocket message:', event.data);
            }
        };

        websocketRef.current.onerror = (error) => {
            console.error('WebSocket error:', error);
            setCncStatus('Disconnected');
        };

        websocketRef.current.onclose = () => {
            console.log('WebSocket connection closed.');
            setCncStatus('Disconnected');
            setGcodeFile(null);
            setGcodeProgress(0);
            websocketRef.current = null;
        };
    }, [wsAddress, cncStatus]);
    
    const disconnectUCCNC = useCallback(() => {
        websocketRef.current?.close();
    }, []);

    const sendCncCommand = useCallback((command: string) => {
        if (websocketRef.current?.readyState === WebSocket.OPEN) {
            websocketRef.current.send(JSON.stringify({ command }));
        }
    }, []);

    const handleCncPlay = useCallback(() => sendCncCommand('play'), [sendCncCommand]);
    const handleCncPause = useCallback(() => sendCncCommand('pause'), [sendCncCommand]);
    const handleCncStop = useCallback(() => sendCncCommand('stop'), [sendCncCommand]);
    
    // Clear WebSockets on unmount
    useEffect(() => {
        return () => {
            websocketRef.current?.close();
             if (lightColorTimeoutRef.current) {
                clearTimeout(lightColorTimeoutRef.current);
            }
        };
    }, []);

    // Effect to manage camera stream based on power state
    useEffect(() => {
        const manageCameraStream = async () => {
            if (camera.power) {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                    setCameraStream(stream);
                    const track = stream.getVideoTracks()[0];
                    if (track) {
                        const capabilities = track.getCapabilities();
                        // @ts-ignore
                        if (capabilities.zoom) {
                            // @ts-ignore
                            const { min, max, step } = capabilities.zoom;
                            setZoomCapabilities({ min, max, step });
                             // @ts-ignore
                            const currentSettings = track.getSettings();
                             // @ts-ignore
                            setZoomLevel(currentSettings.zoom || 1);
                        }
                    }
                } catch (err) {
                    console.error("Error accessing camera:", err);
                    alert("Could not access the camera. Please check permissions.");
                    setCamera(c => ({ ...c, power: false })); // Revert state on error
                }
            } else {
                if (cameraStream) {
                    cameraStream.getTracks().forEach(track => track.stop());
                    setCameraStream(null);
                }
                 if (camera.recording) {
                    setCamera(c => ({...c, recording: false}));
                }
                setZoomCapabilities(null);
                setZoomLevel(1);
            }
        };

        manageCameraStream();

        return () => {
            if (cameraStream) {
                cameraStream.getTracks().forEach(track => track.stop());
            }
        };
    }, [camera.power]);

    // Effect to attach stream to video element
    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.srcObject = cameraStream;
        }
    }, [cameraStream]);

    // Effect to handle recording logic
    useEffect(() => {
        if (camera.recording && cameraStream) {
            recordedChunksRef.current = [];
            const options = { mimeType: 'video/webm; codecs=vp9' };
            let recorder: MediaRecorder;
             try {
                recorder = new MediaRecorder(cameraStream, options);
            } catch (e) {
                console.warn('VP9 codec not supported, falling back.');
                recorder = new MediaRecorder(cameraStream);
            }

            mediaRecorderRef.current = recorder;

            mediaRecorderRef.current.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    recordedChunksRef.current.push(event.data);
                }
            };

            mediaRecorderRef.current.onstop = () => {
                const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                document.body.appendChild(a);
                a.style.display = 'none';
                a.href = url;
                const timestamp = new Date().toISOString().replace(/:/g, '-');
                a.download = `workshop-recording-${timestamp}.webm`;
                a.click();
                window.URL.revokeObjectURL(url);
                a.remove();
                recordedChunksRef.current = [];
            };

            mediaRecorderRef.current.start();
        } else {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                mediaRecorderRef.current.stop();
            }
        }

        return () => {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                mediaRecorderRef.current.stop();
            }
        };
    }, [camera.recording, cameraStream]);

    const handleZoomChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!cameraStream) return;
        const track = cameraStream.getVideoTracks()[0];
        if (track) {
            try {
                const newZoom = parseFloat(e.target.value);
                // FIX: Suppress TypeScript error for non-standard 'zoom' constraint.
                // @ts-ignore
                await track.applyConstraints({ advanced: [{ zoom: newZoom }] });
                setZoomLevel(newZoom);
            } catch (err) {
                console.error("Failed to apply zoom:", err);
            }
        }
    }, [cameraStream]);

    const addTranscript = (speaker: 'user' | 'model', text: string) => {
        if (!text.trim()) return;
        setTranscripts(prev => [...prev, { id: Date.now(), speaker, text }]);
    };
    
    const stopConversation = useCallback(() => {
        if (!isListening) return;
        if(sessionPromise.current) {
            sessionPromise.current.then(session => session.close());
            sessionPromise.current = null;
        }
        
        scriptProcessor.current?.disconnect();
        mediaStreamSource.current?.disconnect();
        audioContext.current?.close().catch(e => console.error("Error closing AudioContext:", e));
        mediaStream.current?.getTracks().forEach(track => track.stop());

        scriptProcessor.current = null;
        mediaStreamSource.current = null;
        audioContext.current = null;
        mediaStream.current = null;

        setIsListening(false);
    }, [isListening]);

    const startConversation = useCallback(async () => {
        if (isListening || !apiKey) {
            if (!apiKey) {
                alert("Please set your Gemini API key to use the voice assistant.");
            }
            return;
        }
        setIsListening(true);
        setTranscripts([]);

        const ai = new GoogleGenAI({ apiKey });
        let currentInputTranscription = '';

        const outputAudioContext = new (window.AudioContext)({ sampleRate: 24000 });
        let nextStartTime = 0;
        const sources = new Set<AudioBufferSourceNode>();

        sessionPromise.current = ai.live.connect({
            model: 'gemini-2.5-flash-native-audio-preview-09-2025',
            callbacks: {
                onopen: async () => {
                    console.log('Session opened.');
                    try {
                        audioContext.current = new (window.AudioContext)({ sampleRate: 16000 });
                        mediaStream.current = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: { exact: 16000 } } });
                        mediaStreamSource.current = audioContext.current.createMediaStreamSource(mediaStream.current);
                        scriptProcessor.current = audioContext.current.createScriptProcessor(4096, 1, 1);

                        scriptProcessor.current.onaudioprocess = (audioProcessingEvent) => {
                            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                            const l = inputData.length;
                            const int16 = new Int16Array(l);
                             for (let i = 0; i < l; i++) {
                                int16[i] = inputData[i] * 32768;
                            }
                            const pcmBlob = {
                                data: encode(new Uint8Array(int16.buffer)),
                                mimeType: 'audio/pcm;rate=16000',
                            };
                            if (sessionPromise.current) {
                               sessionPromise.current.then(session => session.sendRealtimeInput({ media: pcmBlob }));
                            }
                        };
                        mediaStreamSource.current.connect(scriptProcessor.current);
                        scriptProcessor.current.connect(audioContext.current.destination);
                    } catch(err) {
                         console.error("Error initializing audio input:", err);
                         alert("Could not access the microphone at the required sample rate (16000Hz). Please check permissions and that your device supports this sample rate.");
                         stopConversation();
                    }
                },
                onmessage: async (message: LiveServerMessage) => {
                    if (message.serverContent?.inputTranscription) {
                        currentInputTranscription += message.serverContent.inputTranscription.text;
                    }
                    if (message.serverContent?.turnComplete) {
                        addTranscript('user', currentInputTranscription);
                        currentInputTranscription = '';
                    }

                    if (message.toolCall) {
                        for (const fc of message.toolCall.functionCalls) {
                            let result = "ok";
                            // FIX: Cast arguments from function call response to their expected types, as they are 'unknown' by default.
                            try {
                                if (fc.name === 'controlDustCollector') setDustCollectorOn((fc.args.power as string) === 'on');
                                else if (fc.name === 'controlLights') {
                                    const { power, r, g, b } = fc.args;
                                    const newLightState: Partial<LightState> = {};
                                    if (power !== undefined) newLightState.power = power as 'on' | 'off';
                                    if (r !== undefined) newLightState.r = r as number;
                                    if (g !== undefined) newLightState.g = g as number;
                                    if (b !== undefined) newLightState.b = b as number;
                                    applyLightStateFromVoice(newLightState);
                                }
                                else if (fc.name === 'controlCamera') setCamera(prev => ({ ...prev, ...(fc.args.power !== undefined && { power: (fc.args.power as string) === 'on' }), ...(fc.args.recording !== undefined && { recording: fc.args.recording as boolean }) }));
                                else if (fc.name === 'startCncCycle') handleCncPlay();
                                else if (fc.name === 'pauseCncCycle') handleCncPause();
                                else if (fc.name === 'stopCncCycle') handleCncStop();
                            } catch (e) {
                                result = "error executing function";
                            }
                             if (sessionPromise.current) {
                                sessionPromise.current.then(session => session.sendToolResponse({
                                    functionResponses: { id: fc.id, name: fc.name, response: { result: result } }
                                }));
                            }
                        }
                    }

                    const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                    if (audioData) {
                         nextStartTime = Math.max(nextStartTime, outputAudioContext.currentTime);
                         const audioBuffer = await decodeAudioData(decode(audioData), outputAudioContext, 24000, 1);
                         const source = outputAudioContext.createBufferSource();
                         source.buffer = audioBuffer;
                         source.connect(outputAudioContext.destination);
                         source.addEventListener('ended', () => { sources.delete(source); });
                         source.start(nextStartTime);
                         nextStartTime += audioBuffer.duration;
                         sources.add(source);
                    }
                },
                onerror: (e) => console.error("Session error:", e),
                onclose: () => console.log('Session closed.'),
            },
            config: {
                responseModalities: [Modality.AUDIO],
                inputAudioTranscription: {},
                tools: [{ functionDeclarations: [controlDustCollector, controlLights, controlCamera, startCncCycle, pauseCncCycle, stopCncCycle] }],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
                 systemInstruction: 'You are an AI assistant for a prototyping workshop. Be concise. Respond to commands to control tools. Inform the user when an action is taken.',
            }
        });
    }, [isListening, apiKey, handleCncPlay, handleCncPause, handleCncStop, stopConversation, applyLightStateFromVoice]);
    
    const rgbToHex = (r: number, g: number, b: number) => `#${[r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')}`;

    const CncStatusIndicator: React.FC<{status: CncStatus}> = ({ status }) => {
        const statusMap = {
            Disconnected: { text: 'text-gray-500', bg: 'bg-gray-700' },
            Connecting: { text: 'text-blue-300', bg: 'bg-blue-900 animate-pulse' },
            Idle: { text: 'text-cyan-300', bg: 'bg-cyan-900' },
            Running: { text: 'text-green-300', bg: 'bg-green-900' },
            Paused: { text: 'text-yellow-300', bg: 'bg-yellow-900' },
        };
        return <span className={`px-2 py-1 text-xs font-bold rounded-full ${statusMap[status].text} ${statusMap[status].bg}`}>{status}</span>;
    }

    const LightStatusIndicator: React.FC<{status: LightConnectionStatus}> = ({ status }) => {
        const statusMap = {
            Disconnected: { text: 'text-gray-400', Icon: PlugXIcon },
            Connecting: { text: 'text-blue-300 animate-pulse', Icon: WifiIcon },
            Connected: { text: 'text-green-400', Icon: WifiIcon },
            Error: { text: 'text-red-400', Icon: PlugXIcon },
        };
        const { text, Icon } = statusMap[status];
        return <span className={`flex items-center gap-1.5 text-xs font-semibold ${text}`}>
            <Icon className="w-4 h-4" /> {status}
        </span>;
    }

    const isCncConnected = cncStatus !== 'Disconnected' && cncStatus !== 'Connecting';
    const isLightConnected = lightConnectionStatus === 'Connected';
    const isLightConnectable = lightConnectionStatus === 'Disconnected' || lightConnectionStatus === 'Error';

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in relative">
            {isScannerOpen && (
                <NetworkScanner 
                    onSelectIp={setLightIpAddress}
                    onClose={() => setIsScannerOpen(false)}
                />
            )}
            <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
                 {/* CNC Control */}
                <div className="bg-gray-800/50 rounded-lg p-6 shadow-lg flex flex-col">
                    <div className="flex justify-between items-center">
                        <h3 className="text-xl font-bold text-white">CNC Control</h3>
                        <CncIcon className={`w-6 h-6 transition-colors ${isCncConnected ? 'text-green-400' : 'text-gray-600'}`} />
                    </div>
                    <p className="text-gray-400 mt-2">UCCNC G-Code Reproduction</p>
                    
                    <div className="mt-4 flex flex-col gap-3">
                         <div className="flex items-center justify-between">
                            <label htmlFor="ws-address" className="text-sm text-gray-400">Bridge Address</label>
                            <CncStatusIndicator status={cncStatus}/>
                         </div>
                        <div className="flex items-center gap-2">
                             <input 
                                id="ws-address"
                                type="text"
                                value={wsAddress}
                                onChange={(e) => setWsAddress(e.target.value)}
                                placeholder="ws://192.168.1.123:8765"
                                disabled={isCncConnected}
                                className="w-full bg-gray-900/50 border border-gray-600 rounded-md px-2 py-1 text-sm text-gray-200 focus:ring-2 focus:ring-cyan-500 focus:outline-none disabled:opacity-50"
                            />
                            <button 
                                onClick={isCncConnected ? disconnectUCCNC : connectUCCNC} 
                                disabled={cncStatus === 'Connecting'}
                                className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors w-28 text-white disabled:opacity-50 disabled:cursor-wait ${isCncConnected ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}>
                                {cncStatus === 'Connecting' ? 'Connecting...' : isCncConnected ? 'Disconnect' : 'Connect'}
                            </button>
                        </div>
                    </div>

                    <div className={`flex-grow flex flex-col transition-opacity duration-300 ${!isCncConnected ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
                        <div className="mt-4 p-3 bg-gray-900/50 rounded-md text-center">
                            <p className="text-xs text-gray-400">Loaded File</p>
                            <p className="text-base font-mono text-cyan-300 truncate h-6">{gcodeFile || 'None'}</p>
                        </div>
                        <div className="my-4">
                            <div className="flex justify-between text-xs text-gray-400 mb-1">
                                <span>Progress</span>
                                <span>{gcodeProgress.toFixed(0)}%</span>
                            </div>
                            <div className="w-full bg-gray-700 rounded-full h-2.5">
                                <div className="bg-cyan-500 h-2.5 rounded-full transition-all duration-150" style={{ width: `${gcodeProgress}%` }}></div>
                            </div>
                        </div>
                        <div className="mt-auto flex items-center justify-center">
                            <div className="flex items-center gap-4">
                                <button onClick={handleCncPlay} disabled={!gcodeFile || cncStatus === 'Running' || !isCncConnected} className="text-green-400 hover:text-green-300 disabled:text-gray-600 disabled:cursor-not-allowed transition-colors"><PlayIcon className="w-12 h-12"/></button>
                                <button onClick={handleCncPause} disabled={cncStatus !== 'Running'} className="text-yellow-400 hover:text-yellow-300 disabled:text-gray-600 disabled:cursor-not-allowed transition-colors"><PauseIcon className="w-12 h-12"/></button>
                                <button onClick={handleCncStop} disabled={cncStatus !== 'Running' && cncStatus !== 'Paused'} className="text-red-400 hover:text-red-300 disabled:text-gray-600 disabled:cursor-not-allowed transition-colors"><StopIcon className="w-12 h-12"/></button>
                            </div>
                        </div>
                    </div>
                </div>


                 {/* Camera */}
                <div className="bg-gray-800/50 rounded-lg p-6 shadow-lg">
                    <div className="flex justify-between items-center">
                        <h3 className="text-xl font-bold text-white">Camera System</h3>
                        <CameraIcon className={`w-6 h-6 transition-colors ${camera.power ? 'text-cyan-400' : 'text-gray-600'}`} />
                    </div>
                     <p className="text-gray-400 mt-2">Overhead camera for monitoring and recording.</p>
                    <div className="relative mt-4 aspect-video bg-black rounded-md flex items-center justify-center border border-gray-700">
                        {camera.power ? (
                            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover rounded-md"></video>
                        ) : (
                            <div className="text-gray-500 flex flex-col items-center gap-2">
                                <CameraIcon className="w-10 h-10" />
                                <p>Camera is Off</p>
                            </div>
                        )}
                        {camera.recording && (
                            <div className="absolute top-3 left-3 flex items-center gap-2 bg-red-600/80 text-white text-xs font-bold px-2 py-1 rounded-full">
                                <span className="w-2 h-2 bg-red-400 rounded-full animate-pulse"></span>
                                REC
                            </div>
                        )}
                    </div>
                     {zoomCapabilities && (
                        <div className="mt-4 px-1">
                            <label htmlFor="zoom-slider" className="mb-2 block text-sm font-medium text-gray-400">
                                Zoom ({zoomLevel.toFixed(1)}x)
                            </label>
                            <input
                                id="zoom-slider"
                                type="range"
                                min={zoomCapabilities.min}
                                max={zoomCapabilities.max}
                                step={zoomCapabilities.step}
                                value={zoomLevel}
                                onChange={handleZoomChange}
                                disabled={!camera.power}
                                className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-gray-700 accent-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                        </div>
                    )}
                    <div className="mt-4 flex flex-col sm:flex-row gap-4">
                         <button onClick={() => setCamera(c => ({...c, power: !c.power}))} className={`flex-1 py-2 rounded-md font-semibold transition-colors flex items-center justify-center gap-2 ${camera.power ? 'bg-cyan-500 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}>
                            <PowerIcon className="w-5 h-5"/>
                            {camera.power ? 'Power Off' : 'Power On'}
                        </button>
                        <button onClick={() => setCamera(c => ({...c, recording: !c.recording}))} disabled={!camera.power} className={`flex-1 py-2 rounded-md font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${camera.recording ? 'bg-red-500 text-white animate-pulse' : 'bg-gray-700 hover:bg-gray-600'}`}>
                           {camera.recording ? <StopCircleIcon className="w-5 h-5"/> : <CameraIcon className="w-5 h-5" />}
                           {camera.recording ? 'Stop Recording' : 'Start Recording'}
                        </button>
                    </div>
                </div>
                {/* Dust Collector */}
                <div className="bg-gray-800/50 rounded-lg p-6 flex flex-col justify-between shadow-lg">
                    <div className="flex justify-between items-center">
                        <h3 className="text-xl font-bold text-white">Dust Collector</h3>
                        <RssIcon className={`w-6 h-6 transition-colors ${dustCollectorOn ? 'text-green-400' : 'text-gray-600'}`} />
                    </div>
                    <p className="text-gray-400 mt-2">Central dust extraction system.</p>
                    <div className="mt-6 flex items-center justify-center">
                         <button onClick={() => setDustCollectorOn(!dustCollectorOn)} className={`relative w-40 h-16 rounded-full transition-colors duration-300 ${dustCollectorOn ? 'bg-green-500' : 'bg-gray-700'}`}>
                            <span className="absolute top-1/2 left-8 -translate-y-1/2 text-white font-bold">OFF</span>
                            <span className="absolute top-1/2 right-8 -translate-y-1/2 text-white font-bold">ON</span>
                            <span className={`absolute top-1 left-1 block w-14 h-14 bg-white rounded-full shadow-md transform transition-transform duration-300 ${dustCollectorOn ? 'translate-x-[92px]' : ''}`}></span>
                        </button>
                    </div>
                </div>

                {/* Lights */}
                <div className="bg-gray-800/50 rounded-lg p-6 shadow-lg flex flex-col">
                    <div className="flex justify-between items-center">
                        <h3 className="text-xl font-bold text-white">Smart Lighting</h3>
                        <WifiIcon className={`w-6 h-6 transition-colors ${isLightConnected ? 'text-green-400' : 'text-gray-600'}`} />
                    </div>
                    <p className="text-gray-400 mt-2">Control WiFi lights on your local network.</p>
                    
                    <div className="mt-4 flex flex-col gap-3">
                         <div className="flex items-center justify-between">
                            <label htmlFor="light-ip" className="text-sm text-gray-400">Light IP Address</label>
                            <LightStatusIndicator status={lightConnectionStatus}/>
                         </div>
                        <div className="flex items-center gap-2">
                             <input 
                                id="light-ip"
                                type="text"
                                value={lightIpAddress}
                                onChange={(e) => setLightIpAddress(e.target.value)}
                                placeholder="http://192.168.1.50"
                                disabled={!isLightConnectable}
                                className="w-full bg-gray-900/50 border border-gray-600 rounded-md px-2 py-1 text-sm text-gray-200 focus:ring-2 focus:ring-cyan-500 focus:outline-none disabled:opacity-50"
                            />
                             <button 
                                onClick={() => setIsScannerOpen(true)}
                                disabled={!isLightConnectable}
                                className="p-1.5 rounded-md bg-gray-600 hover:bg-gray-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                aria-label="Scan for devices"
                             >
                                <ScanIcon className="w-4 h-4"/>
                             </button>
                        </div>
                        <button 
                            onClick={isLightConnectable ? handleConnectLight : handleDisconnectLight} 
                            disabled={lightConnectionStatus === 'Connecting'}
                            className={`px-3 py-2 text-sm font-semibold rounded-md transition-colors w-full text-white disabled:opacity-50 disabled:cursor-wait ${isLightConnectable ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}>
                            {lightConnectionStatus === 'Connecting' ? 'Connecting...' : isLightConnectable ? 'Connect' : 'Disconnect'}
                        </button>
                    </div>

                    <fieldset 
                        disabled={!isLightConnected || isUpdatingLight}
                        className="flex-grow flex flex-col gap-4 transition-opacity duration-300 group disabled:opacity-40 disabled:cursor-not-allowed mt-4"
                    >
                        <button 
                            onClick={handleLightPowerToggle} 
                            className={`w-full py-2 rounded-md font-semibold transition-colors relative ${lights.power === 'on' ? 'bg-yellow-400 text-gray-900' : 'bg-gray-700 hover:bg-gray-600 group-disabled:hover:bg-gray-700'}`}
                        >
                            {isUpdatingLight && (
                                <span className="absolute left-4 top-1/2 -translate-y-1/2">
                                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                </span>
                            )}
                            {lights.power === 'on' ? 'Turn Off' : 'Turn On'}
                        </button>
                        <div className={`transition-opacity duration-300 ${lights.power === 'on' ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                            {['r', 'g', 'b'].map((color) => (
                                <div key={color} className="flex items-center gap-3">
                                    <span className={`w-4 font-mono uppercase text-${color === 'r' ? 'red' : color === 'g' ? 'green' : 'blue'}-400`}>{color}</span>
                                    <input type="range" min="0" max="255" value={lights[color as keyof Omit<LightState, 'power'>]} onChange={(e) => handleLightColorChange(color as keyof Omit<LightState, 'power'>, parseInt(e.target.value))} className={`w-full h-2 rounded-lg appearance-none cursor-pointer bg-gray-700 accent-${color === 'r' ? 'red' : color === 'g' ? 'green' : 'blue'}-500`} />
                                </div>
                            ))}
                        </div>
                         <div style={{ backgroundColor: rgbToHex(lights.r, lights.g, lights.b) }} className={`w-full h-8 rounded-md mt-2 transition-all duration-300 ${lights.power === 'on' ? 'opacity-100' : 'opacity-20'}`}></div>
                    </fieldset>
                </div>
            </div>

            {/* Voice Assistant */}
            <div className="bg-gray-800/50 rounded-lg p-6 flex flex-col shadow-lg">
                <h3 className="text-xl font-bold text-white mb-4 text-center">Voice Assistant</h3>
                <div className="relative" title={!apiKey ? 'Please provide a Gemini API key to enable the voice assistant.' : ''}>
                    {!isListening ? (
                        <button 
                            onClick={startConversation} 
                            disabled={!apiKey}
                            className="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-transform duration-200 hover:scale-105 disabled:bg-gray-600 disabled:cursor-not-allowed disabled:scale-100"
                        >
                            <MicIcon />
                            Start Conversation
                        </button>
                    ) : (
                        <button 
                            onClick={stopConversation} 
                            className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-transform duration-200 hover:scale-105"
                        >
                            <StopCircleIcon />
                            Stop Conversation
                        </button>
                    )}
                </div>
                <div className="mt-4 flex-grow bg-gray-900/50 rounded-lg p-3 min-h-[200px] max-h-[400px] overflow-y-auto flex flex-col gap-3">
                    {transcripts.length === 0 && <p className="text-gray-500 text-center m-auto">Voice transcripts will appear here...</p>}
                    {transcripts.map((t) => (
                        <div key={t.id} className={`p-2 rounded-lg max-w-[85%] ${t.speaker === 'user' ? 'bg-cyan-900/70 self-end' : 'bg-gray-700/70 self-start'}`}>
                            <p className="text-sm">{t.text}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};