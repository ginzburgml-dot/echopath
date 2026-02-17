
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useEffect, useRef } from 'react';
import { RouteDetails } from '../types';

interface Props {
  route: RouteDetails | null;
  onMapClick?: (lat: number, lng: number) => void;
  isFullView?: boolean;
}

const MapBackground: React.FC<Props> = ({ route, onMapClick, isFullView }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletInstance = useRef<any>(null);
  const routeLayer = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const clickHandlerRef = useRef(onMapClick);

  // Keep the click handler up to date without re-initializing the map
  useEffect(() => {
    clickHandlerRef.current = onMapClick;
  }, [onMapClick]);

  useEffect(() => {
    if (!mapRef.current || leafletInstance.current) return;

    const L = (window as any).L;
    if (!L) return;

    leafletInstance.current = L.map(mapRef.current, {
        center: [55.751244, 37.618423], 
        zoom: 12,
        zoomControl: true, // Enable zoom controls
        attributionControl: false,
        scrollWheelZoom: true,
        doubleClickZoom: true
    });

    // Reposition zoom control to bottom right so it's out of the way
    if (leafletInstance.current.zoomControl) {
        leafletInstance.current.zoomControl.setPosition('bottomright');
    }

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(leafletInstance.current);

    setTimeout(() => {
        if (leafletInstance.current) leafletInstance.current.invalidateSize();
    }, 100);

    leafletInstance.current.on('click', (e: any) => {
        if (clickHandlerRef.current) {
            clickHandlerRef.current(e.latlng.lat, e.latlng.lng);
            
            const curL = (window as any).L;
            const newMarker = curL.circleMarker(e.latlng, {
                radius: 10,
                fillColor: markersRef.current.length === 0 ? "#1A1A1A" : "#888",
                color: "#FFF",
                weight: 3,
                opacity: 1,
                fillOpacity: 1
            }).addTo(leafletInstance.current);
            
            markersRef.current.push(newMarker);
            if (markersRef.current.length > 2) {
                const old = markersRef.current.shift();
                if (old) leafletInstance.current.removeLayer(old);
                if (markersRef.current[0]) markersRef.current[0].setStyle({ fillColor: "#1A1A1A" });
            }
        }
    });

    return () => {
        if (leafletInstance.current) {
            leafletInstance.current.remove();
            leafletInstance.current = null;
        }
    };
  }, []);

  useEffect(() => {
    const L = (window as any).L;
    if (leafletInstance.current && !route) {
        markersRef.current.forEach(m => leafletInstance.current.removeLayer(m));
        markersRef.current = [];
        if (routeLayer.current) {
            leafletInstance.current.removeLayer(routeLayer.current);
            routeLayer.current = null;
        }
    }

    if (route && leafletInstance.current && route.geometry && L) {
        markersRef.current.forEach(m => leafletInstance.current.removeLayer(m));
        markersRef.current = [];

        if (routeLayer.current) leafletInstance.current.removeLayer(routeLayer.current);

        const coords = route.geometry.coordinates.map((c: any) => [c[1], c[0]]);
        
        routeLayer.current = L.polyline(coords, {
            color: '#1A1A1A',
            weight: 4,
            opacity: 0.6
        }).addTo(leafletInstance.current);

        leafletInstance.current.fitBounds(routeLayer.current.getBounds(), { padding: [100, 100] });
    }
  }, [route]);

  useEffect(() => {
      if (mapRef.current) {
          mapRef.current.style.cursor = onMapClick ? 'crosshair' : 'default';
      }
      if (leafletInstance.current) {
          leafletInstance.current.invalidateSize();
      }
  }, [onMapClick, route, isFullView]);

  return (
    <div className={`absolute inset-0 z-0 transition-all duration-1000 ${route ? 'opacity-30' : isFullView ? 'opacity-100' : 'opacity-80'}`}>
      <div ref={mapRef} className="w-full h-full bg-stone-200" />
      <div className="absolute inset-0 bg-gradient-to-b from-editorial-100 via-transparent to-editorial-100 pointer-events-none"></div>
    </div>
  );
};

export default MapBackground;
