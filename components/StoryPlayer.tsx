
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, MapPin, Clock, Footprints, Car, Loader2, ArrowDownCircle, Download, Settings, Mic2, Gauge, ChevronDown, Check } from 'lucide-react';
import { AudioStory, RouteDetails, StorySegment } from '../types';
import InlineMap from './InlineMap';
import { concatenateAudioBuffers, audioBufferToWavBlob } from '../services/audioUtils';

declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}

interface Props {
  story: AudioStory;
  route: RouteDetails;
  onSegmentChange: (index: number) => void;
  isBackgroundGenerating: boolean;
  selectedVoice: string;
  onVoiceChange: (voice: string) => void;
  playbackSpeed: number;
  onSpeedChange: (speed: number) => void;
}

const VOICES = [
    { id: 'Zephyr', name: 'Zephyr', desc: 'Сбалансированный' },
    { id: 'Puck', name: 'Puck', desc: 'Глубокий' },
    { id: 'Charon', name: 'Charon', desc: 'Таинственный' },
    { id: 'Kore', name: 'Kore', desc: 'Светлый' },
    { id: 'Fenrir', name: 'Fenrir', desc: 'Мощный' },
];

const SPEEDS = [0.8, 1.0, 1.2, 1.5];

const StoryPlayer: React.FC<Props> = ({ 
    story, 
    route, 
    onSegmentChange, 
    isBackgroundGenerating,
    selectedVoice,
    onVoiceChange,
    playbackSpeed,
    onSpeedChange
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [segmentProgress, setSegmentProgress] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef<number>(0); 
  const segmentOffsetRef = useRef<number>(0); 
  const animationFrameRef = useRef<number>(null);
  
  const indexRef = useRef(currentSegmentIndex);
  const textContainerRef = useRef<HTMLDivElement>(null);

  const currentSegment = story.segments[currentSegmentIndex];

  useEffect(() => {
      indexRef.current = currentSegmentIndex;
  }, [currentSegmentIndex]);

  useEffect(() => {
    return () => {
      stopAudio();
      audioContextRef.current?.close();
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  useEffect(() => {
      onSegmentChange(currentSegmentIndex);
  }, [currentSegmentIndex, onSegmentChange]);

  useEffect(() => {
      const segmentNowReady = story.segments[currentSegmentIndex];
      if (isBuffering && isPlaying && segmentNowReady?.audioBuffer) {
          setIsBuffering(false);
          playSegment(segmentNowReady, 0);
      }
  }, [story.segments, currentSegmentIndex, isBuffering, isPlaying]);

  // Update playback speed if it changes during play
  useEffect(() => {
    if (sourceRef.current) {
        sourceRef.current.playbackRate.value = playbackSpeed;
    }
  }, [playbackSpeed]);

  useEffect(() => {
      if (autoScroll && textContainerRef.current) {
          const activeElement = textContainerRef.current.querySelector('[data-active="true"]');
          if (activeElement) {
            activeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
      }
  }, [story.segments.length, currentSegmentIndex, autoScroll]);

  const updateProgress = () => {
    if (isPlaying && !isBuffering && audioContextRef.current && currentSegment?.audioBuffer) {
        const elapsed = (audioContextRef.current.currentTime - startTimeRef.current) * playbackSpeed;
        const duration = currentSegment.audioBuffer.duration;
        const progress = Math.min((elapsed / duration) * 100, 100);
        setSegmentProgress(progress);
        animationFrameRef.current = requestAnimationFrame(updateProgress);
    } else {
        if (!isPlaying) setSegmentProgress(0);
    }
  };

  useEffect(() => {
    if (isPlaying && !isBuffering) {
        animationFrameRef.current = requestAnimationFrame(updateProgress);
    } else {
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    }
    return () => {
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isPlaying, isBuffering, currentSegmentIndex, playbackSpeed]);

  const stopAudio = () => {
      if (sourceRef.current) {
          sourceRef.current.onended = null;
          try { sourceRef.current.stop(); } catch (e) {}
          sourceRef.current = null;
      }
  };

  const playSegment = async (segment: StorySegment, offset: number = 0) => {
      if (!segment?.audioBuffer) {
           setIsBuffering(true);
           return;
      }

      if (!audioContextRef.current) {
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          audioContextRef.current = new AudioContextClass();
      }
      if (audioContextRef.current.state === 'suspended') {
          await audioContextRef.current.resume();
      }

      stopAudio();

      const source = audioContextRef.current.createBufferSource();
      source.buffer = segment.audioBuffer;
      source.playbackRate.value = playbackSpeed;
      source.connect(audioContextRef.current.destination);
      sourceRef.current = source;

      source.onended = () => {
          const duration = segment.audioBuffer!.duration / playbackSpeed;
          if (!audioContextRef.current) return;
          const elapsed = audioContextRef.current.currentTime - startTimeRef.current;
          if (elapsed >= duration - 0.5) { 
              handleSegmentEnd();
          }
      };

      startTimeRef.current = audioContextRef.current.currentTime - (offset / playbackSpeed);
      source.start(0, offset);
  };

  const handleSegmentEnd = () => {
      const currentIndex = indexRef.current;
      const nextIndex = currentIndex + 1;
      
      setCurrentSegmentIndex(nextIndex);
      setSegmentProgress(0);
      segmentOffsetRef.current = 0;

      if (story.segments[nextIndex]?.audioBuffer) {
          playSegment(story.segments[nextIndex], 0);
      } else {
          if (nextIndex >= story.totalSegmentsEstimate && !isBackgroundGenerating) {
              setIsPlaying(false);
          } else {
              setIsBuffering(true);
          }
      }
  };

  const togglePlayback = async () => {
    if (isPlaying) {
      if (audioContextRef.current && !isBuffering) {
          segmentOffsetRef.current = (audioContextRef.current.currentTime - startTimeRef.current) * playbackSpeed;
      }
      stopAudio();
      setIsPlaying(false);
      setAutoScroll(false);
    } else {
      setIsPlaying(true);
      if (currentSegment?.audioBuffer) {
         setIsBuffering(false);
         playSegment(currentSegment, segmentOffsetRef.current);
         setAutoScroll(true);
      } else {
          setIsBuffering(true);
      }
    }
  };

  const handleDownload = async () => {
    const readySegments = story.segments.filter(s => !!s.audioBuffer);
    if (readySegments.length === 0) return;

    setIsDownloading(true);
    try {
        if (!audioContextRef.current) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            audioContextRef.current = new AudioContextClass();
        }
        
        const buffers = readySegments.map(s => s.audioBuffer!);
        const finalBuffer = concatenateAudioBuffers(buffers, audioContextRef.current);
        const wavBlob = audioBufferToWavBlob(finalBuffer);
        
        const url = URL.createObjectURL(wavBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `EchoPath_Story_${route.storyStyle}_${new Date().toLocaleDateString()}.wav`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (e) {
        console.error("Download failed", e);
    } finally {
        setIsDownloading(false);
    }
  };

  const ModeIcon = route.travelMode === 'DRIVING' ? Car : Footprints;
  const isAllGenerated = story.segments.length >= story.totalSegmentsEstimate && !isBackgroundGenerating;

  return (
    <div className="w-full max-w-5xl mx-auto animate-fade-in pb-24 px-4 md:px-6">
      
      {/* Hero Map */}
      <div className="w-full aspect-video bg-stone-100 rounded-[2rem] shadow-2xl overflow-hidden relative mb-8 border-4 border-white">
           <InlineMap 
              route={route} 
              currentSegmentIndex={currentSegmentIndex}
              totalSegments={story.totalSegmentsEstimate}
           />
           <div className="absolute bottom-4 left-4 right-4 md:bottom-6 md:left-6 md:right-auto bg-white/95 backdrop-blur-md p-4 rounded-[1.5rem] shadow-lg border border-white/50 flex items-center gap-4 md:max-w-md z-10">
                <div className="bg-editorial-900 text-white p-3 rounded-full shrink-0">
                    <ModeIcon size={20} />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="text-xs text-stone-500 font-bold uppercase tracking-wider mb-0.5">Место назначения</div>
                    <div className="text-editorial-900 font-serif text-lg leading-tight truncate">{route.endAddress}</div>
                </div>
            </div>
      </div>

      {/* Settings Popover Area */}
      <div className="relative mb-6">
        <div className={`absolute bottom-full left-0 right-0 mb-4 bg-white/95 backdrop-blur-xl rounded-[2rem] shadow-2xl border border-stone-100 p-8 transition-all duration-300 origin-bottom ${showSettings ? 'scale-100 opacity-100 pointer-events-auto' : 'scale-95 opacity-0 pointer-events-none'}`}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <div className="space-y-4">
                    <div className="flex items-center gap-2 text-stone-400">
                        <Mic2 size={16} />
                        <span className="text-xs font-bold uppercase tracking-widest">Выберите голос ИИ</span>
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                        {VOICES.map((v) => (
                            <button
                                key={v.id}
                                onClick={() => { onVoiceChange(v.id); }}
                                className={`flex items-center justify-between p-3 rounded-xl border-2 transition-all ${
                                    selectedVoice === v.id ? 'border-editorial-900 bg-editorial-100' : 'border-stone-50 hover:border-stone-100'
                                }`}
                            >
                                <div className="text-left">
                                    <div className="text-sm font-bold text-editorial-900">{v.name}</div>
                                    <div className="text-[10px] text-stone-400">{v.desc}</div>
                                </div>
                                {selectedVoice === v.id && <Check size={16} className="text-editorial-900" />}
                            </button>
                        ))}
                    </div>
                </div>
                
                <div className="space-y-4">
                    <div className="flex items-center gap-2 text-stone-400">
                        <Gauge size={16} />
                        <span className="text-xs font-bold uppercase tracking-widest">Скорость речи</span>
                    </div>
                    <div className="flex gap-2">
                        {SPEEDS.map((s) => (
                            <button
                                key={s}
                                onClick={() => onSpeedChange(s)}
                                className={`flex-1 py-3 rounded-xl border-2 font-bold transition-all ${
                                    playbackSpeed === s ? 'bg-editorial-900 border-editorial-900 text-white' : 'border-stone-50 hover:border-stone-100 text-stone-500'
                                }`}
                            >
                                {s}x
                            </button>
                        ))}
                    </div>
                    <p className="text-[10px] text-stone-400 leading-relaxed pt-2">
                        Изменение скорости происходит мгновенно и не влияет на высоту тона голоса. Смена голоса обновит аудио текущей главы.
                    </p>
                </div>
            </div>
        </div>

        {/* Sticky Player Header */}
        <div className="relative">
            <div className="bg-editorial-900 text-white rounded-full p-4 md:p-5 shadow-2xl flex items-center justify-between transition-all ring-4 ring-editorial-100 overflow-hidden">
                {/* Progress Bar Background */}
                <div className="absolute bottom-0 left-0 h-1 bg-white/10 w-full">
                    {/* Progress Bar Fill */}
                    <div 
                        className="h-full bg-white/40 transition-all duration-300 ease-out" 
                        style={{ width: `${segmentProgress}%` }}
                    />
                </div>

                <div className="flex items-center gap-4 pl-4">
                    {isBuffering ? (
                        <div className="flex items-center gap-2 text-amber-300 text-sm font-medium animate-pulse">
                            <Loader2 size={18} className="animate-spin" />
                            <span className="hidden sm:inline">Буферизация...</span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full ${isPlaying ? 'bg-green-400 animate-pulse' : 'bg-stone-500'}`}></div>
                            <span className="text-sm font-medium text-stone-300 hidden md:block">
                                {isPlaying ? 'Прямой эфир' : 'Пауза'}
                            </span>
                        </div>
                    )}
                </div>

                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-2">
                    <span className="font-serif text-lg md:text-xl">
                        Глава {currentSegmentIndex + 1}
                    </span>
                </div>

                <div className="flex items-center gap-2 md:gap-4 pr-1">
                    <button
                        onClick={() => setShowSettings(!showSettings)}
                        className={`p-2 rounded-full transition-all ${showSettings ? 'bg-white/20 text-white' : 'text-stone-500 hover:text-white'}`}
                        title="Настройки голоса"
                    >
                        <Settings size={20} className={showSettings ? 'rotate-90' : ''} />
                    </button>
                    <button 
                        onClick={handleDownload} 
                        disabled={isDownloading || story.segments.length === 0}
                        className={`p-2 rounded-full transition-colors ${isDownloading ? 'text-amber-400 animate-pulse' : 'text-stone-500 hover:text-white'}`}
                        title={isAllGenerated ? "Скачать всю историю" : "Скачать фрагмент"}
                    >
                        {isDownloading ? <Loader2 size={20} className="animate-spin" /> : <Download size={20} />}
                    </button>
                    <button onClick={() => setAutoScroll(!autoScroll)} className={`p-2 rounded-full transition-colors ${autoScroll ? 'text-white bg-white/10' : 'text-stone-500 hover:text-white'}`} title="Автопрокрутка">
                        <ArrowDownCircle size={20} />
                    </button>
                    <button
                        onClick={togglePlayback}
                        className="bg-white text-editorial-900 p-3 md:p-4 rounded-full hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
                    >
                        {isPlaying && !isBuffering ? <Pause size={24} className="fill-current" /> : <Play size={24} className="fill-current ml-1" />}
                    </button>
                </div>
            </div>
        </div>
      </div>

      {/* Continuous Story Stream */}
      <div ref={textContainerRef} className="max-w-3xl mx-auto space-y-16 min-h-[50vh] pb-32">
          {story.segments.map((segment, idx) => {
              const isActive = segment.index === currentSegmentIndex + 1;
              const isPast = segment.index <= currentSegmentIndex;
              
              return (
                <div 
                  key={segment.index}
                  data-active={isActive}
                  className={`relative transition-all duration-1000 ease-in-out pl-8 md:pl-12 border-l-4 ${
                    isActive 
                      ? 'opacity-100 scale-[1.02] border-editorial-900 translate-x-2' 
                      : isPast 
                        ? 'opacity-30 scale-95 border-transparent grayscale-[0.5] -translate-x-1' 
                        : 'opacity-0 translate-y-12 border-transparent'
                  }`}
                >
                    {isActive && (
                      <div className="absolute -left-1 top-0 bottom-0 w-1 bg-editorial-900 animate-pulse hidden md:block" />
                    )}
                    <p className={`prose prose-xl md:prose-2xl max-w-none font-serif leading-relaxed transition-colors duration-700 ${
                      isActive ? 'text-editorial-900' : 'text-stone-500'
                    }`}>
                      {segment.text}
                    </p>
                </div>
              );
          })}

          {(isBuffering || isBackgroundGenerating) && (
              <div className="flex flex-col items-center justify-center gap-3 pt-12 pb-4 opacity-70 animate-pulse">
                  <div className="relative">
                    <Loader2 size={24} className="animate-spin text-editorial-900" />
                  </div>
                  <span className="text-sm font-medium text-stone-500 uppercase tracking-widest">Загрузка следующего фрагмента...</span>
              </div>
          )}
      </div>
    </div>
  );
};

export default StoryPlayer;
