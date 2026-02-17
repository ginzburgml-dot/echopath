
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useEffect, useRef } from 'react';
import { RouteDetails } from '../types';

interface Props {
  route: RouteDetails;
  currentSegmentIndex: number;
  totalSegments: number;
}

const InlineMap: React.FC<Props> = ({ route, currentSegmentIndex, totalSegments }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<any>(null);
  const marker = useRef<any>(null);
  const basePolyline = useRef<any>(null);
  const progressPolyline = useRef<any>(null);

  useEffect(() => {
    if (!mapRef.current || leafletMap.current) return;
    const L = (window as any).L;
    if (!L) return;

    leafletMap.current = L.map(mapRef.current, {
        zoomControl: true,
        attributionControl: false,
        scrollWheelZoom: false // Disable scroll zoom in inline view to prevent accidental jumps
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(leafletMap.current);

    if (route.geometry) {
        const coords = route.geometry.coordinates.map((c: any) => [c[1], c[0]]);
        
        // Base line (faded / upcoming)
        basePolyline.current = L.polyline(coords, {
            color: '#1A1A1A',
            weight: 6,
            opacity: 0.15,
            dashArray: '8, 12'
        }).addTo(leafletMap.current);

        // Progress line (active / completed)
        progressPolyline.current = L.polyline([], {
            color: '#1A1A1A',
            weight: 6,
            opacity: 1,
            lineCap: 'round'
        }).addTo(leafletMap.current);

        // Fit to the entire route once and don't jump after
        leafletMap.current.fitBounds(basePolyline.current.getBounds(), { padding: [40, 40] });

        // Add progress marker - static version without pulse
        marker.current = L.circleMarker(coords[0], {
            radius: 8,
            fillColor: "#1A1A1A",
            color: "#FFF",
            weight: 3,
            opacity: 1,
            fillOpacity: 1
        }).addTo(leafletMap.current);
    }

    // Force map to recognize container size
    setTimeout(() => {
        if (leafletMap.current) leafletMap.current.invalidateSize();
    }, 300);

    return () => {
        if (leafletMap.current) {
            leafletMap.current.remove();
            leafletMap.current = null;
        }
    };
  }, [route]);

  useEffect(() => {
      if (!marker.current || !progressPolyline.current || !route.geometry) return;
      
      const coords = route.geometry.coordinates.map((c: any) => [c[1], c[0]]);
      const progress = Math.min(currentSegmentIndex / Math.max(1, totalSegments), 1);
      const endIndex = Math.floor(progress * (coords.length - 1));
      
      const currentCoords = coords.slice(0, endIndex + 1);
      const currentPos = coords[endIndex];
      
      if (currentCoords.length > 0) {
        progressPolyline.current.setLatLngs(currentCoords);
      }
      
      if (currentPos) {
        // Just update marker position without panning the map (no jumping)
        marker.current.setLatLng(currentPos);
      }
  }, [currentSegmentIndex, totalSegments, route.geometry]);

  return (
    <div ref={mapRef} className="w-full h-full bg-stone-100 min-h-[300px]" />
  );
};

export default InlineMap;
