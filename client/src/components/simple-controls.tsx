import { Button } from "@/components/ui/button";
import { Play, Square } from "lucide-react";

interface SimpleControlsProps {
  isRecording: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  location: { lat: number; lng: number; accuracy?: number } | null;
}

export default function SimpleControls({
  isRecording,
  onStartRecording,
  onStopRecording,
  location
}: SimpleControlsProps) {
  return (
    <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-[1000]">
      <div className="bg-white/95 backdrop-blur-sm shadow-lg rounded-full border border-gray-200 px-6 py-3">
        <div className="flex items-center gap-4">
          {!isRecording ? (
            <Button
              onClick={onStartRecording}
              className="bg-green-600 hover:bg-green-700 text-white rounded-full px-6 py-2 flex items-center gap-2"
              disabled={!location}
            >
              <Play size={16} />
              Start
            </Button>
          ) : (
            <Button
              onClick={onStopRecording}
              className="bg-red-600 hover:bg-red-700 text-white rounded-full px-6 py-2 flex items-center gap-2"
            >
              <Square size={16} />
              Stop
            </Button>
          )}
          
          {location && (
            <div className="text-xs text-gray-500 hidden sm:block">
              GPS: {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
              {location.accuracy && ` (±${Math.round(location.accuracy)}m)`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}