import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import Map from "@/components/map";
import SessionControls from "@/components/session-controls";
import SessionHistory from "@/components/session-history";
import Settings from "@/components/settings";
import { useGeolocation } from "@/hooks/use-geolocation";
import { useToast } from "@/hooks/use-toast";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Session, SessionWithStats, LocationPoint } from "@shared/schema";

// Utility functions
const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371; // Radius of the Earth in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

const formatDuration = (minutes: number): string => {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
};

type TabType = 'sessions' | 'settings';

export default function Home() {
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [sessionLocations, setSessionLocations] = useState<LocationPoint[]>([]);
  const [currentSuburb, setCurrentSuburb] = useState<string>('');
  const [activeTab, setActiveTab] = useState<TabType>('sessions');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  const { location, error: locationError, startWatching, stopWatching } = useGeolocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch active session on mount
  const { data: activeSession, isLoading: isLoadingActiveSession } = useQuery<Session | null>({
    queryKey: ['/api/sessions/active'],
  });

  // Fetch all sessions for history
  const { data: sessions = [], isLoading: isLoadingSessions } = useQuery<SessionWithStats[]>({
    queryKey: ['/api/sessions'],
  });

  // Create new session mutation
  const createSessionMutation = useMutation({
    mutationFn: async (sessionData: any) => {
      const response = await apiRequest('POST', '/api/sessions', sessionData);
      return response.json();
    },
    onSuccess: (newSession) => {
      setCurrentSession(newSession);
      queryClient.invalidateQueries({ queryKey: ['/api/sessions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/sessions/active'] });
      toast({
        title: "Session Started",
        description: "Tracking session has been started successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to start tracking session.",
        variant: "destructive",
      });
    }
  });

  // Update session mutation
  const updateSessionMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: any }) => {
      const response = await apiRequest('PATCH', `/api/sessions/${id}`, updates);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sessions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/sessions/active'] });
      toast({
        title: "Session Updated",
        description: "Session has been updated successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update session.",
        variant: "destructive",
      });
    }
  });

  // Add location mutation
  const addLocationMutation = useMutation({
    mutationFn: async (locationData: any) => {
      const response = await apiRequest('POST', '/api/locations', locationData);
      return response.json();
    },
    onSuccess: (newLocation) => {
      setSessionLocations(prev => [...prev, {
        lat: newLocation.latitude,
        lng: newLocation.longitude,
        timestamp: newLocation.timestamp,
        suburb: newLocation.suburb,
        accuracy: newLocation.accuracy
      }]);
    }
  });

  // Suburb lookup mutation
  const suburbLookupMutation = useMutation({
    mutationFn: async ({ lat, lng }: { lat: number; lng: number }) => {
      const response = await fetch(`/api/suburbs/lookup?lat=${lat}&lng=${lng}`);
      if (!response.ok) throw new Error('Failed to lookup suburb');
      return response.json();
    },
    onSuccess: (data) => {
      // Only update suburb if it's different to prevent loops
      if (data.suburb && data.suburb !== currentSuburb) {
        setCurrentSuburb(data.suburb);
      }
    }
  });

  // Show location permission error
  useEffect(() => {
    if (locationError) {
      toast({
        title: "Location Error",
        description: locationError,
        variant: "destructive",
      });
    }
  }, [locationError]);

  const handleStartSession = () => {
    if (!location) {
      toast({
        title: "Location Required",
        description: "Please allow location access to start tracking.",
        variant: "destructive",
      });
      return;
    }

    // Lookup suburb for current location
    suburbLookupMutation.mutate({ lat: location.lat, lng: location.lng });

    const sessionData = {
      startTime: new Date().toISOString(),
      isActive: true,
      startLocation: {
        lat: location.lat,
        lng: location.lng,
        suburb: currentSuburb
      },
      routeCoordinates: [],
      suburbsVisited: currentSuburb ? [currentSuburb] : []
    };

    createSessionMutation.mutate(sessionData);
    startWatching();
  };

  const handleStopSession = () => {
    if (!currentSession || !location) return;

    const endTime = new Date().toISOString();
    const startTime = new Date(currentSession.startTime);
    const duration = Math.round((new Date(endTime).getTime() - startTime.getTime()) / (1000 * 60));
    
    // Calculate distance from route coordinates
    const distance = calculateRouteDistance(sessionLocations);
    
    // Get unique suburbs visited
    const uniqueSuburbs = Array.from(new Set(sessionLocations.map(loc => loc.suburb).filter(Boolean)));

    const updates = {
      endTime,
      duration,
      distance,
      isActive: false,
      endLocation: {
        lat: location.lat,
        lng: location.lng,
        suburb: currentSuburb
      },
      routeCoordinates: sessionLocations,
      suburbsVisited: uniqueSuburbs
    };

    updateSessionMutation.mutate({ id: currentSession.id, updates });
    setCurrentSession(null);
    setSessionLocations([]);
    stopWatching();
  };

  const calculateRouteDistance = (locations: LocationPoint[]): number => {
    if (locations.length < 2) return 0;
    
    let totalDistance = 0;
    for (let i = 1; i < locations.length; i++) {
      const distance = calculateDistance(
        locations[i-1].lat, locations[i-1].lng,
        locations[i].lat, locations[i].lng
      );
      totalDistance += distance;
    }
    return Math.round(totalDistance * 1000); // Convert to meters
  };

  // Simplified session state - use activeSession directly without causing loops
  const isTracking = Boolean(activeSession?.isActive || currentSession?.isActive);



  const stats = {
    duration: currentSession ? formatDuration(Math.round((Date.now() - new Date(currentSession.startTime).getTime()) / (1000 * 60))) : '0m',
    distance: sessionLocations.length > 0 ? `${Math.round(calculateRouteDistance(sessionLocations))}m` : '0m',
    suburbs: new Set(sessionLocations.map(loc => loc.suburb).filter(Boolean)).size
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
        
        {/* Session Controls Overlay */}
        <div className="absolute top-4 left-4 right-4 md:right-auto md:w-80 z-10">
          <SessionControls
            isTracking={isTracking}
            currentSuburb={currentSuburb}
            stats={stats}
            location={location}
            onStartSession={handleStartSession}
            onStopSession={handleStopSession}
            isLoading={createSessionMutation.isPending || updateSessionMutation.isPending}
          />
        </div>

        {/* Mobile Menu Button */}
        <div className="absolute top-4 right-4 z-20 md:hidden">
          <Button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            size="sm"
            variant="outline"
            className="bg-white/90 backdrop-blur-sm"
          >
            {isMobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Desktop Sidebar */}
      <div className="hidden md:block w-96 border-l bg-card/95 backdrop-blur-sm overflow-hidden">
        <div className="h-full flex flex-col">
          {/* Tab Navigation */}
          <div className="border-b bg-muted/50">
            <div className="flex">
              <button
                onClick={() => setActiveTab('sessions')}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'sessions'
                    ? 'text-primary border-b-2 border-primary bg-background'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Sessions
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'settings'
                    ? 'text-primary border-b-2 border-primary bg-background'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Settings
              </button>
            </div>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-hidden">
            {activeTab === 'sessions' ? (
              <SessionHistory 
                sessions={sessions} 
                isLoading={isLoadingSessions}
              />
            ) : (
              <Settings />
            )}
          </div>
        </div>
      </div>

      {/* Mobile Sidebar */}
      {isMobileMenuOpen && (
        <div className="absolute inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setIsMobileMenuOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-80 bg-background border-l shadow-lg">
            <div className="h-full flex flex-col">
              {/* Tab Navigation */}
              <div className="border-b bg-muted/50">
                <div className="flex">
                  <button
                    onClick={() => setActiveTab('sessions')}
                    className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                      activeTab === 'sessions'
                        ? 'text-primary border-b-2 border-primary bg-background'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Sessions
                  </button>
                  <button
                    onClick={() => setActiveTab('settings')}
                    className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                      activeTab === 'settings'
                        ? 'text-primary border-b-2 border-primary bg-background'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Settings
                  </button>
                </div>
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-hidden">
                {activeTab === 'sessions' ? (
                  <SessionHistory 
                    sessions={sessions} 
                    isLoading={isLoadingSessions}
                    isMobile={true}
                  />
                ) : (
                  <Settings />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}