import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import MapboxMap from "@/components/mapbox-map";
import SimpleControls from "@/components/simple-controls";
import SessionHistory from "@/components/session-history";
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

  // Update location state when GPS location changes with throttling to prevent UI freeze
  useEffect(() => {
    if (gpsLocation) {
      setLocation(gpsLocation);
      console.log('Location updated from GPS:', gpsLocation.lat, gpsLocation.lng);
      
      // Throttle expensive operations during recording to prevent UI freeze
      if (isRecording) {
        // Only update distance every 2 seconds to prevent constant calculations
        const now = Date.now();
        const lastUpdate = lastRecordingLocation?.timestamp || 0;
        
        if (now - lastUpdate > 2000) { // 2 second throttle
          if (lastRecordingLocation) {
            const segmentDistance = calculateDistance(
              lastRecordingLocation.lat, 
              lastRecordingLocation.lng, 
              gpsLocation.lat, 
              gpsLocation.lng
            );
            // Only add meaningful distance changes (> 1 meter) to avoid GPS noise
            if (segmentDistance > 0.001) { // 0.001 km = 1 meter
              setRealTimeDistance(prev => prev + segmentDistance);
              console.log(`📊 Real-time distance update: +${(segmentDistance * 1000).toFixed(0)}m, total: ${((realTimeDistance + segmentDistance) * 1000).toFixed(0)}m`);
              
              // Add to recording path tracking for real-time display
              setRecordingPath(prev => {
                const newPath = [...prev, { lat: gpsLocation.lat, lng: gpsLocation.lng }];
                console.log(`🗺️ Recording path updated: ${newPath.length} points`);
                return newPath;
              });
            }
          }
          
          // Update last recording location with timestamp
          setLastRecordingLocation({ 
            lat: gpsLocation.lat, 
            lng: gpsLocation.lng, 
            timestamp: now 
          });
        }
      } else {
        // When not recording, update suburb lookup (throttled)
        setTimeout(() => {
          updateCurrentSuburb(gpsLocation).catch(error => {
            console.log('Suburb lookup failed, continuing with GPS tracking:', error);
          });
        }, 500);
      }
    }
  }, [gpsLocation, isRecording]);

  // GPS monitoring and auto-restart during recording - prevents crashes with reduced frequency
  useEffect(() => {
    let gpsMonitorInterval: NodeJS.Timeout;
    
    if (isRecording) {
      console.log('📡 Starting GPS monitoring to prevent recording crashes');
      
      gpsMonitorInterval = setInterval(() => {
        try {
          // Check if GPS is still active during recording
          if (isRecording && !isWatching) {
            console.log('⚠️ GPS stopped during recording - restarting GPS to prevent crash');
            startWatching();
            toast({
              title: "GPS Auto-Restart",
              description: "GPS was restarted to prevent recording interruption.",
            });
          }
          
          // Check if we have a stale location (no updates for too long) - reduced frequency
          if (isRecording && location) {
            const now = Date.now();
            const locationAge = now - (location as any).timestamp || 0;
            
            // If location is older than 30 seconds, restart GPS
            if (locationAge > 30000) {
              console.log('⚠️ GPS location is stale - restarting GPS');
              startWatching();
            }
          }
        } catch (error) {
          console.error('❌ GPS monitoring error:', error);
        }
      }, 30000); // Check every 30 seconds to reduce CPU usage
    }
    
    return () => {
      if (gpsMonitorInterval) {
        clearInterval(gpsMonitorInterval);
      }
    };
  }, [isRecording, isWatching, startWatching, location, toast]);

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
        setCurrentSuburb(data.suburb || 'Unknown');
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
      updateCurrentSuburb(newLocation).catch(error => {
        console.log('KML suburb lookup failed:', error);
      });
      console.log('🎯 Home: Location state updated successfully');
    } catch (error) {
      console.error('🎯 Home: Error updating location state:', error);
    }
  }, []);

  // Debug: Log when handleKMLLocationUpdate is created
  console.log('🏠 Home: handleKMLLocationUpdate type:', typeof handleKMLLocationUpdate);
  console.log('🏠 Home: About to render GPSDebug with callback:', !!handleKMLLocationUpdate);

  // Set up global KML callback - FORCE REFRESH
  useEffect(() => {
    console.log('🎯 Home: Setting up global KML callback [REFRESH]');
    
    (window as any).kmlLocationCallback = (newLocation: { lat: number; lng: number; accuracy?: number }) => {
      console.log('🎯 Home: Global KML callback received:', newLocation.lat, newLocation.lng);
      setLocation(newLocation);
      updateCurrentSuburb(newLocation).catch(error => {
        console.log('Global KML suburb lookup failed:', error);
      });
    };
    
    console.log('🎯 Home: Global callback registered on window');
    
    return () => {
      console.log('🎯 Home: Removing global KML callback');
      delete (window as any).kmlLocationCallback;
    };
  }, []);

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
    
    if (isRecording && recordingStartTime) {
      timerInterval = setInterval(() => {
        const now = new Date();
        const elapsed = now.getTime() - recordingStartTime.getTime();
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        
        let duration = '';
        if (minutes > 0) {
          duration = `${minutes}m ${seconds}s`;
        } else {
          duration = `${seconds}s`;
        }
        
        // Use real-time distance calculation for immediate updates
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
    }
    
    return () => {
      if (timerInterval) {
        clearInterval(timerInterval);
      }
    };
  }, [isRecording, recordingStartTime, realTimeDistance]);

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

    const updates = {
      endTime: new Date().toISOString(),
      isActive: false,
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
    setIsRecording(true);
    setRecordingStartTime(startTime);
    setRecordingStats({ duration: '0s', distance: '0m', cost: '0.00' });
    setRealTimeDistance(0);
    setLastRecordingLocation({ lat: location.lat, lng: location.lng });
    setRecordingPath([{ lat: location.lat, lng: location.lng }]); // Initialize persistent path
    
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
    const activeSession = sessions.find(s => s.isActive);
    
    // Save persistent path
    if (recordingPath.length > 1 && recordingStartTime) {
      const endTime = new Date();
      const duration = (endTime.getTime() - recordingStartTime.getTime()) / 1000 / 60; // minutes
      const pathDistance = realTimeDistance / 1000; // km
      
      const persistentPath: PersistentPath = {
        id: `path-${Date.now()}`,
        name: `Route ${new Date().toLocaleDateString()}`,
        coordinates: recordingPath,
        date: recordingStartTime.toISOString(),
        distance: pathDistance,
        duration: duration,
        color: PATH_COLORS[0] // Will be dynamically colored based on index
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
    
    setIsRecording(false);
    setRecordingStartTime(null);
    setRecordingStats({ duration: '0m', distance: '0.0km', cost: '0.00' });
    setRealTimeDistance(0);
    setLastRecordingLocation(null);
    setRecordingPath([]);
    releaseWakeLock();
    console.log("Stopped recording clearout search path");
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
          onLocationUpdate={handleKMLLocationUpdate}
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
              <SessionHistory sessions={sessions} isLoading={false} />
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
                    <SessionHistory sessions={sessions} isLoading={false} isMobile />
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