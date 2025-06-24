import { useState, useRef, useCallback } from 'react';

interface GeolocationState {
  location: { lat: number; lng: number; accuracy?: number } | null;
  error: string | null;
  isLoading: boolean;
}

export function useGeolocation() {
  const [state, setState] = useState<GeolocationState>({
    location: null,
    error: null,
    isLoading: false,
  });

  const watchIdRef = useRef<number | null>(null);

  const updateLocation = useCallback((position: GeolocationPosition) => {
    setState({
      location: {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
      },
      error: null,
      isLoading: false,
    });
  }, []);

  const updateError = useCallback((error: GeolocationPositionError) => {
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

    setState({
      location: null,
      error: errorMessage,
      isLoading: false,
    });
  }, []);

  const getCurrentPosition = useCallback(() => {
    if (!navigator.geolocation) {
      setState({
        location: null,
        error: 'Geolocation is not supported by this browser.',
        isLoading: false,
      });
      return;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    // Only use test coordinates for localhost development
    const isDevelopment = window.location.hostname === 'localhost';
    
    if (isDevelopment) {
      console.log("Development mode: Using St Lucia coordinates for testing");
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

    // Production mode: Use real GPS
    console.log("Production mode: Using real GPS coordinates");
    navigator.geolocation.getCurrentPosition(
      updateLocation,
      updateError,
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 300000, // 5 minutes
      }
    );
  }, [updateLocation, updateError]);

  const startWatching = useCallback(() => {
    if (!navigator.geolocation) {
      setState({
        location: null,
        error: 'Geolocation is not supported by this browser.',
        isLoading: false,
      });
      return;
    }

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

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

    // Production mode: Start real GPS watching
    console.log("Production mode: Starting real GPS tracking");
    const id = navigator.geolocation.watchPosition(
      updateLocation,
      updateError,
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 300000, // 5 minutes
      }
    );

    watchIdRef.current = id;
  }, [updateLocation, updateError]);

  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  return {
    ...state,
    getCurrentPosition,
    startWatching,
    stopWatching,
    isWatching: watchIdRef.current !== null,
  };
}