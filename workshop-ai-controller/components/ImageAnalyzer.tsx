import React, { useState, useCallback, useRef } from 'react';
import { GoogleGenAI, LiveServerMessage, Session } from '@google/genai';
import { UploadIcon, BotIcon, SparklesIcon, MicIcon, StopCircleIcon } from './Icons';

// Audio helper function to encode raw audio bytes to base64
function encode(bytes: Uint8Array): string {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

export const ImageAnalyzer: React.FC = () => {
    const [image, setImage] = useState<string | null>(null);
    const [imageMimeType, setImageMimeType] = useState<string | null>(null);
    const [prompt, setPrompt] = useState<string>('Describe this image in detail.');
    const [analysis, setAnalysis] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string>('');

    const [isListening, setIsListening] = useState(false);
    const [liveTranscript, setLiveTranscript] = useState('');
    
    // Refs for audio processing and live session
    const transcriptRef = useRef('');
    const sessionPromise = useRef<Promise<Session> | null>(null);
    const mediaStream = useRef<MediaStream | null>(null);
    const audioContext = useRef<AudioContext | null>(null);
    const scriptProcessor = useRef<ScriptProcessorNode | null>(null);
    const mediaStreamSource = useRef<MediaStreamAudioSourceNode | null>(null);

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onloadend = () => {
                setImage(reader.result as string);
                setImageMimeType(file.type);
            };
            reader.readAsDataURL(file);
            setAnalysis('');
            setError('');
        }
    };

    const fileToGenerativePart = async (fileDataUrl: string, mimeType: string) => {
        return {
            inlineData: {
                data: fileDataUrl.split(',')[1],
                mimeType
            }
        };
    };

    const analyzeImage = useCallback(async (promptOverride?: string) => {
        const currentPrompt = promptOverride || prompt;
        if (!image || !currentPrompt || !imageMimeType) {
            setError('Please upload an image and provide a prompt.');
            return;
        }
         if (!process.env.API_KEY) {
            setError('API Key is not configured. Analysis is disabled.');
            return;
        }
        
        setLoading(true);
        setError('');
        setAnalysis('');

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const imagePart = await fileToGenerativePart(image, imageMimeType);
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: { parts: [imagePart, { text: currentPrompt }] },
            });
            
            setAnalysis(response.text);

        } catch (err: any) {
            console.error('Error analyzing image:', err);
            setError('Failed to analyze the image. Please check the console for details.');
        } finally {
            setLoading(false);
        }
    }, [image, prompt, imageMimeType]);


    const stopConversation = useCallback(() => {
        if (!isListening) return;
        
        sessionPromise.current?.then(session => session.close());
        sessionPromise.current = null;
        
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
        if (isListening) {
            return;
        }
        if (!process.env.API_KEY) {
            alert("API Key is not configured. Voice prompt is disabled.");
            return;
        }
        setIsListening(true);
        setLiveTranscript('');
        transcriptRef.current = '';

        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

        sessionPromise.current = ai.live.connect({
            model: 'gemini-2.5-flash-native-audio-preview-09-2025',
            callbacks: {
                onopen: async () => {
                    try {
                        audioContext.current = new (window.AudioContext)({ sampleRate: 16000 });
                        mediaStream.current = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: { exact: 16000 } } });
                        mediaStreamSource.current = audioContext.current.createMediaStreamSource(mediaStream.current);
                        scriptProcessor.current = audioContext.current.createScriptProcessor(4096, 1, 1);

                        scriptProcessor.current.onaudioprocess = (audioProcessingEvent) => {
                            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                            const pcmBlob = {
                                data: encode(new Uint8Array(new Int16Array(inputData.map(x => x * 32768)).buffer)),
                                mimeType: 'audio/pcm;rate=16000',
                            };
                            sessionPromise.current?.then(session => session.sendRealtimeInput({ media: pcmBlob }));
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
                        const text = message.serverContent.inputTranscription.text;
                        transcriptRef.current += text;
                        setLiveTranscript(transcriptRef.current);
                    }
                    if (message.serverContent?.turnComplete) {
                        const finalTranscript = transcriptRef.current;
                        stopConversation();
                        if (finalTranscript.trim()) {
                            setPrompt(finalTranscript);
                            analyzeImage(finalTranscript);
                        }
                    }
                },
                onerror: (e) => {
                    console.error("Session error:", e);
                    stopConversation();
                },
                onclose: () => console.log('Session closed.'),
            },
            config: {
                inputAudioTranscription: {},
                systemInstruction: "You are a voice assistant that transcribes a user's question about an image. Be as accurate as possible. Do not respond, only transcribe.",
            }
        });
    }, [isListening, analyzeImage, stopConversation]);


    return (
        <div className="max-w-4xl mx-auto animate-fade-in">
            <div className="bg-gray-800/50 rounded-lg shadow-lg p-6 md:p-8">
                <h2 className="text-2xl font-bold text-center mb-6 text-white">Gemini Image Analyzer</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Image Upload */}
                    <div className="flex flex-col items-center justify-center p-4 bg-gray-900/50 rounded-lg border-2 border-dashed border-gray-600">
                        {image ? (
                            <img src={image} alt="Upload preview" className="max-h-64 w-auto rounded-md object-contain" />
                        ) : (
                            <div className="text-center text-gray-400">
                                <UploadIcon className="mx-auto h-12 w-12"/>
                                <p className="mt-2">Upload an image to analyze</p>
                            </div>
                        )}
                         <input
                            type="file"
                            id="imageUpload"
                            accept="image/*"
                            onChange={handleImageChange}
                            className="hidden"
                        />
                        <label htmlFor="imageUpload" className="mt-4 cursor-pointer bg-cyan-600 text-white px-4 py-2 rounded-md hover:bg-cyan-700 transition-colors font-semibold">
                            {image ? 'Change Image' : 'Select Image'}
                        </label>
                    </div>

                    {/* Prompt & Action */}
                    <div className="flex flex-col">
                        <div className="flex justify-between items-center mb-2">
                             <label htmlFor="prompt" className="font-semibold text-gray-300">Your Prompt</label>
                             <button
                                onClick={isListening ? stopConversation : startConversation}
                                className={`p-2 rounded-full transition-colors ${isListening ? 'bg-red-600 text-white animate-pulse' : 'bg-gray-600 hover:bg-gray-500 text-gray-200'}`}
                                aria-label={isListening ? 'Stop recording' : 'Start voice prompt'}
                            >
                                {isListening ? <StopCircleIcon className="w-5 h-5" /> : <MicIcon className="w-5 h-5" />}
                            </button>
                        </div>
                        <textarea
                            id="prompt"
                            value={isListening ? liveTranscript : prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            rows={4}
                            className="w-full p-2 bg-gray-700 rounded-md border border-gray-600 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition read-only:bg-gray-800/50"
                            placeholder={isListening ? "Listening..." : "e.g., What is in this image?"}
                            readOnly={isListening}
                        />
                         <button
                            onClick={() => analyzeImage()}
                            disabled={loading || !image || isListening}
                            className="mt-4 w-full bg-indigo-600 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-all hover:bg-indigo-700 disabled:bg-gray-500 disabled:cursor-not-allowed"
                        >
                            {loading ? (
                                <>
                                 <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Analyzing...
                                </>
                            ) : (
                                <>
                                <SparklesIcon />
                                Analyze Image
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Analysis Result */}
                 {(analysis || loading || error) && (
                    <div className="mt-8 pt-6 border-t border-gray-700">
                        <h3 className="text-xl font-bold mb-4 text-white flex items-center gap-2">
                           <BotIcon /> Analysis Result
                        </h3>
                        {error && <p className="text-red-400 bg-red-900/50 p-3 rounded-md">{error}</p>}
                        {loading && !analysis && (
                            <div className="space-y-2">
                                <div className="bg-gray-700 h-4 rounded w-full animate-pulse"></div>
                                <div className="bg-gray-700 h-4 rounded w-5/6 animate-pulse"></div>
                                <div className="bg-gray-700 h-4 rounded w-3/4 animate-pulse"></div>
                            </div>
                        )}
                        {analysis && (
                            <div className="prose prose-invert bg-gray-900/50 p-4 rounded-md text-gray-300 max-w-none">
                                {analysis.split('\n').map((line, index) => (
                                    <p key={index} className="mb-2 last:mb-0">{line}</p>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};