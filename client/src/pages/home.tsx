import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import MapboxMap from "@/components/mapbox-map";
import SimpleControls from "@/components/simple-controls";
import SessionTotals from "@/components/session-totals";
import Settings from "@/components/settings";
import GPSDebug from "@/components/gps-debug";
import { useToast } from "@/hooks/use-toast";
import { useGeolocation } from "@/hooks/use-geolocation";
import { useWakeLock } from "@/hooks/use-wake-lock";
import { calculateDistance, savePersistentPath, loadPersistentPaths, PATH_COLORS, PersistentPath } from "@/lib/utils";
import { Menu, X, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SessionWithStats, LocationPoint } from "@shared/schema";
import PathManagement from "@/components/path-management";

type TabType = 'sessions' | 'settings';

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabType>('sessions');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [location, setLocation] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [currentSuburb, setCurrentSuburb] = useState<string>('Unknown');
  const [recordingStartTime, setRecordingStartTime] = useState<Date | null>(null);
  const [recordingStats, setRecordingStats] = useState<{ duration: string; distance: string; cost: string }>({ duration: '0m', distance: '0.0km', cost: '0.00' });
  const [realTimeDistance, setRealTimeDistance] = useState<number>(0);
  const [lastRecordingLocation, setLastRecordingLocation] = useState<{ lat: number; lng: number; timestamp?: number } | null>(null);
  const [recordingPath, setRecordingPath] = useState<{ lat: number; lng: number }[]>([]);
  const [persistentPaths, setPersistentPaths] = useState<any[]>([]);
  const [showSuburbBoundaries, setShowSuburbBoundaries] = useState<boolean>(true);
  const [showToilets, setShowToilets] = useState<boolean>(false);
  
  const { toast } = useToast();
  
  // Use the geolocation hook for continuous GPS tracking
  const { location: gpsLocation, error: gpsError, isLoading: gpsLoading, isWatching, startWatching, stopWatching } = useGeolocation();
  
  // Use wake lock to keep screen on during recording
  const { requestWakeLock, releaseWakeLock } = useWakeLock();

  // Fetch sessions
  const { data: sessions = [] } = useQuery<SessionWithStats[]>({
    queryKey: ['/api/sessions'],
  });

  // Initialize GPS tracking on page load
  useEffect(() => {
    if (navigator.geolocation) {
      // Check if we're in development mode (only localhost)
      const isDevelopment = window.location.hostname === 'localhost';
      
      if (isDevelopment) {
        console.log("Development mode: Using St Lucia coordinates for testing");
        setLocation({
          lat: -27.4969,
          lng: 153.0142,
          accuracy: 10,
        });
        return;
      }

      // Production mode: Start continuous GPS tracking immediately
      console.log("Production mode: Starting continuous GPS tracking");
      console.log("Production mode: Checking location permissions for mobile device");
      startWatching();
      
      // Load persistent paths from localStorage
      const paths = loadPersistentPaths();
      setPersistentPaths(paths);
      console.log('🗺️ Loaded persistent paths:', paths.length);
      
      // Listen for storage events to update persistent paths when cleared
      const handleStorageEvent = (e: StorageEvent) => {
        if (e.key === 'persistentPaths') {
          console.log('📍 Home: Persistent paths storage changed, reloading...');
          const updatedPaths = loadPersistentPaths();
          setPersistentPaths(updatedPaths);
          console.log('✅ Updated persistent paths:', updatedPaths.length, 'paths');
        }
      };
      
      const handleCustomStorageEvent = (e: Event) => {
        const customEvent = e as CustomEvent;
        if (customEvent.detail?.key === 'persistentPaths') {
          console.log('📍 Home: Custom storage event for persistent paths, reloading...');
          const updatedPaths = loadPersistentPaths();
          setPersistentPaths(updatedPaths);
          console.log('✅ Updated persistent paths:', updatedPaths.length, 'paths');
        }
      };
      
      window.addEventListener('storage', handleStorageEvent);
      window.addEventListener('customStorageEvent', handleCustomStorageEvent);
      
      return () => {
        window.removeEventListener('storage', handleStorageEvent);
        window.removeEventListener('customStorageEvent', handleCustomStorageEvent);
      };
      
      // Load settings from localStorage
      const savedShowSuburbs = localStorage.getItem('showSuburbBoundaries');
      const savedShowToilets = localStorage.getItem('showToilets');
      
      if (savedShowSuburbs !== null) {
        setShowSuburbBoundaries(savedShowSuburbs === 'true');
      }
      if (savedShowToilets !== null) {
        setShowToilets(savedShowToilets === 'true');
      }
    } else {
      toast({
        title: "Geolocation Not Supported",
        description: "Your device doesn't support location services.",
        variant: "destructive",
      });
    }
  }, [toast, startWatching]);

  // Update location state when GPS location changes - optimized for smooth interpolation
  useEffect(() => {
    if (gpsLocation) {
      setLocation(gpsLocation);
      console.log('Location updated from GPS:', gpsLocation.lat, gpsLocation.lng);
      
      // Update recording path with actual GPS location when recording
      if (isRecording) {
        try {
          console.log('🔴 Adding GPS location to recording path:', gpsLocation.lat, gpsLocation.lng);
          
          // Calculate distance if we have a previous location
          if (lastRecordingLocation) {
            const segmentDistance = calculateDistance(
              lastRecordingLocation.lat, 
              lastRecordingLocation.lng, 
              gpsLocation.lat, 
              gpsLocation.lng
            );
            
            // Only add meaningful distance changes (> 1 meter) to avoid GPS noise
            if (segmentDistance > 0.001) { // 0.001 km = 1 meter
              setRealTimeDistance(prev => {
                const newTotal = prev + segmentDistance;
                console.log(`📊 GPS distance update: +${(segmentDistance * 1000).toFixed(0)}m, total: ${(newTotal * 1000).toFixed(0)}m`);
                return newTotal;
              });
            }
          }
          
          // Update last recording location for next distance calculation
          setLastRecordingLocation({ 
            lat: gpsLocation.lat, 
            lng: gpsLocation.lng, 
            timestamp: Date.now() 
          });
          
          // Add to recording path for real-time display
          setRecordingPath(prev => {
            // Avoid duplicate points
            const lastPoint = prev[prev.length - 1];
            if (lastPoint && 
                Math.abs(lastPoint.lat - gpsLocation.lat) < 0.00001 && 
                Math.abs(lastPoint.lng - gpsLocation.lng) < 0.00001) {
              console.log('🎯 Skipping duplicate GPS point in recording path');
              return prev;
            }
            
            const newPath = [...prev, gpsLocation];
            
            // Memory protection: limit path to reasonable size to prevent crashes
            const maxPathPoints = 10000; // ~10k points should be plenty for most sessions
            if (newPath.length > maxPathPoints) {
              console.warn(`⚠️ Path too long (${newPath.length} points), trimming to prevent memory issues`);
              return newPath.slice(-maxPathPoints); // Keep latest points
            }
            
            console.log(`🗺️ Recording path updated from GPS: ${newPath.length} points`);
            console.log('🗺️ Latest path points:', newPath.slice(-3));
            return newPath;
          });
        } catch (error) {
          console.error('❌ Error during GPS recording update:', error);
          // Continue recording but log the error to prevent crashes
        }
      }
      
      // Simplified suburb lookup - no delay during recording to avoid timer issues
      updateCurrentSuburb(gpsLocation).catch(error => {
        console.log('Suburb lookup failed, continuing with GPS tracking:', error);
      });
    }
  }, [gpsLocation, isRecording]);

  // DISABLED: Map animation updates can cause crashes during recording
  // Simplified to rely only on GPS location updates for recording
  const handleLocationUpdate = useCallback((animatedLocation: { lat: number; lng: number }) => {
    // Do nothing - recording now relies only on GPS updates to prevent crashes
    console.log('🎯 handleLocationUpdate disabled to prevent crashes during recording');
  }, []);

  // DISABLED: GPS monitoring and auto-restart can cause crashes during recording
  // Instead, we rely on stable GPS connection without interruptions
  useEffect(() => {
    if (isRecording) {
      console.log('📡 Recording started - GPS monitoring disabled to prevent crashes');
      console.log('📡 Relying on stable GPS connection without auto-restart during recording');
    }
  }, [isRecording]);

  // Function to update current suburb
  const updateCurrentSuburb = async (location: { lat: number; lng: number }) => {
    try {
      const response = await fetch(`/api/suburbs/lookup?lat=${location.lat}&lng=${location.lng}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (response.ok) {
        const data = await response.json();
        const newSuburb = data.suburb || 'Unknown';
        if (newSuburb !== currentSuburb) {
          console.log('🏘️ Suburb updated from', currentSuburb, 'to', newSuburb);
        }
        setCurrentSuburb(newSuburb);
      } else {
        console.log('Suburb lookup failed with status:', response.status);
        setCurrentSuburb('Unknown');
      }
    } catch (error) {
      console.log('Could not determine current suburb:', error);
      setCurrentSuburb('Unknown');
    }
  };

  // Handle KML simulation location updates
  const handleKMLLocationUpdate = useCallback((newLocation: { lat: number; lng: number; accuracy?: number }) => {
    console.log('🎯 Home: KML Location Update received:', newLocation.lat, newLocation.lng);
    try {
      setLocation(newLocation);
      
      // Update recording path with KML location when recording
      if (isRecording) {
        console.log('🔴 Adding KML location to recording path:', newLocation.lat, newLocation.lng);
        
        // Calculate distance for KML simulation (same logic as GPS)
        if (lastRecordingLocation) {
          const segmentDistance = calculateDistance(
            lastRecordingLocation.lat, 
            lastRecordingLocation.lng, 
            newLocation.lat, 
            newLocation.lng
          );
          
          console.log(`🔍 KML: Distance calc - last:(${lastRecordingLocation.lat.toFixed(6)}, ${lastRecordingLocation.lng.toFixed(6)}) -> new:(${newLocation.lat.toFixed(6)}, ${newLocation.lng.toFixed(6)}) = ${(segmentDistance * 1000).toFixed(1)}m`);
          
          // Add meaningful distance changes (> 1 meter) to avoid noise
          if (segmentDistance > 0.001) { // 0.001 km = 1 meter
            setRealTimeDistance(prev => {
              const newTotal = prev + segmentDistance;
              console.log(`📊 KML distance update: +${(segmentDistance * 1000).toFixed(0)}m, total: ${(newTotal * 1000).toFixed(0)}m`);
              return newTotal;
            });
          } else {
            console.log(`🔍 KML: Skipping small distance: ${(segmentDistance * 1000).toFixed(1)}m (< 1m threshold)`);
          }
        } else {
          console.log('🔍 KML: No lastRecordingLocation available for distance calculation');
        }
        
        // Update last recording location for next distance calculation
        setLastRecordingLocation({ 
          lat: newLocation.lat, 
          lng: newLocation.lng, 
          timestamp: Date.now() 
        });
        
        setRecordingPath(prev => {
          // Avoid duplicate points
          const lastPoint = prev[prev.length - 1];
          if (lastPoint && 
              Math.abs(lastPoint.lat - newLocation.lat) < 0.00001 && 
              Math.abs(lastPoint.lng - newLocation.lng) < 0.00001) {
            console.log('🎯 Skipping duplicate KML point in recording path');
            return prev;
          }
          
          const newPath = [...prev, newLocation];
          console.log(`🗺️ Recording path updated from KML: ${newPath.length} points`);
          console.log('🗺️ Latest KML path points:', newPath.slice(-3));
          return newPath;
        });
      }
      
      updateCurrentSuburb(newLocation).catch(error => {
        console.log('KML suburb lookup failed:', error);
      });
      console.log('🎯 Home: Location state updated successfully');
    } catch (error) {
      console.error('🎯 Home: Error updating location state:', error);
    }
  }, [isRecording, lastRecordingLocation, calculateDistance]);

  // Debug: Log when handleKMLLocationUpdate is created
  console.log('🏠 Home: handleKMLLocationUpdate type:', typeof handleKMLLocationUpdate);
  console.log('🏠 Home: About to render GPSDebug with callback:', !!handleKMLLocationUpdate);

  // Set up global KML callback - FORCE REFRESH
  useEffect(() => {
    console.log('🎯 Home: Setting up global KML callback [REFRESH]');
    
    // Capture current values in closure
    const getCurrentValues = () => ({
      isRecording,
      lastRecordingLocation,
      setRealTimeDistance,
      setLastRecordingLocation,
      setRecordingPath
    });
    
    (window as any).kmlLocationCallback = (newLocation: { lat: number; lng: number; accuracy?: number }) => {
      console.log('🎯 Home: Global KML callback received:', newLocation.lat, newLocation.lng);
      const values = getCurrentValues();
      setLocation(newLocation);
      
      // Update recording path with KML location when recording
      if (values.isRecording) {
        console.log('🔴 Adding global KML location to recording path:', newLocation.lat, newLocation.lng);
        
        // Calculate distance for global KML callback (same logic as other handlers)
        if (values.lastRecordingLocation) {
          const segmentDistance = calculateDistance(
            values.lastRecordingLocation.lat, 
            values.lastRecordingLocation.lng, 
            newLocation.lat, 
            newLocation.lng
          );
          
          console.log(`🔍 Global KML: Distance calc - last:(${values.lastRecordingLocation.lat.toFixed(6)}, ${values.lastRecordingLocation.lng.toFixed(6)}) -> new:(${newLocation.lat.toFixed(6)}, ${newLocation.lng.toFixed(6)}) = ${(segmentDistance * 1000).toFixed(1)}m`);
          
          if (segmentDistance > 0.001) { // 0.001 km = 1 meter
            values.setRealTimeDistance(prev => {
              const newTotal = prev + segmentDistance;
              console.log(`📊 Global KML distance: +${(segmentDistance * 1000).toFixed(0)}m, total: ${(newTotal * 1000).toFixed(0)}m`);
              return newTotal;
            });
          } else {
            console.log(`🔍 Global KML: Skipping small distance: ${(segmentDistance * 1000).toFixed(1)}m (< 1m threshold)`);
          }
        } else {
          console.log('🔍 Global KML: No lastRecordingLocation available for distance calculation');
        }
        
        // Update last recording location
        values.setLastRecordingLocation({ 
          lat: newLocation.lat, 
          lng: newLocation.lng, 
          timestamp: Date.now() 
        });
        
        values.setRecordingPath(prev => {
          const lastPoint = prev[prev.length - 1];
          if (lastPoint && 
              Math.abs(lastPoint.lat - newLocation.lat) < 0.00001 && 
              Math.abs(lastPoint.lng - newLocation.lng) < 0.00001) {
            return prev;
          }
          
          const newPath = [...prev, newLocation];
          console.log(`🗺️ Recording path updated from global KML: ${newPath.length} points`);
          return newPath;
        });
      }
      
      updateCurrentSuburb(newLocation).catch(error => {
        console.log('Global KML suburb lookup failed:', error);
      });
    };
    
    console.log('🎯 Home: Global callback registered on window');
    
    return () => {
      console.log('🎯 Home: Removing global KML callback');
      delete (window as any).kmlLocationCallback;
    };
  }, [isRecording, lastRecordingLocation, calculateDistance]);

  // Handle GPS errors
  useEffect(() => {
    if (gpsError) {
      toast({
        title: "Location Access Required",
        description: "Please allow location access to use GPS tracking features. Check your browser permissions.",
        variant: "destructive",
      });
    }
  }, [gpsError, toast]);

  // Create session mutation
  const createSessionMutation = useMutation({
    mutationFn: async (sessionData: any) => {
      const response = await apiRequest('POST', '/api/sessions', sessionData);
      return response.json();
    },
  });

  // Update session mutation
  const updateSessionMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: any }) => {
      const response = await apiRequest('PUT', `/api/sessions/${id}`, updates);
      return response.json();
    },
  });

  // Add location mutation for continuous tracking with error handling
  const addLocationMutation = useMutation({
    mutationFn: async (locationData: any) => {
      const response = await apiRequest('POST', '/api/locations', locationData);
      return response.json();
    },
    onError: (error) => {
      console.error('❌ Failed to save location point:', error);
      // Don't stop recording on individual location save failures
      // Just log the error and continue recording
    },
  });



  // Continuous location recording during active recording with robust error handling
  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    let retryCount = 0;
    const maxRetries = 3;
    
    if (isRecording && location) {
      const activeSession = sessions.find(s => s.isActive);
      if (activeSession) {
        console.log('🔄 Starting continuous location recording for session:', activeSession.id);
        
        // Get GPS accuracy setting to determine recording interval (increased to reduce UI freeze)
        const gpsAccuracy = localStorage.getItem('gpsAccuracy') || 'medium';
        let recordingInterval = 10000; // Default 10 seconds (increased from 5)
        
        switch (gpsAccuracy) {
          case 'high':
            recordingInterval = 5000; // 5 seconds for high accuracy (increased from 2)
            break;
          case 'medium':
            recordingInterval = 10000; // 10 seconds for medium (increased from 5)
            break;
          case 'low':
            recordingInterval = 15000; // 15 seconds for low accuracy (increased from 10)
            break;
        }
        
        // Record location at intervals based on GPS accuracy setting
        intervalId = setInterval(async () => {
          try {
            // Ensure we still have a valid session and location
            if (!isRecording || !location) {
              console.log('🛑 Recording stopped or location lost, clearing interval');
              clearInterval(intervalId);
              return;
            }
            
            // Check if session is still active
            const currentSession = sessions.find(s => s.isActive);
            if (!currentSession) {
              console.log('🛑 No active session found, stopping location recording');
              clearInterval(intervalId);
              return;
            }
            
            console.log('📍 Recording location point:', location.lat, location.lng);
            
            // Record location point
            addLocationMutation.mutate({
              sessionId: currentSession.id,
              latitude: location.lat,
              longitude: location.lng,
              timestamp: new Date().toISOString(),
              accuracy: location.accuracy || undefined
            });
            
            // Reset retry count on successful recording
            retryCount = 0;
            
          } catch (error) {
            console.error('❌ Location recording error:', error);
            retryCount++;
            
            // If too many retries, show error but don't stop recording
            if (retryCount >= maxRetries) {
              console.error('❌ Max retries reached, but continuing recording');
              toast({
                title: "Recording Warning",
                description: "Some location points may not have been saved, but recording continues.",
                variant: "destructive",
              });
              retryCount = 0; // Reset for next cycle
            }
          }
        }, recordingInterval);
        
        console.log('✅ Location recording interval set:', recordingInterval + 'ms');
      }
    }

    return () => {
      if (intervalId) {
        console.log('🧹 Cleaning up location recording interval');
        clearInterval(intervalId);
      }
    };
  }, [isRecording, location, sessions, addLocationMutation, toast]);

  const activeSession = sessions.find(s => s.isActive);
  const isTracking = isRecording;

  // Get session locations for the map
  const { data: sessionLocations = [] } = useQuery<LocationPoint[]>({
    queryKey: ['/api/sessions', activeSession?.id, 'locations'],
    queryFn: async () => {
      if (!activeSession) return [];
      const response = await fetch(`/api/sessions/${activeSession.id}/locations`);
      if (!response.ok) return [];
      const locations = await response.json();
      return locations.map((loc: any) => ({
        lat: loc.latitude,
        lng: loc.longitude,
        timestamp: loc.timestamp,
        suburb: loc.suburb,
        accuracy: loc.accuracy
      }));
    },
    enabled: !!activeSession,
    refetchInterval: isRecording ? 3000 : false, // Refresh every 3 seconds during recording
  });

  // Timer effect for recording stats - placed after sessionLocations declaration
  useEffect(() => {
    let timerInterval: NodeJS.Timeout;
    
    console.log(`🕐 Timer effect triggered: isRecording=${isRecording}, recordingStartTime=${recordingStartTime?.toISOString()}, realTimeDistance=${realTimeDistance}`);
    console.log(`🕐 Type checks: isRecording=${typeof isRecording} (${isRecording}), recordingStartTime=${typeof recordingStartTime} (${!!recordingStartTime})`);
    
    if (isRecording && recordingStartTime) {
      console.log('🕐 ✅ Starting timer interval for recording stats');
      timerInterval = setInterval(() => {
        const now = new Date();
        const elapsed = now.getTime() - recordingStartTime.getTime();
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        
        console.log(`🕐 Timer: elapsed=${elapsed}ms, minutes=${minutes}, seconds=${seconds}`);
        
        let duration = '';
        if (minutes > 0) {
          duration = `${minutes}m ${seconds}s`;
        } else {
          duration = `${seconds}s`;
        }
        
        // Use real-time distance calculation for immediate updates
        // Get latest realTimeDistance value to avoid closure issues
        const distanceKm = realTimeDistance;
        
        // Format distance display
        const distanceStr = distanceKm >= 1 ? `${distanceKm.toFixed(1)}km` : `${(distanceKm * 1000).toFixed(0)}m`;
        
        // Calculate fuel cost based on distance and fuel price setting
        const fuelPrice = parseFloat(localStorage.getItem('fuelPrice') || '2.00');
        const fuelConsumption = 8; // L/100km average car consumption
        const fuelCost = (distanceKm * fuelConsumption / 100) * fuelPrice;
        const costStr = fuelCost.toFixed(2);
        
        console.log(`📊 Recording stats: ${duration}, ${distanceStr}, $${costStr} (${sessionLocations.length} locations)`);
        setRecordingStats({ duration, distance: distanceStr, cost: costStr });
      }, 1000);
    } else {
      console.log('🕐 Timer not starting: missing isRecording or recordingStartTime');
    }
    
    return () => {
      if (timerInterval) {
        console.log('🕐 Clearing timer interval');
        clearInterval(timerInterval);
      }
    };
  }, [isRecording, recordingStartTime]);

  const handleStartSession = () => {
    if (!location) {
      if (!isWatching) {
        startWatching();
      }
      toast({
        title: "Location Required",
        description: "Getting your location to start tracking.",
      });
      return;
    }

    const sessionData = {
      startTime: new Date().toISOString(),
      isActive: true,
      startLocation: {
        lat: location.lat,
        lng: location.lng,
        suburb: 'Unknown'
      }
    };

    createSessionMutation.mutate(sessionData);
  };

  const handleStopSession = () => {
    const activeSession = sessions.find(s => s.isActive);
    if (!activeSession || !location) return;

    // Calculate total distance from session locations or use real-time distance
    let totalDistance = realTimeDistance;
    
    // If we have session locations, calculate distance as backup
    if (sessionLocations && sessionLocations.length > 1) {
      let calculatedDistance = 0;
      for (let i = 1; i < sessionLocations.length; i++) {
        calculatedDistance += calculateDistance(
          sessionLocations[i-1].lat,
          sessionLocations[i-1].lng,
          sessionLocations[i].lat,
          sessionLocations[i].lng
        );
      }
      
      // Use the larger of the two distances (real-time or calculated)
      totalDistance = Math.max(totalDistance, calculatedDistance);
    }

    const updates = {
      endTime: new Date().toISOString(),
      isActive: false,
      distance: totalDistance,
      endLocation: {
        lat: location.lat,
        lng: location.lng,
        suburb: 'Unknown'
      }
    };

    updateSessionMutation.mutate({ id: activeSession.id, updates });
  };

  const handleStartRecording = () => {
    if (!location) {
      if (!isWatching) {
        startWatching();
      }
      toast({
        title: "Getting Location",
        description: "Please wait while we get your GPS location.",
      });
      return;
    }

    const startTime = new Date();
    console.log('🎬 Starting recording - setting state variables');
    console.log('🎬 startTime:', startTime.toISOString());
    console.log('🎬 location:', location);
    
    setIsRecording(true);
    setRecordingStartTime(startTime);
    setRecordingStats({ duration: '0s', distance: '0m', cost: '0.00' });
    setRealTimeDistance(0);
    setLastRecordingLocation({ lat: location.lat, lng: location.lng });
    setRecordingPath([{ lat: location.lat, lng: location.lng }]); // Initialize persistent path
    
    console.log('🎬 State variables set - isRecording should be true, recordingStartTime should be set');
    
    // Ensure GPS tracking is active when recording starts
    if (!isWatching) {
      startWatching();
    }
    
    // Request wake lock to keep screen on during recording
    requestWakeLock();
    
    // Create a new session when starting recording
    const sessionData = {
      startTime: startTime.toISOString(),
      isActive: true,
      routeCoordinates: [{ lat: location.lat, lng: location.lng, timestamp: startTime.toISOString() }],
    };

    createSessionMutation.mutate(sessionData, {
      onSuccess: () => {
        console.log("Started recording clearout search path - GPS tracking active");
      },
      onError: (error) => {
        console.error('Error creating session:', error);
        setIsRecording(false);
        setRecordingStartTime(null);
        setRealTimeDistance(0);
        setLastRecordingLocation(null);
        setRecordingPath([]);
        releaseWakeLock();
        toast({
          title: "Error",
          description: "Failed to start recording session.",
          variant: "destructive",
        });
      },
    });
  };

  const handleStopRecording = () => {
    console.log('🛑 Stop recording button clicked');
    const activeSession = sessions.find(s => s.isActive);
    console.log('🛑 Active session found:', !!activeSession);
    
    // Force stop recording state immediately
    console.log('🛑 Forcing recording state to false');
    setIsRecording(false);
    setRecordingStartTime(null);
    setRealTimeDistance(0);
    setLastRecordingLocation(null);
    setRecordingPath([]);
    releaseWakeLock();
    
    // Save persistent path
    if (recordingPath.length > 1 && recordingStartTime) {
      const endTime = new Date();
      const duration = (endTime.getTime() - recordingStartTime.getTime()) / 1000 / 60; // minutes
      const pathDistance = realTimeDistance / 1000; // km
      
      // Get the next color for the new path
      const existingPaths = loadPersistentPaths();
      const nextColorIndex = existingPaths.length % PATH_COLORS.length; // Cycle through colors
      const pathColor = PATH_COLORS[nextColorIndex];
      
      const persistentPath: PersistentPath = {
        id: `path-${Date.now()}`,
        name: `Route ${new Date().toLocaleDateString()}`,
        coordinates: recordingPath,
        date: recordingStartTime.toISOString(),
        distance: pathDistance,
        duration: duration,
        color: pathColor
      };
      
      console.log('🗺️ Saving persistent path:', persistentPath.name, 'with', persistentPath.coordinates.length, 'points');
      console.log('🗺️ Path coordinates preview:', persistentPath.coordinates.slice(0, 3), '...');
      
      savePersistentPath(persistentPath);
      
      // Immediately update the persistentPaths state
      const updatedPaths = loadPersistentPaths();
      setPersistentPaths(updatedPaths);
      console.log('✅ Saved persistent path:', persistentPath.name, persistentPath.coordinates.length, 'points');
    } else {
      console.log('⚠️ Cannot save path - recordingPath length:', recordingPath.length, 'recordingStartTime:', recordingStartTime);
    }
    
    if (activeSession) {
      const updates = {
        endTime: new Date().toISOString(),
        isActive: false,
      };

      updateSessionMutation.mutate(
        { id: activeSession.id, updates },
        {
          onSuccess: () => {
            toast({
              title: "Recording Stopped",
              description: `Recording saved: ${recordingStats.duration}, ${recordingStats.distance}`,
            });
          },
          onError: (error) => {
            console.error('Error updating session:', error);
            toast({
              title: "Error",
              description: "Failed to stop recording session.",
              variant: "destructive",
            });
          },
        }
      );
    }
    
    console.log('🛑 Stopping recording - clearing all recording state');
    setIsRecording(false);
    setRecordingStartTime(null);
    setRecordingStats({ duration: '0m', distance: '0.0km', cost: '0.00' });
    setRealTimeDistance(0);
    setLastRecordingLocation(null);
    setRecordingPath([]); // Clear recording path for next session
    releaseWakeLock();
    console.log("✅ Recording stopped successfully - ready for next session");
  };

  const handleTestGPS = () => {
    console.log("Manual GPS test triggered");
    if (!isWatching) {
      startWatching();
    } else {
      // Force a fresh GPS reading
      navigator.geolocation.getCurrentPosition(
        (position) => {
          console.log("Manual GPS test result:", position.coords.latitude, position.coords.longitude);
        },
        (error) => {
          console.error("Manual GPS test failed:", error);
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0
        }
      );
    }
  };

  const stats = {
    duration: '0m',
    distance: '0m',
    suburbs: 0
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Map Container */}
      <div className="flex-1 relative">
        <MapboxMap
          currentLocation={location}
          isRecording={isRecording}
          onLocationUpdate={handleLocationUpdate}
          persistentPaths={persistentPaths}
          currentRecordingPath={recordingPath}
          focusArea="imax-van"
          showSuburbs={showSuburbBoundaries}
          showToilets={showToilets}
          currentSuburb={{ suburb: currentSuburb }}
        />
        
        {/* Simple Controls */}
        <SimpleControls
          isRecording={isRecording}
          onStartRecording={handleStartRecording}
          onStopRecording={handleStopRecording}
          location={location}
          currentSuburb={currentSuburb}
          recordingStats={recordingStats}
        />
        
        {/* GPS Debug Panel */}
        <GPSDebug
          location={location}
          error={gpsError}
          isWatching={isWatching}
          onTestGPS={startWatching}
          onLocationUpdate={handleKMLLocationUpdate}
        />


        {/* Mobile Menu Button */}
        <div className="fixed top-4 right-4 z-[1001] md:hidden">
          <Button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            size="sm"
            variant="outline"
            className="bg-white/90 backdrop-blur-sm border-gray-300 shadow-lg"
          >
            {isMobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Sidebar - Desktop */}
      <div className="hidden md:flex md:w-80 md:flex-col md:border-l md:bg-muted/30">
        <div className="p-4 border-b">
          <h1 className="text-xl font-semibold">Clearout Tracker</h1>
        </div>
        
        <div className="flex-1 flex flex-col">
          {/* Tab Navigation */}
          <div className="flex border-b">
            <button
              onClick={() => setActiveTab('sessions')}
              className={`flex-1 px-4 py-2 text-sm font-medium ${
                activeTab === 'sessions'
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Sessions
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`flex-1 px-4 py-2 text-sm font-medium ${
                activeTab === 'settings'
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Settings
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-hidden">
            {activeTab === 'sessions' && (
              <div className="h-full flex flex-col">
                <SessionTotals sessions={sessions} />
                <PathManagement />
              </div>
            )}
            {activeTab === 'settings' && (
              <Settings 
                showSuburbBoundaries={showSuburbBoundaries}
                setShowSuburbBoundaries={setShowSuburbBoundaries}
                showToilets={showToilets}
                setShowToilets={setShowToilets}
              />
            )}
          </div>
        </div>
      </div>

      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-[1002] md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setIsMobileMenuOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-80 bg-background border-l shadow-lg flex flex-col">
            <div className="p-4 border-b flex items-center justify-between flex-shrink-0">
              <h1 className="text-xl font-semibold">Clearout Tracker</h1>
              <Button
                onClick={() => setIsMobileMenuOpen(false)}
                variant="ghost"
                size="sm"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="flex-1 flex flex-col min-h-0">
              {/* Tab Navigation */}
              <div className="flex border-b flex-shrink-0">
                <button
                  onClick={() => setActiveTab('sessions')}
                  className={`flex-1 px-4 py-2 text-sm font-medium ${
                    activeTab === 'sessions'
                      ? 'text-primary border-b-2 border-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Sessions
                </button>
                <button
                  onClick={() => setActiveTab('settings')}
                  className={`flex-1 px-4 py-2 text-sm font-medium ${
                    activeTab === 'settings'
                      ? 'text-primary border-b-2 border-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Settings
                </button>
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto min-h-0">
                {activeTab === 'sessions' && (
                  <div className="h-full flex flex-col">
                    <SessionTotals sessions={sessions} />
                    <PathManagement />
                  </div>
                )}
                {activeTab === 'settings' && (
                  <Settings 
                    showSuburbBoundaries={showSuburbBoundaries}
                    setShowSuburbBoundaries={setShowSuburbBoundaries}
                    showToilets={showToilets}
                    setShowToilets={setShowToilets}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}