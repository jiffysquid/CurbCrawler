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

type TabType = 'sessions' | 'settings';

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabType>('sessions');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [sessionLocations, setSessionLocations] = useState<LocationPoint[]>([]);
  const [currentSuburb, setCurrentSuburb] = useState<string>('');
  
  const { location, error: locationError, startWatching, stopWatching } = useGeolocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch active session on mount
  const { data: activeSession, isLoading: isLoadingActiveSession } = useQuery({
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
      setCurrentSuburb(data.suburb || 'Unknown');
    }
  });

  // Set current session from active session query
  useEffect(() => {
    if (activeSession && !currentSession) {
      setCurrentSession(activeSession);
    }
  }, [activeSession, currentSession]);

  // Handle location updates
  useEffect(() => {
    if (location && currentSession) {
      // Add location to current session
      addLocationMutation.mutate({
        sessionId: currentSession.id,
        latitude: location.lat,
        longitude: location.lng,
        timestamp: new Date().toISOString(),
        accuracy: location.accuracy || undefined
      });

      // Lookup suburb for current location
      suburbLookupMutation.mutate({
        lat: location.lat,
        lng: location.lng
      });
    }
  }, [location, currentSession]);

  // Show location permission error
  useEffect(() => {
    if (locationError) {
      toast({
        title: "Location Error",
        description: locationError,
        variant: "destructive",
      });
    }
  }, [locationError, toast]);

  const handleStartSession = () => {
    if (!location) {
      toast({
        title: "Location Required",
        description: "Please allow location access to start tracking.",
        variant: "destructive",
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
      totalDistance += calculateDistance(
        locations[i-1].lat, locations[i-1].lng,
        locations[i].lat, locations[i].lng
      );
    }
    return Math.round(totalDistance * 100) / 100; // Round to 2 decimal places
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const getCurrentSessionStats = () => {
    if (!currentSession) return { duration: '00:00', distance: '0.0km', suburbs: 0 };

    const now = new Date();
    const startTime = new Date(currentSession.startTime);
    const durationMs = now.getTime() - startTime.getTime();
    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
    
    const distance = calculateRouteDistance(sessionLocations);
    const uniqueSuburbs = new Set(sessionLocations.map(loc => loc.suburb).filter(Boolean));

    return {
      duration: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`,
      distance: `${distance}km`,
      suburbs: uniqueSuburbs.size
    };
  };

  const stats = getCurrentSessionStats();
  const isTracking = !!currentSession?.isActive;

  return (
    <div className="relative h-screen overflow-hidden">
      {/* Map Container */}
      <Map
        currentLocation={location}
        sessionLocations={sessionLocations}
        currentSuburb={currentSuburb}
        isTracking={isTracking}
      />

      {/* Mobile Header */}
      <div className="absolute top-0 left-0 right-0 z-10 bg-white/95 backdrop-blur-sm border-b border-gray-200 px-4 py-3 md:hidden">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">Clearout Tracker</h1>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Session Controls */}
      <SessionControls
        isTracking={isTracking}
        currentSuburb={currentSuburb}
        stats={stats}
        location={location}
        onStartSession={handleStartSession}
        onStopSession={handleStopSession}
        isLoading={createSessionMutation.isPending || updateSessionMutation.isPending}
      />

      {/* Desktop Sidebar */}
      <div className="absolute top-0 right-0 h-full w-80 bg-white shadow-xl border-l border-gray-200 z-30 hidden md:block">
        {/* Sidebar Header */}
        <div className="bg-gray-900 text-white p-6">
          <h1 className="text-xl font-bold">Clearout Tracker</h1>
          <p className="text-gray-300 text-sm mt-1">Brisbane, QLD</p>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('sessions')}
            className={`flex-1 px-4 py-3 text-sm font-medium ${
              activeTab === 'sessions'
                ? 'text-primary border-b-2 border-primary bg-blue-50'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Sessions
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex-1 px-4 py-3 text-sm font-medium ${
              activeTab === 'settings'
                ? 'text-primary border-b-2 border-primary bg-blue-50'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Settings
          </button>
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

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div 
            className="absolute inset-0 bg-black/50" 
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <div className="absolute top-0 right-0 h-full w-80 bg-white shadow-xl transform transition-transform duration-300">
            <div className="p-4">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-semibold text-gray-900">Menu</h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
              
              {/* Mobile menu content - simplified version of desktop sidebar */}
              <div className="space-y-4">
                <SessionHistory
                  sessions={sessions}
                  isLoading={isLoadingSessions}
                  isMobile
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
