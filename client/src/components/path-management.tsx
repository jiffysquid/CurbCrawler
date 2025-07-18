import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Route, AlertTriangle } from "lucide-react";
import { clearAllPersistentPaths, loadPersistentPaths } from "@/lib/utils";

export default function PathManagement() {
  const [pathColorScheme, setPathColorScheme] = useState<string>("bright");
  const [savedPaths, setSavedPaths] = useState<any[]>([]);
  const { toast } = useToast();

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedPathColorScheme = localStorage.getItem('pathColorScheme');
    if (savedPathColorScheme) setPathColorScheme(savedPathColorScheme);
    
    // Load saved paths
    setSavedPaths(loadPersistentPaths());
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
    setSavedPaths([]);
    // Trigger storage event to update the map
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'persistentPaths',
      newValue: null,
      storageArea: localStorage
    }));
    toast({
      title: "Paths Cleared",
      description: "All recorded paths have been cleared successfully.",
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
              <Label className="text-xs font-medium">Saved Paths ({savedPaths.length})</Label>
              {savedPaths.length === 0 ? (
                <div className="text-xs text-gray-500 italic">No saved paths yet</div>
              ) : (
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {savedPaths.map((path, index) => (
                    <div key={path.id} className="flex items-center justify-between p-2 bg-gray-50 rounded text-xs">
                      <div className="flex-1">
                        <div className="font-medium">{path.name}</div>
                        <div className="text-gray-500">
                          {path.date} • {path.distance ? (path.distance / 1000).toFixed(1) : '0.0'}km
                        </div>
                      </div>
                      <div 
                        className="w-3 h-3 rounded-full border border-gray-300"
                        style={{ backgroundColor: path.color }}
                      />
                    </div>
                  ))}
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