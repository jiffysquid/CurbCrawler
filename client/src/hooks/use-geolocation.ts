import { useState, useRef, useCallback, useEffect } from 'react';

interface GeolocationState {
  location: { lat: number; lng: number; accuracy?: number } | null;
  error: string | null;
  isLoading: boolean;
  isWatching: boolean;
}

interface SpeedBasedSettings {
  maxAge: number;
  timeout: number;
}

export function useGeolocation() {
  const [state, setState] = useState<GeolocationState>({
    location: null,
    error: null,
    isLoading: false,
    isWatching: false,
  });

  const watchIdRef = useRef<number | null>(null);
  const lastSpeedRef = useRef<number | null>(null);
  const currentWatchOptionsRef = useRef<PositionOptions | null>(null);

  // Calculate GPS settings based on speed (Smart Rate)
  const getSpeedBasedSettings = useCallback((speedMps: number | null): SpeedBasedSettings => {
    if (speedMps === null) {
      // Default to medium settings when speed is unknown
      return { maxAge: 1000, timeout: 15000 };
    }

    // Convert m/s to km/h
    const speedKmh = speedMps * 3.6;
    
    if (speedKmh > 80) {
      // High speed (>80 km/h): Low refresh rate to save battery
      return { maxAge: 2500, timeout: 30000 };
    } else if (speedKmh > 50) {
      // Medium speed (50-80 km/h): Medium refresh rate
      return { maxAge: 1000, timeout: 15000 };
    } else {
      // Low speed (<50 km/h): High refresh rate for detailed tracking
      return { maxAge: 500, timeout: 10000 };
    }
  }, []);

  const updateLocation = useCallback((position: GeolocationPosition) => {
    try {
      console.log('GPS update:', position.coords.latitude, position.coords.longitude, 'accuracy:', position.coords.accuracy + 'm');
      console.log('GPS timestamp:', new Date(position.timestamp).toISOString());
      console.log('GPS heading:', position.coords.heading, 'speed:', position.coords.speed);
      
      // Check if we should adjust GPS settings based on speed (Smart Rate only)
      const gpsAccuracy = localStorage.getItem('gpsAccuracy') || 'smart';
      if (gpsAccuracy === 'smart' && position.coords.speed !== null) {
        const lastSpeed = lastSpeedRef.current;
        const newSpeed = position.coords.speed;
        
        // Only trigger restart if speed changed significantly (>18 km/h change)
        if (lastSpeed === null || Math.abs(newSpeed - lastSpeed) > 5) {
          const speedKmh = newSpeed * 3.6;
          const newSettings = getSpeedBasedSettings(newSpeed);
          const currentSettings = currentWatchOptionsRef.current;
          
          // Only restart if settings actually changed
          if (!currentSettings || currentSettings.maximumAge !== newSettings.maxAge) {
            console.log(`Smart Rate: Speed ${speedKmh.toFixed(1)} km/h, adjusting GPS rate to ${newSettings.maxAge}ms`);
            lastSpeedRef.current = newSpeed;
            
            // Schedule GPS restart to avoid circular dependency
            setTimeout(() => {
              if (watchIdRef.current !== null) {
                console.log('Smart Rate: Restarting GPS with new settings');
                stopWatching();
                setTimeout(() => startWatching(), 100);
              }
            }, 0);
          }
        }
      }
      
      // Validate coordinates
      if (isNaN(position.coords.latitude) || isNaN(position.coords.longitude)) {
        console.error('Invalid GPS coordinates received');
        return;
      }
      
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
    } catch (error) {
      console.error('Error processing GPS location:', error);
      setState(prev => ({
        ...prev,
        error: 'Error processing GPS location',
        isLoading: false,
      }));
    }
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
    try {
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
        watchIdRef.current = null;
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
            
            // Now start continuous watching with robust error handling
            const id = navigator.geolocation.watchPosition(
              (position) => {
                try {
                  updateLocation(position);
                } catch (error) {
                  console.error('Error in GPS watch position callback:', error);
                }
              },
              (error) => {
                console.error('GPS watch error:', error);
                updateError(error);
                
                // Auto-retry GPS watch on error
                setTimeout(() => {
                  console.log('Auto-retrying GPS watch after error...');
                  if (watchIdRef.current === null) {
                    // Only retry if we don't have an active watch
                    startWatching();
                  }
                }, 5000);
              },
              (() => {
                const gpsAccuracy = localStorage.getItem('gpsAccuracy') || 'smart';
                let maxAge = 2000;
                let timeout = 30000;
                
                switch (gpsAccuracy) {
                  case 'high':
                    maxAge = 500; // 0.5s updates
                    timeout = 15000;
                    break;
                  case 'medium':
                    maxAge = 1000; // 1s updates
                    timeout = 30000;
                    break;
                  case 'low':
                    maxAge = 2500; // 2.5s updates
                    timeout = 45000;
                    break;
                  case 'smart':
                    // Smart rate starts with medium settings, adjusts based on speed
                    maxAge = 1000; // Default to 1s updates
                    timeout = 15000;
                    break;
                }
                
                const options = {
                  enableHighAccuracy: true,
                  timeout,
                  maximumAge: maxAge,
                };
                
                // Store current options for smart rate comparison
                currentWatchOptionsRef.current = options;
                
                return options;
              })()
            );
            
            watchIdRef.current = id;
            console.log('GPS watch started with ID:', id);
          },
          (error) => {
            console.error('Initial GPS position failed:', error);
            updateError(error);
          },
          (() => {
            const gpsAccuracy = localStorage.getItem('gpsAccuracy') || 'smart';
            
            switch (gpsAccuracy) {
              case 'high':
                return {
                  enableHighAccuracy: true,
                  timeout: 15000,
                  maximumAge: 0,
                };
              case 'medium':
                return {
                  enableHighAccuracy: true,
                  timeout: 20000,
                  maximumAge: 1000,
                };
              case 'low':
                return {
                  enableHighAccuracy: false,
                  timeout: 30000,
                  maximumAge: 5000,
                };
              case 'smart':
                return {
                  enableHighAccuracy: true,
                  timeout: 15000,
                  maximumAge: 1000, // Start with medium settings
                };
              default:
                return {
                  enableHighAccuracy: true,
                  timeout: 20000,
                  maximumAge: 1000,
                };
            }
          })()
        );
        
      } catch (error) {
        console.error('Permission check failed:', error);
        // Fallback to direct geolocation
        const id = navigator.geolocation.watchPosition(
          (position) => {
            try {
              updateLocation(position);
            } catch (error) {
              console.error('Error in fallback GPS callback:', error);
            }
          },
          (error) => {
            console.error('Fallback GPS error:', error);
            updateError(error);
          },
          (() => {
            const gpsAccuracy = localStorage.getItem('gpsAccuracy') || 'smart';
            let maxAge = 2000;
            let timeout = 30000;
            let highAccuracy = true;
            
            switch (gpsAccuracy) {
              case 'high':
                maxAge = 500;
                timeout = 15000;
                highAccuracy = true;
                break;
              case 'medium':
                maxAge = 1000;
                timeout = 30000;
                highAccuracy = true;
                break;
              case 'low':
                maxAge = 2500;
                timeout = 45000;
                highAccuracy = false;
                break;
              case 'smart':
                maxAge = 1000; // Start with medium settings
                timeout = 15000;
                highAccuracy = true;
                break;
            }
            
            return {
              enableHighAccuracy: highAccuracy,
              timeout,
              maximumAge: maxAge,
            };
          })()
        );
        
        watchIdRef.current = id;
        console.log('GPS watch started (fallback) with ID:', id);
      }
    } catch (error) {
      console.error('Critical error in startWatching:', error);
      setState(prev => ({
        ...prev,
        error: 'Critical GPS error occurred',
        isLoading: false,
        isWatching: false,
      }));
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

  // Listen for GPS accuracy changes and restart GPS with new settings
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'gpsAccuracy' && state.isWatching) {
        console.log('GPS accuracy setting changed, restarting GPS with new settings:', e.newValue);
        stopWatching();
        setTimeout(() => startWatching(), 1000); // Restart after 1 second
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [state.isWatching, startWatching, stopWatching]);

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