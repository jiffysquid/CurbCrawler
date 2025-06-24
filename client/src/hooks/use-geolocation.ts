import { useState, useRef, useCallback, useEffect } from 'react';

interface GeolocationState {
  location: { lat: number; lng: number; accuracy?: number } | null;
  error: string | null;
  isLoading: boolean;
  isWatching: boolean;
}

export function useGeolocation() {
  const [state, setState] = useState<GeolocationState>({
    location: null,
    error: null,
    isLoading: false,
    isWatching: false,
  });

  const watchIdRef = useRef<number | null>(null);

  const updateLocation = useCallback((position: GeolocationPosition) => {
    console.log('GPS update:', position.coords.latitude, position.coords.longitude, 'accuracy:', position.coords.accuracy + 'm');
    setState(prev => ({
      ...prev,
      location: {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
      },
      error: null,
      isLoading: false,
    }));
  }, []);

  const updateError = useCallback((error: GeolocationPositionError) => {
    console.error('GPS error:', error.message);
    let errorMessage = 'Unable to retrieve location';
    
    switch (error.code) {
      case error.PERMISSION_DENIED:
        errorMessage = 'Location access denied. Please allow location permissions in your browser settings.';
        break;
      case error.POSITION_UNAVAILABLE:
        errorMessage = 'Location information is unavailable. Please check your GPS or network connection.';
        break;
      case error.TIMEOUT:
        errorMessage = 'Location request timed out. Please try again.';
        break;
    }

    setState(prev => ({
      ...prev,
      error: errorMessage,
      isLoading: false,
    }));
  }, []);

  const startWatching = useCallback(() => {
    if (!navigator.geolocation) {
      setState(prev => ({
        ...prev,
        error: 'Geolocation is not supported by this browser.',
        isLoading: false,
      }));
      return;
    }

    // Stop any existing watch
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }

    setState(prev => ({ ...prev, isLoading: true, error: null, isWatching: true }));

    // Only use test coordinates for localhost development  
    const isDevelopment = window.location.hostname === 'localhost';
    
    if (isDevelopment) {
      console.log("Development mode: Using static St Lucia coordinates");
      updateLocation({
        coords: {
          latitude: -27.4969,
          longitude: 153.0142,
          accuracy: 10
        } as GeolocationCoordinates,
        timestamp: Date.now()
      } as GeolocationPosition);
      return;
    }

    // Production mode: Start continuous GPS tracking
    console.log("Production mode: Starting continuous GPS tracking with watchPosition");
    const id = navigator.geolocation.watchPosition(
      updateLocation,
      updateError,
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000, // Accept cached location up to 5 seconds old
      }
    );

    watchIdRef.current = id;
    console.log('GPS watch started with ID:', id);
  }, [updateLocation, updateError]);

  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null) {
      console.log('Stopping GPS watch with ID:', watchIdRef.current);
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setState(prev => ({ ...prev, isWatching: false }));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  return {
    ...state,
    startWatching,
    stopWatching,
  };
}