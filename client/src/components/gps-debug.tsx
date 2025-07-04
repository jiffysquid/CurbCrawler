import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { MapPin, RefreshCw, Play, Square, Upload } from "lucide-react";
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
    if (onLocationUpdate) {
      console.log('🔗 GPS Debug: Setting up KML location callback');
      kmlSimulator.setLocationCallback(onLocationUpdate);
    } else {
      console.warn('⚠️ GPS Debug: No onLocationUpdate callback provided');
    }
  }, [onLocationUpdate]);

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