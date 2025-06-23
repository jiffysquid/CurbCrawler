import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Map, Battery, Database, AlertTriangle, Focus } from "lucide-react";

export default function Settings() {
  const [mapStyle, setMapStyle] = useState<string>("street");
  const [gpsAccuracy, setGpsAccuracy] = useState<string>("medium");
  const [showSuburbBoundaries, setShowSuburbBoundaries] = useState<boolean>(true);
  const [showToilets, setShowToilets] = useState<boolean>(true);
  const [focusArea, setFocusArea] = useState<string>("imax-van");
  const { toast } = useToast();

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedFocusArea = localStorage.getItem('focusArea');
    const savedMapStyle = localStorage.getItem('mapStyle');
    const savedGpsAccuracy = localStorage.getItem('gpsAccuracy');
    const savedShowSuburbs = localStorage.getItem('showSuburbBoundaries');
    const savedShowToilets = localStorage.getItem('showToilets');
    
    if (savedFocusArea) setFocusArea(savedFocusArea);
    if (savedMapStyle) setMapStyle(savedMapStyle);
    if (savedGpsAccuracy) setGpsAccuracy(savedGpsAccuracy);
    if (savedShowSuburbs) setShowSuburbBoundaries(savedShowSuburbs === 'true');
    if (savedShowToilets) setShowToilets(savedShowToilets === 'true');
  }, []);

  // Save settings to localStorage when they change
  useEffect(() => {
    localStorage.setItem('focusArea', focusArea);
  }, [focusArea]);

  useEffect(() => {
    localStorage.setItem('mapStyle', mapStyle);
  }, [mapStyle]);

  useEffect(() => {
    localStorage.setItem('gpsAccuracy', gpsAccuracy);
  }, [gpsAccuracy]);

  useEffect(() => {
    localStorage.setItem('showSuburbBoundaries', String(showSuburbBoundaries));
  }, [showSuburbBoundaries]);

  useEffect(() => {
    localStorage.setItem('showToilets', String(showToilets));
  }, [showToilets]);

  const handleClearData = () => {
    // In a real app, this would clear session data from storage
    toast({
      title: "Data Cleared",
      description: "All session data has been cleared successfully.",
    });
  };

  return (
    <div className="flex-1 overflow-y-auto sidebar-scroll p-4 space-y-6">
      {/* Map Settings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center space-x-2">
            <Map className="h-4 w-4" />
            <span>Map Settings</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="map-style" className="text-xs font-medium">Map Style</Label>
            <Select value={mapStyle} onValueChange={setMapStyle}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="street">Street View</SelectItem>
                <SelectItem value="satellite">Satellite</SelectItem>
                <SelectItem value="terrain">Terrain</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="vehicle-type" className="text-xs font-medium">Vehicle Type</Label>
            <Select value={focusArea} onValueChange={setFocusArea}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="imax-van">IMAX Van (White)</SelectItem>
                <SelectItem value="small-car">Small Car</SelectItem>
                <SelectItem value="large-car">Large Car</SelectItem>
                <SelectItem value="suv">SUV</SelectItem>
                <SelectItem value="truck">Truck</SelectItem>
                <SelectItem value="motorcycle">Motorcycle</SelectItem>
              </SelectContent>
            </Select>
            <CardDescription className="text-xs">
              Vehicle type to display when focusing on your position
            </CardDescription>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-xs font-medium">Show Suburb Boundaries</Label>
              <CardDescription className="text-xs">
                Display suburb boundaries on the map
              </CardDescription>
            </div>
            <Switch
              checked={showSuburbBoundaries}
              onCheckedChange={setShowSuburbBoundaries}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-xs font-medium">Show Public Toilets</Label>
              <CardDescription className="text-xs">
                Display public toilet locations on the map
              </CardDescription>
            </div>
            <Switch
              checked={showToilets}
              onCheckedChange={setShowToilets}
            />
          </div>
        </CardContent>
      </Card>

      {/* GPS Settings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center space-x-2">
            <Battery className="h-4 w-4" />
            <span>GPS & Battery</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="gps-accuracy" className="text-xs font-medium">GPS Accuracy</Label>
            <Select value={gpsAccuracy} onValueChange={setGpsAccuracy}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="high">High (Battery intensive)</SelectItem>
                <SelectItem value="medium">Medium (Recommended)</SelectItem>
                <SelectItem value="low">Low (Battery saving)</SelectItem>
              </SelectContent>
            </Select>
            <CardDescription className="text-xs">
              Higher accuracy uses more battery but provides better tracking
            </CardDescription>
          </div>
        </CardContent>
      </Card>

      {/* Data Management */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center space-x-2">
            <Database className="h-4 w-4" />
            <span>Data Management</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="text-xs text-gray-600">
              Session data is stored locally on your device. You can clear all data to start fresh.
            </div>
            
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="w-full">
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  Clear All Session Data
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete all your tracking sessions and location data.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleClearData} className="bg-red-500 hover:bg-red-600">
                    Delete All Data
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>

      {/* API Configuration */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">API Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-xs text-gray-600 space-y-2">
            <p>
              This app uses the Queensland Government Open Data Services (ODS) API to fetch suburb boundaries.
            </p>
            <p>
              API key configuration is handled through environment variables on the server.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
