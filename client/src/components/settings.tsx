import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Map, Battery, AlertTriangle, Focus, DollarSign, Route } from "lucide-react";
import { clearAllPersistentPaths, loadPersistentPaths } from "@/lib/utils";

export default function Settings() {
  const [mapStyle, setMapStyle] = useState<string>("mapbox-custom");
  const [gpsAccuracy, setGpsAccuracy] = useState<string>("medium");
  const [showSuburbBoundaries, setShowSuburbBoundaries] = useState<boolean>(true);
  const [showToilets, setShowToilets] = useState<boolean>(false);
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [focusArea, setFocusArea] = useState<string>("imax-van");
  const [fuelPrice, setFuelPrice] = useState<string>("2.00");
  const [pathColorScheme, setPathColorScheme] = useState<string>("bright");
  const [savedPaths, setSavedPaths] = useState<any[]>([]);
  const { toast } = useToast();

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedFocusArea = localStorage.getItem('focusArea');
    const savedMapStyle = localStorage.getItem('mapStyle');
    const savedGpsAccuracy = localStorage.getItem('gpsAccuracy');
    const savedShowSuburbs = localStorage.getItem('showSuburbBoundaries');
    const savedShowToilets = localStorage.getItem('showToilets');
    const savedShowLabels = localStorage.getItem('showLabels');
    const savedFuelPrice = localStorage.getItem('fuelPrice');
    const savedPathColorScheme = localStorage.getItem('pathColorScheme');
    
    if (savedFocusArea) setFocusArea(savedFocusArea);
    if (savedMapStyle && ['openstreetmap', 'openstreetmap-no-labels', 'mapbox-streets', 'mapbox-satellite', 'mapbox-outdoors', 'mapbox-custom', 'cartodb-positron', 'cartodb-positron-no-labels', 'esri-world-imagery', 'esri-world-topo'].includes(savedMapStyle)) {
      setMapStyle(savedMapStyle);
    } else {
      setMapStyle('mapbox-custom'); // Default to custom Mapbox style
      localStorage.setItem('mapStyle', 'mapbox-custom'); // Clear invalid value
    }
    if (savedGpsAccuracy) setGpsAccuracy(savedGpsAccuracy);
    if (savedShowSuburbs !== null) {
      setShowSuburbBoundaries(savedShowSuburbs === 'true');
    } else {
      setShowSuburbBoundaries(true); // Default to showing suburbs
    }
    if (savedShowToilets !== null) {
      setShowToilets(savedShowToilets === 'true');
    } else {
      setShowToilets(false); // Default to hiding toilets
    }
    if (savedShowLabels !== null) {
      setShowLabels(savedShowLabels === 'true');
    } else {
      setShowLabels(true); // Default to showing labels
    }

    if (savedFuelPrice) setFuelPrice(savedFuelPrice);
    if (savedPathColorScheme) setPathColorScheme(savedPathColorScheme);
    
    // Load saved paths
    setSavedPaths(loadPersistentPaths());
  }, []);

  // Save settings to localStorage when they change
  useEffect(() => {
    localStorage.setItem('focusArea', focusArea);
    // Trigger storage event for same-tab communication
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'focusArea',
      newValue: focusArea,
      storageArea: localStorage
    }));
  }, [focusArea]);

  useEffect(() => {
    localStorage.setItem('mapStyle', mapStyle);
    // Trigger storage event for same-tab communication
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'mapStyle',
      newValue: mapStyle,
      storageArea: localStorage
    }));
  }, [mapStyle]);

  useEffect(() => {
    localStorage.setItem('gpsAccuracy', gpsAccuracy);
    // Trigger storage event for geolocation hook to pick up changes
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'gpsAccuracy',
      newValue: gpsAccuracy,
      storageArea: localStorage
    }));
    
    toast({
      title: "GPS Settings Updated",
      description: `GPS accuracy set to ${gpsAccuracy.charAt(0).toUpperCase() + gpsAccuracy.slice(1)}. Restart recording to apply changes.`,
    });
  }, [gpsAccuracy, toast]);

  useEffect(() => {
    localStorage.setItem('showSuburbBoundaries', String(showSuburbBoundaries));
    // Trigger storage event for same-tab communication
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'showSuburbBoundaries',
      newValue: String(showSuburbBoundaries),
      storageArea: localStorage
    }));
  }, [showSuburbBoundaries]);

  useEffect(() => {
    localStorage.setItem('showToilets', String(showToilets));
    // Trigger storage event for same-tab communication
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'showToilets',
      newValue: String(showToilets),
      storageArea: localStorage
    }));
  }, [showToilets]);

  useEffect(() => {
    localStorage.setItem('fuelPrice', fuelPrice);
    // Trigger storage event for same-tab communication
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'fuelPrice',
      newValue: fuelPrice,
      storageArea: localStorage
    }));
  }, [fuelPrice]);

  useEffect(() => {
    localStorage.setItem('pathColorScheme', pathColorScheme);
    // Trigger storage event for same-tab communication
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'pathColorScheme',
      newValue: pathColorScheme,
      storageArea: localStorage
    }));
  }, [pathColorScheme]);

  useEffect(() => {
    localStorage.setItem('showLabels', String(showLabels));
    // Trigger storage event for same-tab communication
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'showLabels',
      newValue: String(showLabels),
      storageArea: localStorage
    }));
  }, [showLabels]);

  const handleFuelPriceChange = (value: string) => {
    // Only allow valid decimal numbers
    if (/^\d*\.?\d{0,2}$/.test(value)) {
      setFuelPrice(value);
    }
  };



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
            <Label htmlFor="map-style" className="text-xs font-medium">Map Provider</Label>
            <Select 
              value={mapStyle} 
              onValueChange={(value) => {
                console.log('Map provider changed to:', value);
                setMapStyle(value);
              }}
              onOpenChange={(open) => {
                console.log('Map provider dropdown opened:', open);
              }}
            >
              <SelectTrigger className="h-9" onClick={() => console.log('Trigger clicked')}>
                <SelectValue placeholder="Select map provider" />
              </SelectTrigger>
              <SelectContent 
                className="z-[9999] max-h-[300px] bg-white border border-gray-200 shadow-lg"
                position="popper"
                sideOffset={5}
                onOpenAutoFocus={(e) => {
                  console.log('SelectContent opened');
                }}
              >
                <SelectItem value="openstreetmap">OpenStreetMap (Free)</SelectItem>
                <SelectItem value="openstreetmap-no-labels">OpenStreetMap No Labels</SelectItem>
                <SelectItem value="mapbox-streets">Mapbox Streets</SelectItem>
                <SelectItem value="mapbox-satellite">Mapbox Satellite</SelectItem>
                <SelectItem value="mapbox-outdoors">Mapbox Outdoors</SelectItem>
                <SelectItem value="mapbox-custom">Custom Mapbox Style</SelectItem>
                <SelectItem value="cartodb-positron">CartoDB Light</SelectItem>
                <SelectItem value="cartodb-positron-no-labels">CartoDB Light No Labels</SelectItem>
                <SelectItem value="esri-world-imagery">Esri Satellite</SelectItem>
                <SelectItem value="esri-world-topo">Esri Topographic</SelectItem>
              </SelectContent>
            </Select>
            <CardDescription className="text-xs">
              Mapbox provides high-quality tiles with better rotation support. No Labels versions prevent text rotation when map rotates.
            </CardDescription>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-xs font-medium">Show Map Labels</Label>
              <CardDescription className="text-xs">
                Display street names and labels (always horizontal)
              </CardDescription>
            </div>
            <Switch
              checked={showLabels}
              onCheckedChange={setShowLabels}
            />
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
              <Label className="text-xs font-medium">Show Public Toilets (within 5km)</Label>
              <CardDescription className="text-xs">
                Display public toilets within 5km of current location
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
                <SelectItem value="high">High (0.5s updates, Battery intensive)</SelectItem>
                <SelectItem value="medium">Medium (1s updates, Recommended)</SelectItem>
                <SelectItem value="low">Low (2.5s updates, Battery saving)</SelectItem>
              </SelectContent>
            </Select>
            <CardDescription className="text-xs">
              Higher accuracy uses more battery but provides better tracking
            </CardDescription>
          </div>
        </CardContent>
      </Card>

      {/* Cost Tracking */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center space-x-2">
            <DollarSign className="h-4 w-4" />
            <span>Cost Tracking</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fuel-price" className="text-xs font-medium">Fuel Price per Liter</Label>
            <div className="flex items-center space-x-2">
              <span className="text-sm">$</span>
              <Input
                id="fuel-price"
                type="text"
                value={fuelPrice}
                onChange={(e) => handleFuelPriceChange(e.target.value)}
                placeholder="2.00"
                className="h-9 flex-1"
              />
            </div>
            <CardDescription className="text-xs">
              Used to calculate fuel costs during recording sessions. Average car fuel consumption assumed at 8L/100km.
            </CardDescription>
          </div>
        </CardContent>
      </Card>

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
              onOpenChange={(open) => {
                console.log('Path color scheme dropdown opened:', open);
              }}
            >
              <SelectTrigger className="h-9" onClick={() => console.log('Path color scheme trigger clicked')}>
                <SelectValue placeholder="Select color scheme" />
              </SelectTrigger>
              <SelectContent 
                className="z-[9999] max-h-[300px] bg-white border border-gray-200 shadow-lg"
                position="popper"
                sideOffset={5}
              >
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
                        <div className="text-gray-500">{path.date} • {(path.distance / 1000).toFixed(1)}km</div>
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
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete all your recorded paths from the map.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleClearPaths} className="bg-red-500 hover:bg-red-600">
                    Delete All Paths
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
