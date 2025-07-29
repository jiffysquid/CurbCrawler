import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Map, Battery, AlertTriangle, Focus, DollarSign, Route, MapPin, Trash2 } from "lucide-react";
import { clearAllPersistentPaths, loadPersistentPaths, loadMapPins, clearAllMapPins, MapPin as Pin, eraseAllData } from "@/lib/utils";

interface SettingsProps {
  showSuburbBoundaries: boolean;
  setShowSuburbBoundaries: (show: boolean) => void;
  showToilets: boolean;
  setShowToilets: (show: boolean) => void;
}

export default function Settings({ showSuburbBoundaries, setShowSuburbBoundaries, showToilets, setShowToilets }: SettingsProps) {
  // Removed map style selection - only using custom Mapbox style
  const [gpsAccuracy, setGpsAccuracy] = useState<string>("smart");
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [focusArea, setFocusArea] = useState<string>("imax-van");
  const [fuelPrice, setFuelPrice] = useState<string>("2.00");
  const [pathColorScheme, setPathColorScheme] = useState<string>("bright");
  const [savedPaths, setSavedPaths] = useState<any[]>([]);
  const [mapPins, setMapPins] = useState<Pin[]>([]);
  const { toast } = useToast();

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedFocusArea = localStorage.getItem('focusArea');
    const savedGpsAccuracy = localStorage.getItem('gpsAccuracy');
    const savedShowLabels = localStorage.getItem('showLabels');
    const savedFuelPrice = localStorage.getItem('fuelPrice');
    const savedPathColorScheme = localStorage.getItem('pathColorScheme');
    
    if (savedFocusArea) setFocusArea(savedFocusArea);
    if (savedGpsAccuracy) setGpsAccuracy(savedGpsAccuracy);
    if (savedShowLabels !== null) {
      setShowLabels(savedShowLabels === 'true');
    } else {
      setShowLabels(true); // Default to showing labels
    }

    if (savedFuelPrice) setFuelPrice(savedFuelPrice);
    if (savedPathColorScheme) setPathColorScheme(savedPathColorScheme);
    
    // Load saved paths and pins
    setSavedPaths(loadPersistentPaths());
    setMapPins(loadMapPins());
    
    // Listen for storage changes to update pins
    const handleStorageChange = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.key === 'mapPins') {
        setMapPins(loadMapPins());
      }
    };
    
    window.addEventListener('customStorageEvent', handleStorageChange);
    
    return () => {
      window.removeEventListener('customStorageEvent', handleStorageChange);
    };
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

  // Removed map style storage - only using custom Mapbox style

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

  const handleClearPins = () => {
    clearAllMapPins();
    setMapPins([]);
    toast({
      title: "Pins Cleared",
      description: "All map pins have been deleted.",
    });
  };

  const handleEraseAllData = () => {
    console.log('🗑️ Settings: Erasing all data (paths, pins, totals, settings)...');
    
    // Erase everything using the utility function
    eraseAllData();
    
    // Reset local state
    setSavedPaths([]);
    setMapPins([]);
    
    // Reset all settings to defaults
    setGpsAccuracy("smart");
    setShowLabels(true);
    setFocusArea("imax-van");
    setFuelPrice("2.00");
    setPathColorScheme("bright");
    
    // Clear settings from localStorage
    localStorage.removeItem('focusArea');
    localStorage.removeItem('gpsAccuracy');
    localStorage.removeItem('showLabels');
    localStorage.removeItem('fuelPrice');
    localStorage.removeItem('pathColorScheme');
    
    console.log('✅ Settings: All data and settings erased successfully');
    
    toast({
      title: "All Data Erased",
      description: "All data and settings have been permanently deleted.",
      variant: "destructive",
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
            <Label htmlFor="vehicle-type" className="text-xs font-medium">Vehicle Type</Label>
            <Select value={focusArea} onValueChange={setFocusArea}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[9999]">
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
              <SelectContent className="z-[9999]">
                <SelectItem value="smart">Smart Rate (Auto-adjusts by speed, Default)</SelectItem>
                <SelectItem value="high">High (0.5s updates, Battery intensive)</SelectItem>
                <SelectItem value="medium">Medium (1s updates, Balanced)</SelectItem>
                <SelectItem value="low">Low (2.5s updates, Battery saving)</SelectItem>
              </SelectContent>
            </Select>
            <CardDescription className="text-xs">
              Smart Rate automatically adjusts GPS refresh based on speed: {'>'}80kph=low rate, {'>'}50kph=medium rate, {'<'}50kph=high rate
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

      {/* Pin Management */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center space-x-2">
            <MapPin className="h-4 w-4" />
            <span>Map Pins ({mapPins.length}/9)</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Manage your dropped pins on the map. Maximum 9 pins allowed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {mapPins.length > 0 ? (
            <div className="space-y-2">
              {mapPins.map((pin) => (
                <div key={pin.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div 
                      className="w-6 h-6 rounded-full text-white text-xs font-bold flex items-center justify-center"
                      style={{ backgroundColor: pin.color || '#3B82F6' }}
                    >
                      {pin.number}
                    </div>
                    <div>
                      <div className="text-sm font-medium">Pin {pin.number}</div>
                      <div className="text-xs text-gray-500">
                        {new Date(pin.createdAt).toLocaleDateString()}
                      </div>
                      <div className="text-xs text-gray-400">
                        {pin.lat.toFixed(4)}, {pin.lng.toFixed(4)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4 text-gray-500">
              <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No pins dropped yet</p>
              <p className="text-xs text-gray-400">Use the pin button on the map to drop pins</p>
            </div>
          )}
          
          {mapPins.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="w-full text-red-600 hover:text-red-700">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear All Pins
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear All Pins</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete all {mapPins.length} pins? This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleClearPins} className="bg-red-600 hover:bg-red-700">
                    Delete All Pins
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </CardContent>
      </Card>

      {/* Data Management */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center space-x-2">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <span>Data Management</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Permanently erase all data including total statistics
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="text-xs text-gray-600 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <div className="font-medium text-yellow-800 mb-1">⚠️ Warning</div>
              <div className="text-yellow-700">
                This will permanently delete all recorded paths, dropped pins, and total statistics. 
                This action cannot be undone and will reset the app to factory settings.
              </div>
            </div>
            
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="w-full">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Erase All Data
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="z-[10001]">
                <AlertDialogHeader>
                  <AlertDialogTitle>Erase All Data</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete:
                    <br />• All recorded paths and routes
                    <br />• All dropped map pins
                    <br />• All total statistics (this week and all-time)
                    <br />• All app settings and preferences
                    <br /><br />
                    <strong>This action cannot be undone.</strong> Are you absolutely sure?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleEraseAllData} className="bg-red-600 hover:bg-red-700">
                    Erase Everything
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
