import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDistance(distance: number): string {
  if (distance < 1) {
    return `${Math.round(distance * 1000)}m`;
  }
  return `${distance.toFixed(1)}km`;
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  if (hours === 0) {
    return `${mins}m`;
  }
  
  return `${hours}h ${mins}m`;
}

export function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === now.toDateString()) {
    return `Today, ${date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit', 
      hour12: true 
    })}`;
  } else if (date.toDateString() === yesterday.toDateString()) {
    return `Yesterday, ${date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit', 
      hour12: true 
    })}`;
  } else {
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }
}

export function calculateDistance(
  lat1: number, 
  lon1: number, 
  lat2: number, 
  lon2: number
): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;
  
  return distance;
}

export function calculateBearing(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const lat1Rad = lat1 * Math.PI / 180;
  const lat2Rad = lat2 * Math.PI / 180;
  
  const y = Math.sin(dLng) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - 
            Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);
  
  const bearing = Math.atan2(y, x) * 180 / Math.PI;
  return (bearing + 360) % 360; // Normalize to 0-360 degrees
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(null, args), wait);
  };
}

export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func.apply(null, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

export function getVehicleFocusCoordinates(vehicleType: string, currentLocation?: { lat: number; lng: number } | null): { lat: number; lng: number; zoom: number } {
  // Focus always centers on current vehicle location with appropriate zoom level
  if (currentLocation) {
    const zoomLevels = {
      'imax-van': 17,
      'small-car': 18,
      'large-car': 17,
      'suv': 17,
      'truck': 16,
      'motorcycle': 18
    };
    
    return {
      lat: currentLocation.lat,
      lng: currentLocation.lng,
      zoom: zoomLevels[vehicleType as keyof typeof zoomLevels] || 17
    };
  }
  
  // Default to Brisbane city center if no location available
  return { lat: -27.4698, lng: 153.0251, zoom: 12 };
}

export function getVehicleIcon(vehicleType: string): string {
  const vehicleIcons = {
    'imax-van': '@assets/imax_1750683369388.png',
    'small-car': '🚗',
    'large-car': '🚙',
    'suv': '🚙',
    'truck': '🚛',
    'motorcycle': '🏍️'
  };
  
  return vehicleIcons[vehicleType as keyof typeof vehicleIcons] || '🚗';
}

// Path color utilities
export const PATH_COLORS = [
  '#10B981', // Green
  '#3B82F6', // Blue  
  '#F59E0B', // Orange
  '#EF4444', // Red
  '#8B5CF6', // Purple
  '#06B6D4', // Cyan
  '#F97316', // Orange-red
  '#84CC16', // Lime
];

export function getPathColor(sessionIndex: number, colorScheme: 'bright' | 'fade' = 'bright', sessionCount: number = 0): { color: string; weight: number; opacity: number } {
  if (colorScheme === 'bright') {
    const color = PATH_COLORS[sessionIndex % PATH_COLORS.length];
    return { color, weight: 8, opacity: 0.75 };  // Double thickness, 75% opacity
  } else {
    // Fade scheme - newer paths are brighter
    const color = PATH_COLORS[sessionIndex % PATH_COLORS.length];
    const age = sessionCount - sessionIndex;
    const opacity = Math.max(0.3, 0.75 - (age * 0.1));  // 75% max opacity
    const weight = Math.max(4, 10 - age);  // Double thickness
    return { color, weight, opacity };
  }
}

// Persistent path storage utilities
export interface PersistentPath {
  id: string;
  name: string;
  coordinates: { lat: number; lng: number }[];
  date: string;
  distance: number;
  duration: number;
  color: string;
}

export function savePersistentPath(path: PersistentPath): void {
  const existingPaths = loadPersistentPaths();
  // Calculate correct distance from coordinates if missing
  if (!path.distance && path.coordinates && path.coordinates.length > 1) {
    let totalDistance = 0;
    for (let i = 1; i < path.coordinates.length; i++) {
      totalDistance += calculateDistance(
        path.coordinates[i-1].lat,
        path.coordinates[i-1].lng,
        path.coordinates[i].lat,
        path.coordinates[i].lng
      );
    }
    path.distance = totalDistance;
  }
  existingPaths.push(path);
  localStorage.setItem('persistentPaths', JSON.stringify(existingPaths));
  
  // Dispatch custom event for same-tab communication
  window.dispatchEvent(new CustomEvent('customStorageEvent', {
    detail: { key: 'persistentPaths', action: 'add', path }
  }));
}

export function loadPersistentPaths(): PersistentPath[] {
  const stored = localStorage.getItem('persistentPaths');
  if (!stored) return [];
  
  try {
    return JSON.parse(stored);
  } catch (error) {
    console.error('Error loading persistent paths:', error);
    return [];
  }
}

export function deletePersistentPath(id: string): void {
  const existingPaths = loadPersistentPaths();
  const filteredPaths = existingPaths.filter(path => path.id !== id);
  localStorage.setItem('persistentPaths', JSON.stringify(filteredPaths));
}

export function clearAllPersistentPaths(): void {
  localStorage.removeItem('persistentPaths');
  
  // Dispatch custom event for same-tab communication
  window.dispatchEvent(new CustomEvent('customStorageEvent', {
    detail: { key: 'persistentPaths', action: 'clear' }
  }));
}
