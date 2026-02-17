
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Sparkles, ArrowRight, Loader2, Key } from 'lucide-react';
import RoutePlanner from './components/RoutePlanner';
import StoryPlayer from './components/StoryPlayer';
import MapBackground from './components/MapBackground';
import { AppState, RouteDetails, AudioStory, HistoryItem } from './types';
import { generateSegment, generateSegmentAudio, calculateTotalSegments, generateStoryOutline } from './services/geminiService';

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }

  interface Window {
    webkitAudioContext: typeof AudioContext;
    aistudio?: AIStudio;
    L: any; // Leaflet
  }
}

const WITH_TIMEOUT_MS = 60000;
const HISTORY_STORAGE_KEY = 'echopaths_history_v1';

const withTimeout = <T,>(promise: Promise<T>, ms: number, errorMsg: string): Promise<T> => {
    let timer: any;
    const timeoutPromise = new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(errorMsg)), ms);
    });
    return Promise.race([
        promise.then(val => { clearTimeout(timer); return val; }),
        timeoutPromise
    ]);
};

function App() {
  const [appState, setAppState] = useState<AppState>(AppState.PLANNING);
  const [route, setRoute] = useState<RouteDetails | null>(null);
  const [story, setStory] = useState<AudioStory | null>(null);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [needsGeminiKey, setNeedsGeminiKey] = useState(false);
  const [isUiCollapsed, setIsUiCollapsed] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const [selectedVoice, setSelectedVoice] = useState('Zephyr');
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [mapPickedPoint, setMapPickedPoint] = useState<{lat: number, lng: number, id: number} | null>(null);

  const isGeneratingRef = useRef<boolean>(false);
  const [isBackgroundGenerating, setIsBackgroundGenerating] = useState(false);
  const [currentPlayingIndex, setCurrentPlayingIndex] = useState<number>(0);

  useEffect(() => {
    const savedHistory = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (savedHistory) {
        try { setHistory(JSON.parse(savedHistory)); } catch (e) {}
    }
    const checkApiKey = async () => {
        const envKey = process.env.API_KEY;
        const isEnvKeyEmpty = !envKey || envKey === '""' || envKey === 'undefined';
        if (window.aistudio) {
            const hasKey = await window.aistudio.hasSelectedApiKey();
            if (!hasKey && isEnvKeyEmpty) setNeedsGeminiKey(true);
        } else if (isEnvKeyEmpty) {
            setNeedsGeminiKey(true);
        }
    };
    checkApiKey();
  }, []);

  const saveToHistory = (newRoute: RouteDetails) => {
      setHistory(prev => {
          const filtered = prev.filter(h => h.route.startAddress !== newRoute.startAddress || h.route.endAddress !== newRoute.endAddress);
          const updated = [{ id: Date.now().toString(), route: newRoute, timestamp: Date.now() }, ...filtered].slice(0, 3);
          localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated));
          return updated;
      });
  };

  const handleOpenKeySelector = async () => {
      if (window.aistudio) {
          await window.aistudio.openSelectKey();
          setNeedsGeminiKey(false);
          window.location.reload();
      }
  };

  const handleMapClick = useCallback((lat: number, lng: number) => {
      if (appState === AppState.PLANNING) setMapPickedPoint({lat, lng, id: Date.now()});
  }, [appState]);

  useEffect(() => {
      if (!story || !route || appState < AppState.READY_TO_PLAY) return;
      const totalGenerated = story.segments.length;
      if (totalGenerated < currentPlayingIndex + 3 && totalGenerated < story.totalSegmentsEstimate && !isGeneratingRef.current) {
          generateNextSegment(totalGenerated + 1);
      }
  }, [story, route, appState, currentPlayingIndex, selectedVoice]);

  const generateNextSegment = async (index: number) => {
      if (!route || !story || isGeneratingRef.current) return;
      try {
          isGeneratingRef.current = true;
          setIsBackgroundGenerating(true);
          const allPreviousText = story.segments.map(s => s.text).join(" ").slice(-3000);
          const segmentOutline = story.outline[index - 1] || "Продолжение пути.";
          const segmentData = await withTimeout(generateSegment(route, index, story.totalSegmentsEstimate, segmentOutline, allPreviousText), WITH_TIMEOUT_MS, "Timeout");
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          const tempCtx = new AudioContextClass();
          const audioBuffer = await withTimeout(generateSegmentAudio(segmentData.text, tempCtx, selectedVoice), WITH_TIMEOUT_MS * 1.5, "Timeout");
          await tempCtx.close();
          setStory(prev => {
              if (!prev || prev.segments.some(s => s.index === index)) return prev;
              return { ...prev, segments: [...prev.segments, { ...segmentData, audioBuffer }].sort((a, b) => a.index - b.index) };
          });
      } catch (e) {
          console.error(e);
      } finally {
          isGeneratingRef.current = false;
          setIsBackgroundGenerating(false);
      }
  };

  const handleStartStory = async () => {
    if (!route) return;
    saveToHistory(route);
    setGenerationError(null);
    try {
      setAppState(AppState.GENERATING_INITIAL_SEGMENT);
      const totalSegmentsEstimate = calculateTotalSegments(route.durationSeconds);
      setLoadingMessage("Создаем план...");
      const outline = await withTimeout(generateStoryOutline(route, totalSegmentsEstimate), WITH_TIMEOUT_MS, "Error");
      setLoadingMessage("Пишем первую главу...");
      const seg1Data = await withTimeout(generateSegment(route, 1, totalSegmentsEstimate, outline[0], ""), WITH_TIMEOUT_MS, "Error");
      setLoadingMessage("Готовим звук...");
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const tempCtx = new AudioContextClass();
      const seg1Audio = await withTimeout(generateSegmentAudio(seg1Data.text, tempCtx, selectedVoice), WITH_TIMEOUT_MS * 1.5, "Error");
      await tempCtx.close();
      setStory({ totalSegmentsEstimate, outline, segments: [{ ...seg1Data, audioBuffer: seg1Audio }] });
      setAppState(AppState.READY_TO_PLAY);
    } catch (error) {
      setAppState(AppState.PLANNING);
      setGenerationError("Ошибка. Попробуйте еще раз.");
    }
  };

  const handleVoiceChange = async (newVoice: string) => {
      setSelectedVoice(newVoice);
      if (story && appState >= AppState.READY_TO_PLAY) {
          const currentSeg = story.segments[currentPlayingIndex];
          if (currentSeg) {
              setIsBackgroundGenerating(true);
              const AudioContextClass = window.AudioContext || window.webkitAudioContext;
              const tempCtx = new AudioContextClass();
              try {
                  const newAudio = await generateSegmentAudio(currentSeg.text, tempCtx, newVoice);
                  setStory(prev => {
                      if (!prev) return prev;
                      const updated = [...prev.segments];
                      updated[currentPlayingIndex] = { ...currentSeg, audioBuffer: newAudio };
                      return { ...prev, segments: updated };
                  });
              } catch (e) {} finally {
                  await tempCtx.close();
                  setIsBackgroundGenerating(false);
              }
          }
      }
  };

  const handleReset = () => {
      setAppState(AppState.PLANNING);
      setRoute(null); setStory(null); setCurrentPlayingIndex(0);
      setGenerationError(null); setMapPickedPoint(null); setIsUiCollapsed(false);
  }

  if (needsGeminiKey) {
      return (
          <div className="min-h-screen bg-editorial-100 flex items-center justify-center p-6 text-center">
              <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl max-w-lg space-y-6 border border-stone-100">
                  <div className="bg-editorial-900 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
                      <Key size={32} className="text-white" />
                  </div>
                  <h2 className="text-3xl font-serif text-editorial-900">Нужен API-ключ Gemini</h2>
                  <button onClick={handleOpenKeySelector} className="w-full bg-editorial-900 text-white py-4 rounded-full font-bold hover:bg-stone-800 transition-all">
                      Выбрать API-ключ
                  </button>
              </div>
          </div>
      );
  }

  return (
    <div className="h-screen w-screen bg-editorial-100 text-editorial-900 relative selection:bg-stone-200 overflow-hidden">
      {/* Map is always interactive in empty space */}
      <div className="absolute inset-0 z-0">
        <MapBackground 
            route={route} 
            onMapClick={handleMapClick}
            isFullView={appState === AppState.PLANNING}
        />
      </div>

      {/* UI Overlay Wrappers use pointer-events-none */}
      <div className="absolute inset-0 z-10 pointer-events-none overflow-hidden">
        <RoutePlanner 
            onRouteUpdate={(details) => setRoute(details)}
            onConfirmRoute={handleStartStory} 
            appState={appState} 
            externalError={generationError}
            mapPickedPoint={mapPickedPoint}
            isCollapsed={isUiCollapsed}
            onToggleCollapse={() => setIsUiCollapsed(!isUiCollapsed)}
            history={history}
        />
      </div>

      <main className={`relative z-20 h-full overflow-y-auto pt-20 pb-32 px-6 transition-all duration-700 pointer-events-none`}>
        {appState === AppState.GENERATING_INITIAL_SEGMENT && (
            <div className="fixed inset-0 bg-white/60 backdrop-blur-md z-[100] flex flex-col items-center justify-center space-y-6 text-center px-10 pointer-events-auto">
                <div className="relative">
                    <Loader2 size={64} className="animate-spin text-editorial-900" />
                    <Sparkles size={24} className="absolute -top-2 -right-2 text-amber-500 animate-pulse" />
                </div>
                <h3 className="text-3xl font-serif text-editorial-900 max-w-md">{loadingMessage}</h3>
            </div>
        )}

        {appState >= AppState.READY_TO_PLAY && story && route && (
            <div className={`max-w-4xl mx-auto animate-fade-in transition-all ${isUiCollapsed ? 'opacity-0 scale-95' : 'opacity-100 scale-100 pointer-events-auto'}`}>
                <StoryPlayer 
                    story={story} 
                    route={route} 
                    onSegmentChange={(index) => setCurrentPlayingIndex(index)}
                    isBackgroundGenerating={isBackgroundGenerating}
                    selectedVoice={selectedVoice}
                    onVoiceChange={handleVoiceChange}
                    playbackSpeed={playbackSpeed}
                    onSpeedChange={setPlaybackSpeed}
                />
                
                <div className="mt-20 text-center border-t border-stone-200 pt-10">
                    <button
                        onClick={handleReset}
                        className="group bg-white hover:bg-stone-50 text-editorial-900 px-8 py-4 rounded-full font-bold flex items-center gap-3 mx-auto transition-all border-2 border-stone-100 shadow-sm"
                    >
                        Завершить историю
                        <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                </div>
            </div>
        )}
      </main>
    </div>
  );
}

export default App;
