
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

export type StoryStyle = 'NOIR' | 'CHILDREN' | 'HISTORICAL' | 'FANTASY' | 'CYBERPUNK' | 'ADVENTURE' | 'ZEN';

export interface RouteDetails {
  startAddress: string;
  endAddress: string;
  distance: string;
  duration: string;
  durationSeconds: number;
  travelMode: string; 
  storyStyle: StoryStyle;
  geometry?: any; // To store Leaflet/OSRM coordinates
}

export interface StorySegment {
    index: number; 
    text: string;
    audioBuffer: AudioBuffer | null;
}

export interface AudioStory {
  totalSegmentsEstimate: number;
  outline: string[];
  segments: StorySegment[];
}

export interface HistoryItem {
  id: string;
  route: RouteDetails;
  timestamp: number;
}

export enum AppState {
  PLANNING,
  CALCULATING_ROUTE,
  ROUTE_CONFIRMED,
  GENERATING_INITIAL_SEGMENT,
  READY_TO_PLAY,
  PLAYING
}
