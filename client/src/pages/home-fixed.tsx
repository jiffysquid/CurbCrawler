import React, { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import Map from "@/components/map";
import SessionHistory from "@/components/session-history";
import Settings from "@/components/settings";
import SimpleControls from "@/components/simple-controls";
import GPSDebug from "@/components/gps-debug";
import { useToast } from "@/hooks/use-toast";
import { useGeolocation } from "@/hooks/use-geolocation";
import { Menu, X, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SessionWithStats, LocationPoint } from "@shared/schema";

type TabType = 'sessions' | 'settings';

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabType>('sessions');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [location, setLocation] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [currentSuburb, setCurrentSuburb] = useState<string>('Unknown');
  
  const { toast } = useToast();
  
  // Use the geolocation hook for continuous GPS tracking
  const { location: gpsLocation, error: gpsError, isLoading: gpsLoading, isWatching, startWatching, stopWatching } = useGeolocation();

  // Fetch sessions
  const { data: sessions = [] } = useQuery<SessionWithStats[]>({
    queryKey: ['/api/sessions'],
  });

  const activeSession = sessions.find(s => s.isActive);
  const isTracking = Boolean(activeSession);

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
      startWatching();
    } else {
      toast({
        title: "Geolocation Not Supported",
        description: "Your device doesn't support location services.",
        variant: "destructive",
      });
    }
  }, [toast, startWatching]);

  // Update location state when GPS location changes
  useEffect(() => {
    if (gpsLocation) {
      setLocation(gpsLocation);
      console.log('Location updated from GPS:', gpsLocation.lat, gpsLocation.lng);
      
      // Update current suburb when location changes
      updateCurrentSuburb(gpsLocation);
    }
  }, [gpsLocation]);

  // Function to update current suburb
  const updateCurrentSuburb = async (location: { lat: number; lng: number }) => {
    try {
      const response = await fetch(`/api/suburbs/lookup?lat=${location.lat}&lng=${location.lng}`);
      if (response.ok) {
        const data = await response.json();
        setCurrentSuburb(data.suburb || 'Unknown');
      } else {
        setCurrentSuburb('Unknown');
      }
    } catch (error) {
      console.log('Could not determine current suburb:', error);
      setCurrentSuburb('Unknown');
    }
  };

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

  // Add location mutation for continuous tracking
  const addLocationMutation = useMutation({
    mutationFn: async (locationData: any) => {
      const response = await apiRequest('POST', '/api/locations', locationData);
      return response.json();
    },
  });

  // Continuous location recording during active recording
  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    
    if (isRecording && location) {
      const activeSession = sessions.find(s => s.isActive);
      if (activeSession) {
        // Get GPS accuracy setting to determine recording interval
        const gpsAccuracy = localStorage.getItem('gpsAccuracy') || 'medium';
        let recordingInterval = 5000; // Default 5 seconds
        
        switch (gpsAccuracy) {
          case 'high':
            recordingInterval = 2000; // 2 seconds for high accuracy
            break;
          case 'medium':
            recordingInterval = 5000; // 5 seconds for medium
            break;
          case 'low':
            recordingInterval = 10000; // 10 seconds for low accuracy
            break;
        }
        
        // Record location at intervals based on GPS accuracy setting
        intervalId = setInterval(() => {
          addLocationMutation.mutate({
            sessionId: activeSession.id,
            latitude: location.lat,
            longitude: location.lng,
            timestamp: new Date().toISOString(),
            accuracy: location.accuracy || undefined
          });
        }, recordingInterval);
      }
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isRecording, location, sessions, addLocationMutation]);

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
        suburb: currentSuburb
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
        suburb: currentSuburb
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

    setIsRecording(true);
    // Ensure GPS tracking is active when recording starts
    if (!isWatching) {
      startWatching();
    }
    
    // Create a new session when starting recording
    const sessionData = {
      startTime: new Date().toISOString(),
      isActive: true,
      routeCoordinates: [{ lat: location.lat, lng: location.lng, timestamp: new Date().toISOString() }],
    };

    createSessionMutation.mutate(sessionData, {
      onSuccess: () => {
        console.log("Started recording clearout search path - GPS tracking active");
      },
      onError: (error) => {
        console.error('Error creating session:', error);
        setIsRecording(false);
        toast({
          title: "Error",
          description: "Failed to start recording session.",
          variant: "destructive",
        });
      },
    });
  };

  const handleStopRecording = () => {
    // Immediately stop recording in UI
    setIsRecording(false);
    
    const activeSession = sessions.find(s => s.isActive);
    if (activeSession) {
      const updates = {
        endTime: new Date().toISOString(),
        isActive: false,
      };

      updateSessionMutation.mutate(
        { id: activeSession.id, updates },
        {
          onSuccess: () => {
            console.log("Stopped recording clearout search path");
          },
          onError: (error) => {
            console.error('Error stopping session:', error);
            toast({
              title: "Error", 
              description: "Failed to stop recording session.",
              variant: "destructive",
            });
            // Even if server update fails, keep recording stopped in UI
          },
        }
      );
    } else {
      // No active session found, but user clicked stop - just reset UI state
      console.log("No active session found when stopping recording");
    }
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
        <Map
          currentLocation={location}
          sessionLocations={sessionLocations}
          currentSuburb={currentSuburb}
          isTracking={isTracking}
          allSessions={sessions}
        />
        
        {/* Simple Controls */}
        <SimpleControls
          isRecording={isRecording}
          onStartRecording={handleStartRecording}
          onStopRecording={handleStopRecording}
          location={location}
          currentSuburb={currentSuburb}
        />
        
        <GPSDebug
          location={location}
          error={gpsError}
          isWatching={isWatching}
          onTestGPS={handleTestGPS}
        />
      </div>

      {/* Mobile Menu Button */}
      <Button
        variant="outline"
        size="icon"
        className="fixed top-4 right-4 z-50 bg-white/90 backdrop-blur-sm border-gray-200 shadow-lg md:hidden"
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
      >
        {isMobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </Button>

      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setIsMobileMenuOpen(false)} />
      )}

      {/* Sidebar */}
      <div className={`
        fixed right-0 top-0 h-full w-80 bg-white shadow-xl z-50 transform transition-transform duration-300 ease-in-out
        md:relative md:translate-x-0 md:shadow-none
        ${isMobileMenuOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}
      `}>
        <div className="flex flex-col h-full">
          {/* Tab Navigation */}
          <div className="border-b border-gray-200 p-4">
            <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setActiveTab('sessions')}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'sessions'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Sessions
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'settings'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Settings
              </button>
            </div>
          </div>

          {/* Tab Content */}
          {activeTab === 'sessions' && (
            <SessionHistory sessions={sessions} isLoading={false} isMobile={true} />
          )}
          {activeTab === 'settings' && <Settings />}
        </div>
      </div>
    </div>
  );
}