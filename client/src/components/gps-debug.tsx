import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { MapPin, RefreshCw, Play, Square, Upload, Copy } from "lucide-react";
import { kmlSimulator } from "@/utils/kmlParser";
import debugRouteKML from "@assets/debugRoute_1751599142866.kml?raw";

interface GPSDebugProps {
  location: { lat: number; lng: number; accuracy?: number } | null;
  error: string | null;
  isWatching: boolean;
  onTestGPS: () => void;
  onLocationUpdate?: (location: { lat: number; lng: number; accuracy?: number }) => void;
}

export default function GPSDebug({ location, error, isWatching, onTestGPS, onLocationUpdate }: GPSDebugProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [kmlLoaded, setKmlLoaded] = useState(false);
  const [simulationProgress, setSimulationProgress] = useState({ current: 0, total: 0, percentage: 0 });
  const [permissionRequested, setPermissionRequested] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  
  useEffect(() => {
    // Load KML file on component mount
    const loadKML = async () => {
      try {
        await kmlSimulator.loadKMLFile(debugRouteKML);
        setKmlLoaded(true);
      } catch (error) {
        console.error('Failed to load KML file:', error);
      }
    };
    
    loadKML();
    
    // Update progress periodically
    const progressInterval = setInterval(() => {
      setSimulationProgress(kmlSimulator.getCurrentProgress());
    }, 500);
    
    return () => {
      clearInterval(progressInterval);
    };
  }, []);

  // Set up callback whenever onLocationUpdate changes
  useEffect(() => {
    console.log('🔗 GPS Debug: useEffect triggered, onLocationUpdate available:', !!onLocationUpdate);
    if (onLocationUpdate) {
      console.log('🔗 GPS Debug: Setting up KML location callback');
      kmlSimulator.setLocationCallback(onLocationUpdate);
      console.log('🔗 GPS Debug: Callback set successfully');
    } else {
      console.warn('⚠️ GPS Debug: No onLocationUpdate callback provided');
    }
  }, [onLocationUpdate]);

  const requestGPSPermission = async () => {
    try {
      setPermissionRequested(true);
      console.log('🔐 Requesting GPS permission for Replit app...');
      
      if (!navigator.geolocation) {
        throw new Error('Geolocation is not supported by this browser/app');
      }

      // Request permission explicitly
      const permission = await navigator.permissions.query({name: 'geolocation'});
      console.log('📍 Current permission state:', permission.state);
      
      // Try to get current position to trigger permission request
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          resolve,
          reject,
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
          }
        );
      });
      
      console.log('✅ GPS permission granted, got position:', position.coords.latitude, position.coords.longitude);
      
      // Trigger the test GPS function to start watching
      onTestGPS();
      
    } catch (error) {
      console.error('❌ GPS permission failed:', error);
    }
  };

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy URL:', error);
    }
  };

  if (!isVisible) {
    return (
      <div className="fixed top-20 right-4 z-[1001]">
        <Button
          onClick={() => setIsVisible(true)}
          size="sm"
          variant="outline"
          className="bg-white/90 backdrop-blur-sm"
        >
          GPS Debug
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed top-20 right-4 z-[1001] bg-white/95 backdrop-blur-sm shadow-lg rounded-lg border border-gray-200 p-4 max-w-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-sm">GPS Status</h3>
        <Button
          onClick={() => setIsVisible(false)}
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0"
        >
          ×
        </Button>
      </div>
      
      <div className="space-y-2 text-xs">
        <div>
          <strong>Status:</strong> {isWatching ? 'Active' : 'Inactive'}
        </div>
        
        <div>
          <strong>Permission:</strong> {!location || location.lat === -27.4445 ? 'Test coordinates - Need real GPS' : 'Real GPS active'}
        </div>
        
        <div className="text-xs text-gray-600 mt-2 p-2 bg-yellow-50 rounded border">
          <strong>Replit App GPS Issue:</strong> The Replit mobile app may not support GPS permissions. Try opening this in your phone's browser instead:
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 break-all text-blue-600 text-xs">
              {window.location.href}
            </div>
            <Button
              onClick={copyUrl}
              size="sm"
              variant="outline"
              className="h-6 px-2 text-xs"
            >
              <Copy size={10} />
              {urlCopied ? 'Copied!' : 'Copy'}
            </Button>
          </div>
        </div>
        
        {location && (
          <div>
            <strong>Location:</strong><br/>
            Lat: {location.lat.toFixed(8)}<br/>
            Lng: {location.lng.toFixed(8)}<br/>
            Accuracy: ±{location.accuracy ? Math.round(location.accuracy) : '?'}m
          </div>
        )}
        
        {error && (
          <div className="text-red-600">
            <strong>Error:</strong> {error}
          </div>
        )}
        
        <div>
          <strong>Environment:</strong><br/>
          Host: {window.location.hostname}<br/>
          Protocol: {window.location.protocol}<br/>
          HTTPS: {window.location.protocol === 'https:' ? 'Yes' : 'No'}
        </div>
        
        <div className="pt-2 border-t space-y-2">
          {(!location || location.lat === -27.4445) && (
            <Button
              onClick={requestGPSPermission}
              size="sm"
              className="w-full flex items-center gap-2 bg-blue-600 hover:bg-blue-700"
              disabled={permissionRequested}
            >
              <MapPin size={12} />
              {permissionRequested ? 'Requesting...' : 'Enable GPS for Replit App'}
            </Button>
          )}
          
          <Button
            onClick={onTestGPS}
            size="sm"
            className="w-full flex items-center gap-2"
          >
            <RefreshCw size={12} />
            Test GPS Now
          </Button>
          
          {kmlLoaded && (
            <div className="space-y-2">
              <div className="text-xs font-medium">KML Route Simulation</div>
              <div className="text-xs text-gray-500">
                {simulationProgress.total} points loaded
                {simulationProgress.total > 0 && (
                  <div>Progress: {simulationProgress.current}/{simulationProgress.total} ({simulationProgress.percentage.toFixed(1)}%)</div>
                )}
              </div>
              
              <div className="flex gap-1">
                <Button
                  onClick={() => {
                    // Ensure callback is set before starting
                    if (onLocationUpdate) {
                      console.log('🔗 GPS Debug: Re-setting KML location callback before start');
                      kmlSimulator.setLocationCallback(onLocationUpdate);
                    }
                    kmlSimulator.startSimulation(2);
                  }}
                  size="sm"
                  className="flex-1 flex items-center gap-1 h-8"
                  disabled={kmlSimulator.isSimulationRunning()}
                >
                  <Play size={10} />
                  Start
                </Button>
                <Button
                  onClick={() => kmlSimulator.stopSimulation()}
                  size="sm"
                  variant="outline"
                  className="flex-1 flex items-center gap-1 h-8"
                  disabled={!kmlSimulator.isSimulationRunning()}
                >
                  <Square size={10} />
                  Stop
                </Button>
              </div>
              
              <div className="flex gap-1 mt-2">
                <Button
                  onClick={() => {
                    // Emit event to show KML route on map
                    const showRouteEvent = new CustomEvent('show-kml-route', {
                      detail: { show: true }
                    });
                    window.dispatchEvent(showRouteEvent);
                    console.log('🗺️ Requested to show KML route on map');
                  }}
                  size="sm"
                  variant="secondary"
                  className="flex-1 flex items-center gap-1 h-8"
                >
                  Show Route
                </Button>
                <Button
                  onClick={() => {
                    // Emit event to hide KML route on map
                    const hideRouteEvent = new CustomEvent('show-kml-route', {
                      detail: { show: false }
                    });
                    window.dispatchEvent(hideRouteEvent);
                    console.log('🗺️ Requested to hide KML route on map');
                  }}
                  size="sm"
                  variant="outline"
                  className="flex-1 flex items-center gap-1 h-8"
                >
                  Hide Route
                </Button>
              </div>
              
              <div className="text-xs text-gray-500">
                Simulates real GPS movement from Brisbane route data for testing map rotation
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}