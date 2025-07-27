import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Route, AlertTriangle, Clock, MapPin, Calendar } from "lucide-react";
import { clearAllPersistentPaths, loadPersistentPaths, PersistentPath } from "@/lib/utils";

export default function PathManagement() {
  const [pathColorScheme, setPathColorScheme] = useState<string>("bright");
  const [savedPaths, setSavedPaths] = useState<PersistentPath[]>([]);
  const { toast } = useToast();

  // Helper function to format date and time
  const formatDateTime = (isoString: string) => {
    const date = new Date(isoString);
    return {
      date: date.toLocaleDateString('en-AU', { 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric' 
      }),
      time: date.toLocaleTimeString('en-AU', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false
      })
    };
  };

  // Helper function to format duration
  const formatDuration = (minutes: number) => {
    if (minutes < 1) {
      // Less than 1 minute - show seconds
      const seconds = Math.round(minutes * 60);
      return `${seconds}s`;
    } else if (minutes < 60) {
      // Less than 1 hour - show minutes and seconds
      const mins = Math.floor(minutes);
      const secs = Math.round((minutes - mins) * 60);
      if (secs > 0) {
        return `${mins}m ${secs}s`;
      } else {
        return `${mins}m`;
      }
    } else {
      // 1 hour or more - show hours and minutes
      const hours = Math.floor(minutes / 60);
      const mins = Math.round(minutes % 60);
      if (mins > 0) {
        return `${hours}h ${mins}m`;
      } else {
        return `${hours}h`;
      }
    }
  };

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedPathColorScheme = localStorage.getItem('pathColorScheme');
    if (savedPathColorScheme) setPathColorScheme(savedPathColorScheme);
    
    // Load saved paths
    setSavedPaths(loadPersistentPaths());
  }, []);

  // Listen for storage changes to update saved paths when new ones are added
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'persistentPaths') {
        console.log('📍 PathManagement: Persistent paths updated, refreshing list');
        setSavedPaths(loadPersistentPaths());
      }
    };

    // Listen for custom events from same tab
    const handleCustomStorageEvent = (e: Event) => {
      const storageEvent = e as CustomEvent;
      if (storageEvent.detail?.key === 'persistentPaths') {
        console.log('📍 PathManagement: Same-tab persistent paths updated, refreshing list');
        setSavedPaths(loadPersistentPaths());
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('customStorageEvent', handleCustomStorageEvent);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('customStorageEvent', handleCustomStorageEvent);
    };
  }, []);

  // Save path color scheme to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('pathColorScheme', pathColorScheme);
    // Trigger storage event for same-tab communication
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'pathColorScheme',
      newValue: pathColorScheme,
      storageArea: localStorage
    }));
  }, [pathColorScheme]);

  const handleClearPaths = () => {
    clearAllPersistentPaths();
    // Also clear all map pins
    localStorage.removeItem('mapPins');  
    setSavedPaths([]);
    
    // Trigger both storage events for comprehensive updating
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'persistentPaths',
      newValue: '[]',
      storageArea: localStorage
    }));
    window.dispatchEvent(new CustomEvent('customStorageEvent', {
      detail: { key: 'persistentPaths', action: 'clear' }
    }));
    
    // Trigger pin clearing events
    window.dispatchEvent(new CustomEvent('customStorageEvent', {
      detail: { key: 'mapPins', action: 'clear' }
    }));
    
    toast({
      title: "Paths & Pins Cleared",
      description: "All recorded paths and dropped pins have been cleared successfully.",
    });
  };

  return (
    <div className="p-4 space-y-4">
      {/* Path Management */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center space-x-2">
            <Route className="h-4 w-4" />
            <span>Path Management</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="path-color-scheme" className="text-xs font-medium">Path Color Scheme</Label>
            <Select 
              value={pathColorScheme} 
              onValueChange={(value) => {
                console.log('Path color scheme changed to:', value);
                setPathColorScheme(value);
              }}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select color scheme" />
              </SelectTrigger>
              <SelectContent className="z-[9999]">
                <SelectItem value="bright">Bright Colors (Cycle through 8 colors)</SelectItem>
                <SelectItem value="fade">Fade with Age (Newer paths brighter)</SelectItem>
              </SelectContent>
            </Select>
            <CardDescription className="text-xs">
              Choose how recorded paths are colored on the map
            </CardDescription>
          </div>
          
          <div className="space-y-3">
            <div className="text-xs text-gray-600">
              All recorded paths are saved permanently until manually deleted. They appear on the map using the selected color scheme.
            </div>
            
            {/* Saved Paths List */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Recent Sessions ({savedPaths.length})</Label>
              {savedPaths.length === 0 ? (
                <div className="text-xs text-gray-500 italic">No recorded sessions yet</div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {savedPaths.slice().reverse().map((path, index) => {
                    const { date, time } = formatDateTime(path.date);
                    const distanceKm = path.distance ? path.distance.toFixed(1) : '0.0';
                    const duration = formatDuration(path.duration || 0);
                    
                    return (
                      <div key={path.id} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <div className="font-medium text-sm text-gray-900 dark:text-gray-100">
                              {path.name}
                            </div>
                            <div className="flex items-center space-x-3 mt-1 text-xs text-gray-600 dark:text-gray-400">
                              <div className="flex items-center space-x-1">
                                <Calendar className="h-3 w-3" />
                                <span>{date}</span>
                              </div>
                              <div className="flex items-center space-x-1">
                                <Clock className="h-3 w-3" />
                                <span>{time}</span>
                              </div>
                            </div>
                          </div>
                          <div 
                            className="w-4 h-4 rounded-full border-2 border-white shadow-sm flex-shrink-0"
                            style={{ backgroundColor: path.color }}
                          />
                        </div>
                        
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center space-x-3">
                            <div className="flex items-center space-x-1 text-gray-600 dark:text-gray-400">
                              <MapPin className="h-3 w-3" />
                              <span>{distanceKm} km</span>
                            </div>
                            <div className="flex items-center space-x-1 text-gray-600 dark:text-gray-400">
                              <Clock className="h-3 w-3" />
                              <span>{duration}</span>
                            </div>
                          </div>
                          <div className="text-gray-500 dark:text-gray-400">
                            {path.coordinates?.length || 0} points
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="w-full">
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  Clear All Recorded Paths
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear All Recorded Paths</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete all recorded paths from your device. 
                    This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleClearPaths} className="bg-red-600 hover:bg-red-700">
                    Delete All Paths
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}