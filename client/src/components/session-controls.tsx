import { Play, Square, MapPin, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface SessionControlsProps {
  isTracking: boolean;
  currentSuburb: string;
  stats: {
    duration: string;
    distance: string;
    suburbs: number;
  };
  location: { lat: number; lng: number; accuracy?: number } | null;
  onStartSession: () => void;
  onStopSession: () => void;
  isLoading: boolean;
  isRecording?: boolean;
  onStartRecording?: () => void;
  onStopRecording?: () => void;
}

export default function SessionControls({
  isTracking,
  currentSuburb,
  stats,
  location,
  onStartSession,
  onStopSession,
  isLoading,
  isRecording = false,
  onStartRecording,
  onStopRecording
}: SessionControlsProps) {
  return (
    <Card className="bg-white/95 backdrop-blur-sm shadow-lg border border-gray-200">
      <CardContent className="p-4">
          {/* Current Session Status */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600">Current Session</span>
              <div className="flex items-center space-x-1">
                <div className={`w-2 h-2 rounded-full ${isTracking ? 'bg-secondary pulse-dot' : 'bg-gray-400'}`} />
                <span className={`text-xs font-medium ${isTracking ? 'text-secondary' : 'text-gray-500'}`}>
                  {isTracking ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
            
            {/* Session Stats */}
            <div className="session-stats">
              <div className="bg-gray-50 rounded-lg p-2 text-center">
                <div className="text-lg font-semibold text-gray-900">{stats.duration}</div>
                <div className="text-xs text-gray-500">Duration</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-2 text-center">
                <div className="text-lg font-semibold text-gray-900">{stats.distance}</div>
                <div className="text-xs text-gray-500">Distance</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-2 text-center">
                <div className="text-lg font-semibold text-gray-900">{stats.suburbs}</div>
                <div className="text-xs text-gray-500">Suburbs</div>
              </div>
            </div>
          </div>

          {/* Control Buttons */}
          <div className="flex space-x-2 mb-3">
            {!isTracking ? (
              <Button
                onClick={onStartSession}
                disabled={isLoading || !location}
                className="flex-1 font-medium py-3 px-4 transition-all duration-200 flex items-center justify-center space-x-2 bg-green-600 hover:bg-green-700 text-white disabled:bg-gray-400"
              >
                <Play className="h-4 w-4" />
                <span>Start Session</span>
              </Button>
            ) : (
              <Button
                onClick={onStopSession}
                disabled={isLoading}
                className="flex-1 font-medium py-3 px-4 transition-all duration-200 flex items-center justify-center space-x-2 bg-red-600 hover:bg-red-700 text-white disabled:bg-gray-400"
              >
                <Square className="h-4 w-4" />
                <span>Stop Session</span>
              </Button>
            )}
          </div>
          
          {/* Recording Controls - Only show when session is active */}
          {isTracking && (
            <div className="flex space-x-2 mb-3">
              {!isRecording ? (
                <Button
                  onClick={onStartRecording}
                  disabled={isLoading || !location}
                  className="flex-1 font-medium py-3 px-4 transition-all duration-200 flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white disabled:bg-gray-400"
                >
                  <Circle className="h-4 w-4 fill-current" />
                  <span>Start Recording Path</span>
                </Button>
              ) : (
                <Button
                  onClick={onStopRecording}
                  disabled={isLoading}
                  className="flex-1 font-medium py-3 px-4 transition-all duration-200 flex items-center justify-center space-x-2 bg-gray-600 hover:bg-gray-700 text-white disabled:bg-gray-400"
                >
                  <Square className="h-4 w-4" />
                  <span>Stop Recording Path</span>
                </Button>
              )}
            </div>
          )}

          {/* Current Location & Recording Status */}
          <div className="p-3 bg-blue-50 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <MapPin className="h-4 w-4 text-primary" />
                <div>
                  <div className="text-sm font-medium text-gray-900">
                    {currentSuburb || 'Unknown Suburb'}
                  </div>
                  <div className="text-xs text-gray-500">Current Location</div>
                  {location && (
                    <div className="text-xs text-gray-400 mt-1">
                      {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
                      {location.accuracy && ` (±${Math.round(location.accuracy)}m)`}
                    </div>
                  )}
                </div>
              </div>
              {isRecording && (
                <div className="flex items-center space-x-1">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                  <span className="text-xs text-red-600 font-medium">Recording</span>
                </div>
              )}
            </div>
          </div>

          {/* Location permission warning */}
          {!location && (
            <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="text-xs text-amber-800">
                Location access required to start tracking sessions.
              </div>
            </div>
          )}
        </CardContent>
      </Card>
  );
}
