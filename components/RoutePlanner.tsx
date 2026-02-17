
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useRef, useEffect } from 'react';
import { MapPin, Navigation, Loader2, Footprints, Car, CloudRain, Sparkles, ScrollText, Sword, MousePointer2, Minimize2, Maximize2, History, ArrowRight, Cpu, Compass, Wind, ChevronUp, ChevronDown, LocateFixed } from 'lucide-react';
import { RouteDetails, AppState, StoryStyle, HistoryItem } from '../types';

interface Props {
  onRouteUpdate: (details: RouteDetails | null) => void;
  onConfirmRoute: () => void;
  appState: AppState;
  externalError?: string | null;
  mapPickedPoint?: {lat: number, lng: number, id: number} | null;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  history?: HistoryItem[];
}

type TravelMode = 'WALKING' | 'DRIVING';

const STYLES: { id: StoryStyle; label: string; icon: React.ElementType; desc: string }[] = [
    { id: 'NOIR', label: 'Нуарный Триллер', icon: CloudRain, desc: 'Мрачные, загадочные улицы.' },
    { id: 'CHILDREN', label: 'Детская Сказка', icon: Sparkles, desc: 'Волшебство и мягкий юмор.' },
    { id: 'HISTORICAL', label: 'Исторический Эпос', icon: ScrollText, desc: 'Голоса прошлого и паломничество.' },
    { id: 'FANTASY', label: 'Фэнтези', icon: Sword, desc: 'Магический поход.' },
    { id: 'CYBERPUNK', label: 'Киберпанк', icon: Cpu, desc: 'Неон, хром и цифровой разум.' },
    { id: 'ADVENTURE', label: 'Приключение', icon: Compass, desc: 'В поисках затерянных тайн.' },
    { id: 'ZEN', label: 'Дзен', icon: Wind, desc: 'Мир, покой и созерцание.' },
];

const WALKING_SLOWDOWN_FACTOR = 2.2;

