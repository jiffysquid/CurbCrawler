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

export function getFocusAreaCoordinates(focusArea: string, currentLocation?: { lat: number; lng: number } | null): { lat: number; lng: number; zoom: number } {
  const focusAreas = {
    'brisbane-city': { lat: -27.4698, lng: 153.0251, zoom: 15 },
    'fortitude-valley': { lat: -27.4568, lng: 153.0371, zoom: 15 },
    'south-brisbane': { lat: -27.4833, lng: 153.0167, zoom: 15 },
    'new-farm': { lat: -27.4644, lng: 153.0406, zoom: 15 },
    'west-end': { lat: -27.4833, lng: 153.0083, zoom: 15 },
    'kangaroo-point': { lat: -27.4789, lng: 153.0406, zoom: 15 },
    'spring-hill': { lat: -27.4625, lng: 153.0221, zoom: 15 },
    'paddington': { lat: -27.4603, lng: 153.0103, zoom: 15 },
    'current-location': currentLocation 
      ? { lat: currentLocation.lat, lng: currentLocation.lng, zoom: 16 }
      : { lat: -27.4698, lng: 153.0251, zoom: 12 }
  };

  return focusAreas[focusArea as keyof typeof focusAreas] || focusAreas['brisbane-city'];
}
