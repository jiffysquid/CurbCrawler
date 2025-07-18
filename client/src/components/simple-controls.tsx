import { Button } from "@/components/ui/button";
import { Play, Square, Monitor, MonitorOff } from "lucide-react";
import { useWakeLock } from "@/hooks/use-wake-lock";
import { useToast } from "@/hooks/use-toast";

interface SimpleControlsProps {
  isRecording: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  location: { lat: number; lng: number; accuracy?: number } | null;
  currentSuburb?: string;
  recordingStats?: { duration: string; distance: string; cost: string };
}

export default function SimpleControls({
  isRecording,
  onStartRecording,
  onStopRecording,
  location,
  currentSuburb = 'Unknown',
  recordingStats
}: SimpleControlsProps) {
  const { toast } = useToast();
  const { isSupported: wakeLockSupported, isActive: wakeLockActive, requestWakeLock, releaseWakeLock } = useWakeLock();

  const handleStartRecording = async () => {
    onStartRecording();
    
    // Automatically activate wake lock when recording starts
    if (wakeLockSupported) {
      const success = await requestWakeLock();
      if (success) {
        toast({
          title: "Recording Started",
          description: "Location tracking active. Screen will stay on.",
        });
      } else {
        toast({
          title: "Recording Started", 
          description: "Location tracking active.",
        });
      }
    } else {
      toast({
        title: "Recording Started",
        description: "Location tracking active.",
      });
    }
  };

  const handleStopRecording = async () => {
    onStopRecording();
    
    // Release wake lock when recording stops
    if (wakeLockActive) {
      await releaseWakeLock();
    }
    
    toast({
      title: "Recording Stopped",
      description: "Session saved. Screen sleep enabled.",
    });
  };

  const toggleWakeLock = async () => {
    if (wakeLockActive) {
      await releaseWakeLock();
      toast({
        title: "Screen Sleep Enabled",
        description: "Phone can now turn off automatically.",
      });
    } else {
      const success = await requestWakeLock();
      if (success) {
        toast({
          title: "Screen Always On",
          description: "Phone screen will stay on.",
        });
      } else {
        toast({
          title: "Wake Lock Failed",
          description: "Could not keep screen on. Try again.",
          variant: "destructive"
        });
      }
    }
  };
  return (
    <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-[1000]">
      <div className="bg-white/95 backdrop-blur-sm shadow-lg rounded-full border border-gray-200 px-6 py-3">
        <div className="flex items-center gap-4">
          {!isRecording ? (
            <Button
              onClick={handleStartRecording}
              className="bg-green-600 hover:bg-green-700 text-white rounded-full px-6 py-2 flex items-center gap-2 disabled:bg-gray-400"
              disabled={!location}
              title={!location ? "Waiting for GPS location..." : "Start recording your route"}
            >
              <Play size={16} />
              {!location ? "Getting GPS..." : "Start"}
            </Button>
          ) : (
            <div className="flex items-center gap-4">
              <Button
                onClick={handleStopRecording}
                className="bg-red-600 hover:bg-red-700 text-white rounded-full w-10 h-10 flex items-center justify-center p-0"
                title="Stop recording"
              >
                <Square size={16} />
              </Button>
              
              {/* Recording Stats */}
              {recordingStats && (
                <div className="flex items-center gap-3 text-sm font-medium">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                    <span>{recordingStats.duration}</span>
                  </div>
                  <div className="text-gray-500">|</div>
                  <div className="text-blue-600">{recordingStats.distance}</div>
                  {recordingStats.cost && (
                    <>
                      <div className="text-gray-500">|</div>
                      <div className="text-green-600">${recordingStats.cost}</div>
                    </>
                  )}

                </div>
              )}
              
              {/* Debug: Show when recordingStats is null/undefined */}
              {!recordingStats && isRecording && (
                <div className="text-xs text-gray-400">
                  Stats loading...
                </div>
              )}
            </div>
          )}
          
          {/* Wake Lock Toggle - only show when supported and not recording */}
          {wakeLockSupported && !isRecording && (
            <Button
              onClick={toggleWakeLock}
              variant={wakeLockActive ? "default" : "outline"}
              className="rounded-full px-3 py-2"
              title={wakeLockActive ? "Disable screen always on" : "Keep screen always on"}
            >
              {wakeLockActive ? <Monitor size={16} /> : <MonitorOff size={16} />}
            </Button>
          )}
          
          {/* GPS Info - only show when not recording */}
          {!isRecording && location && (
            <div className="text-xs text-gray-500 hidden sm:block">
              GPS: {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
              {location.accuracy && ` (±${Math.round(location.accuracy)}m)`}
            </div>
          )}
          
          {!isRecording && !location && (
            <div className="text-xs text-red-500 hidden sm:block">
              Waiting for GPS...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}