const RoutePlanner: React.FC<Props> = ({ onRouteUpdate, onConfirmRoute, appState, externalError, mapPickedPoint, isCollapsed, onToggleCollapse, history = [] }) => {
  const [startQuery, setStartQuery] = useState('');
  const [endQuery, setEndQuery] = useState('');
  const [startSuggestions, setStartSuggestions] = useState<any[]>([]);
  const [endSuggestions, setEndSuggestions] = useState<any[]>([]);
  const [selectedStart, setSelectedStart] = useState<any>(null);
  const [selectedEnd, setSelectedEnd] = useState<any>(null);
  
  const [travelMode, setTravelMode] = useState<TravelMode>('WALKING');
  const [selectedStyle, setSelectedStyle] = useState<StoryStyle>('NOIR');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLocating, setIsLocating] = useState<'start' | 'end' | null>(null);

  const styleListRef = useRef<HTMLDivElement>(null);
  const selectedStartRef = useRef(selectedStart);
  const selectedEndRef = useRef(selectedEnd);

  useEffect(() => {
    selectedStartRef.current = selectedStart;
    selectedEndRef.current = selectedEnd;
  }, [selectedStart, selectedEnd]);

  const formatAddress = (p: any) => {
      const props = p.properties;
      const parts = [];
      if (props.name) parts.push(props.name);
      if (props.street && props.name !== props.street) parts.push(props.street);
      if (props.city && !parts.includes(props.city)) parts.push(props.city);
      return parts.length > 0 ? parts.join(', ') : "Точка на карте";
  };

  const fetchSuggestions = async (q: string, setFn: (s: any[]) => void) => {
    if (q.length < 3) {
        setFn([]);
        return;
    }
    try {
        const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=5&lang=ru`);
        const data = await res.json();
        setFn(data.features || []);
    } catch (e) {
        console.error("Search failed", e);
    }
  };

  const handleUseCurrentLocation = (target: 'start' | 'end') => {
    if (!navigator.geolocation) {
        setError("Геолокация не поддерживается вашим браузером.");
        return;
    }

    setIsLocating(target);
    setError(null);

    navigator.geolocation.getCurrentPosition(
        async (position) => {
            const { latitude, longitude } = position.coords;
            try {
                const res = await fetch(`https://photon.komoot.io/reverse/?lon=${longitude}&lat=${latitude}&lang=ru`);
                const data = await res.json();
                const feature = data.features?.[0] || {
                    properties: { name: `Ваше местоположение` },
                    geometry: { coordinates: [longitude, latitude] }
                };
                const addr = formatAddress(feature);

                if (target === 'start') {
                    setSelectedStart(feature);
                    setStartQuery(addr);
                    setStartSuggestions([]);
                } else {
                    setSelectedEnd(feature);
                    setEndQuery(addr);
                    setEndSuggestions([]);
                }
            } catch (e) {
                console.error("Reverse geocoding failed", e);
                setError("Не удалось определить адрес.");
            } finally {
                setIsLocating(null);
            }
        },
        (err) => {
            console.error("Geolocation error", err);
            setError("Доступ к геолокации отклонен.");
            setIsLocating(null);
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  };

  useEffect(() => {
    if (mapPickedPoint && appState === AppState.PLANNING) {
        const handleReverse = async () => {
            try {
                const res = await fetch(`https://photon.komoot.io/reverse/?lon=${mapPickedPoint.lng}&lat=${mapPickedPoint.lat}&lang=ru`);
                const data = await res.json();
                const feature = data.features?.[0] || {
                    properties: { name: `Точка (${mapPickedPoint.lat.toFixed(4)}, ${mapPickedPoint.lng.toFixed(4)})` },
                    geometry: { coordinates: [mapPickedPoint.lng, mapPickedPoint.lat] }
                };
                const addr = formatAddress(feature);

                if (!selectedStartRef.current) {
                    setSelectedStart(feature);
                    setStartQuery(addr);
                } else if (!selectedEndRef.current) {
                    setSelectedEnd(feature);
                    setEndQuery(addr);
                } else {
                    setSelectedStart(feature);
                    setStartQuery(addr);
                    setSelectedEnd(null);
                    setEndQuery('');
                    onRouteUpdate(null);
                }
            } catch (e) {
                console.error("Reverse failed", e);
            }
        };
        handleReverse();
    }
  }, [mapPickedPoint, appState]);

  useEffect(() => {
    if (selectedStart && selectedEnd && appState === AppState.PLANNING) {
        calculateRoute();
    }
  }, [selectedStart, selectedEnd, travelMode, selectedStyle]);

  useEffect(() => {
    const timer = setTimeout(() => fetchSuggestions(startQuery, setStartSuggestions), 500);
    return () => clearTimeout(timer);
  }, [startQuery]);

  useEffect(() => {
    const timer = setTimeout(() => fetchSuggestions(endQuery, setEndSuggestions), 500);
    return () => clearTimeout(timer);
  }, [endQuery]);

  const calculateRoute = async () => {
    setIsLoading(true);
    setError(null);
    const startCoord = selectedStart.geometry.coordinates;
    const endCoord = selectedEnd.geometry.coordinates;
    try {
        const profile = travelMode === 'WALKING' ? 'foot' : 'car';
        const res = await fetch(`https://router.project-osrm.org/route/v1/${profile}/${startCoord[0]},${startCoord[1]};${endCoord[0]},${endCoord[1]}?overview=full&geometries=geojson`);
        const data = await res.json();
        if (data.code !== 'Ok') throw new Error("Route not found");
        const route = data.routes[0];
        let durationSec = route.duration;
        if (travelMode === 'WALKING') durationSec *= WALKING_SLOWDOWN_FACTOR;
        if (durationSec > 14400) {
            setError("Путь слишком длинный.");
            setIsLoading(false);
            onRouteUpdate(null);
            return;
        }
        onRouteUpdate({
            startAddress: startQuery || "Выбранная точка",
            endAddress: endQuery || "Выбранная точка",
            distance: (route.distance / 1000).toFixed(1) + " км",
            duration: Math.round(durationSec / 60) + " мин",
            durationSeconds: durationSec,
            travelMode: travelMode,
            storyStyle: selectedStyle,
            geometry: route.geometry 
        });
    } catch (e) {
        setError("Не удалось построить маршрут.");
        onRouteUpdate(null);
    } finally {
        setIsLoading(false);
    }
  };

  const handleStyleScroll = (e: React.UIEvent<HTMLDivElement>) => {
      const container = e.currentTarget;
      const index = Math.round(container.scrollTop / 84); // 84 is the height of style item
      if (STYLES[index] && STYLES[index].id !== selectedStyle) {
          setSelectedStyle(STYLES[index].id);
      }
  };

  const isLocked = appState > AppState.ROUTE_CONFIRMED;

  // Render minimized toggle if collapsed and planning
  if (isCollapsed && appState === AppState.PLANNING) {
      return (
          <div className="absolute bottom-6 left-6 pointer-events-auto z-50">
              <button 
                onClick={onToggleCollapse}
                className="bg-editorial-900 text-white p-4 rounded-full shadow-2xl hover:scale-105 transition-all ring-4 ring-white/20"
              >
                  <Maximize2 size={24} />
              </button>
          </div>
      );
  }

  return (
    <div className={`absolute bottom-6 left-1/2 -translate-x-1/2 sm:left-6 sm:top-6 sm:bottom-6 sm:translate-x-0 w-[92vw] sm:w-80 z-50 pointer-events-auto transition-all duration-500 ease-in-out ${isLocked ? 'opacity-0 pointer-events-none translate-y-full sm:-translate-x-full sm:translate-y-0' : 'opacity-100 translate-y-0'}`}>
      <div className="w-full h-full max-h-[85vh] sm:max-h-none bg-white/90 backdrop-blur-2xl rounded-[2rem] shadow-2xl border border-white/50 p-5 sm:p-6 flex flex-col overflow-hidden">
        
        <div className="mb-4 sm:mb-6 flex justify-between items-start">
            <div>
                <h2 className="text-xl sm:text-2xl font-serif text-editorial-900 leading-tight">ЭхоПути</h2>
                <p className="text-[9px] sm:text-[10px] text-stone-400 uppercase tracking-widest mt-1">Иммерсивный навигатор</p>
            </div>
            <button 
                onClick={onToggleCollapse}
                className="sm:hidden text-stone-400 p-2"
            >
                <Minimize2 size={20} />
            </button>
        </div>

        <div className="space-y-2 sm:space-y-3 mb-4 sm:mb-6">
          <div className="relative group">
            <MapPin className="absolute left-3 top-3 text-stone-400" size={14} />
            <input
                value={startQuery}
                onChange={(e) => { setStartQuery(e.target.value); if(selectedStart) setSelectedStart(null); }}
                placeholder="Откуда..."
                className="w-full h-10 bg-stone-100/50 border-none rounded-xl pl-10 pr-10 text-xs sm:text-sm outline-none transition-all focus:bg-white focus:ring-2 ring-editorial-900/10"
            />
            <button 
                onClick={() => handleUseCurrentLocation('start')}
                className={`absolute right-3 top-2.5 p-0.5 rounded-md transition-all ${isLocating === 'start' ? 'text-editorial-900 animate-pulse' : 'text-stone-300 hover:text-editorial-900'}`}
                title="Использовать моё местоположение"
            >
                {isLocating === 'start' ? <Loader2 size={16} className="animate-spin" /> : <LocateFixed size={16} />}
            </button>
            {startSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-xl z-[60] overflow-hidden border border-stone-100">
                    {startSuggestions.map((p, i) => (
                        <button key={i} onClick={() => { setSelectedStart(p); setStartQuery(formatAddress(p)); setStartSuggestions([]); }} className="w-full text-left px-4 py-2 hover:bg-stone-50 text-[10px] sm:text-xs border-b border-stone-50 last:border-0">{formatAddress(p)}</button>
                    ))}
                </div>
            )}
          </div>

          <div className="relative group">
            <Navigation className="absolute left-3 top-3 text-stone-400" size={14} />
            <input
                value={endQuery}
                onChange={(e) => { setEndQuery(e.target.value); if(selectedEnd) setSelectedEnd(null); }}
                placeholder="Куда..."
                className="w-full h-10 bg-stone-100/50 border-none rounded-xl pl-10 pr-10 text-xs sm:text-sm outline-none transition-all focus:bg-white focus:ring-2 ring-editorial-900/10"
            />
            <button 
                onClick={() => handleUseCurrentLocation('end')}
                className={`absolute right-3 top-2.5 p-0.5 rounded-md transition-all ${isLocating === 'end' ? 'text-editorial-900 animate-pulse' : 'text-stone-300 hover:text-editorial-900'}`}
                title="Использовать моё местоположение"
            >
                {isLocating === 'end' ? <Loader2 size={16} className="animate-spin" /> : <LocateFixed size={16} />}
            </button>
            {endSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-xl z-[60] overflow-hidden border border-stone-100">
                    {endSuggestions.map((p, i) => (
                        <button key={i} onClick={() => { setSelectedEnd(p); setEndQuery(formatAddress(p)); setEndSuggestions([]); }} className="w-full text-left px-4 py-2 hover:bg-stone-50 text-[10px] sm:text-xs border-b border-stone-50 last:border-0">{formatAddress(p)}</button>
                    ))}
                </div>
            )}
          </div>
        </div>

        <div className="flex gap-2 mb-4 sm:mb-6">
            {(['WALKING', 'DRIVING'] as TravelMode[]).map((mode) => (
                <button
                    key={mode}
                    onClick={() => setTravelMode(mode)}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 sm:py-2.5 rounded-xl text-[10px] sm:text-xs font-bold transition-all ${
                        travelMode === mode ? 'bg-editorial-900 text-white' : 'bg-stone-100 text-stone-400 hover:bg-stone-200'
                    }`}
                >
                    {mode === 'WALKING' ? <Footprints size={12} /> : <Car size={12} />}
                    {mode === 'WALKING' ? 'Пешком' : 'Машина'}
                </button>
            ))}
        </div>

        <div className="flex-1 flex flex-col min-h-0 mb-4 sm:mb-6 overflow-hidden">
            <label className="text-[9px] sm:text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2 sm:mb-3 flex items-center justify-between">
                Жанр истории
                <div className="flex gap-1">
                    <ChevronUp size={10} />
                    <ChevronDown size={10} />
                </div>
            </label>
            <div 
                ref={styleListRef}
                onScroll={handleStyleScroll}
                className="flex-1 overflow-y-auto snap-y snap-mandatory no-scrollbar relative rounded-2xl bg-stone-100/50 touch-pan-y"
            >
                {STYLES.map((style) => (
                    <div 
                        key={style.id}
                        className={`h-[84px] snap-center flex items-center gap-3 sm:gap-4 px-3 sm:px-4 transition-all duration-300 ${
                            selectedStyle === style.id ? 'opacity-100 scale-100' : 'opacity-30 scale-95'
                        }`}
                    >
                        <div className={`p-2.5 sm:p-3 rounded-2xl shrink-0 ${selectedStyle === style.id ? 'bg-editorial-900 text-white shadow-lg' : 'bg-white text-stone-400'}`}>
                            <style.icon size={18} />
                        </div>
                        <div className="min-w-0">
                            <div className="font-bold text-xs sm:text-sm text-editorial-900">{style.label}</div>
                            <div className="text-[9px] sm:text-[10px] text-stone-500 line-clamp-2 mt-0.5">{style.desc}</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>

        {error && <p className="text-red-500 text-[9px] sm:text-[10px] font-bold mb-3 animate-pulse text-center">{error}</p>}

        <div className="space-y-2 sm:space-y-3 shrink-0">
            <button
              onClick={onConfirmRoute}
              disabled={isLoading || !selectedStart || !selectedEnd || !!error}
              className="w-full bg-editorial-900 text-white py-3.5 sm:py-4 rounded-2xl font-bold text-xs sm:text-sm hover:bg-stone-800 transition-all flex items-center justify-center gap-2 disabled:opacity-30"
            >
              {isLoading ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={14} />}
              Начать путешествие
            </button>
            
            <button 
                onClick={onToggleCollapse}
                className="hidden sm:block w-full py-2 text-stone-400 hover:text-editorial-900 transition-colors text-[9px] sm:text-[10px] font-bold uppercase tracking-widest"
            >
                Скрыть панель
            </button>
        </div>
      </div>
    </div>
  );
};

export default RoutePlanner;
