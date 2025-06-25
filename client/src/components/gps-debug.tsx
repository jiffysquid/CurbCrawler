import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MapPin, RefreshCw } from "lucide-react";

interface GPSDebugProps {
  location: { lat: number; lng: number; accuracy?: number } | null;
  error: string | null;
  isWatching: boolean;
  onTestGPS: () => void;
}

export default function GPSDebug({ location, error, isWatching, onTestGPS }: GPSDebugProps) {
  const [isVisible, setIsVisible] = useState(false);

  if (!isVisible) {
    return (
      <div className="fixed top-4 right-4 z-[1001]">
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
    <div className="fixed top-4 right-4 z-[1001] bg-white/95 backdrop-blur-sm shadow-lg rounded-lg border border-gray-200 p-4 max-w-sm">
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
        
        <div className="pt-2 border-t">
          <Button
            onClick={onTestGPS}
            size="sm"
            className="w-full flex items-center gap-2"
          >
            <RefreshCw size={12} />
            Test GPS Now
          </Button>
        </div>
      </div>
    </div>
  );
}