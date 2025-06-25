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
    console.log('GPS timestamp:', new Date(position.timestamp).toISOString());
    console.log('GPS heading:', position.coords.heading, 'speed:', position.coords.speed);
    
    // Check if coordinates are changing (real GPS vs stuck coordinates)
    setState(prev => {
      const isNewLocation = !prev.location || 
        Math.abs(prev.location.lat - position.coords.latitude) > 0.0001 ||
        Math.abs(prev.location.lng - position.coords.longitude) > 0.0001;
      
      if (!isNewLocation) {
        console.warn('GPS coordinates unchanged - possible stuck location or no movement');
      }
      
      return {
        ...prev,
        location: {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        },
        error: null,
        isLoading: false,
      };
    });
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

  const startWatching = useCallback(async () => {
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
    const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    
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

    // Production mode: Check permissions and start GPS tracking
    console.log("Production mode: Checking location permissions for mobile device");
    
    try {
      // Check if we can request permissions (modern browsers)
      if ('permissions' in navigator) {
        const permission = await navigator.permissions.query({ name: 'geolocation' });
        console.log('Location permission status:', permission.state);
        
        if (permission.state === 'denied') {
          setState(prev => ({
            ...prev,
            error: 'Location access denied. Please enable location in your browser settings.',
            isLoading: false,
          }));
          return;
        }
      }

      // Try to get current position first to verify GPS works
      navigator.geolocation.getCurrentPosition(
        (position) => {
          console.log('Initial GPS position obtained:', position.coords.latitude, position.coords.longitude);
          updateLocation(position);
          
          // Now start continuous watching
          const id = navigator.geolocation.watchPosition(
            updateLocation,
            updateError,
            {
              enableHighAccuracy: true,
              timeout: 20000, // Even longer timeout for mobile
              maximumAge: 1000, // Very fresh location data
            }
          );
          
          watchIdRef.current = id;
          console.log('GPS watch started with ID:', id);
        },
        (error) => {
          console.error('Initial GPS position failed:', error);
          updateError(error);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0, // Force fresh location
        }
      );
      
    } catch (error) {
      console.error('Permission check failed:', error);
      // Fallback to direct geolocation
      const id = navigator.geolocation.watchPosition(
        updateLocation,
        updateError,
        {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 1000,
        }
      );
      
      watchIdRef.current = id;
      console.log('GPS watch started (fallback) with ID:', id);
    }
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