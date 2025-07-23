import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useQuery } from '@tanstack/react-query';
import { calculateBearing, calculateDistance } from '../lib/utils';
import { PathData } from '../lib/path-storage';
import iMaxVanPath from '@assets/imax_1750683369388.png';
import { Button } from '@/components/ui/button';
import { MapPin, Navigation, Info, Users, Car, Building, X } from 'lucide-react';

interface MapboxMapProps {
  currentLocation: { lat: number; lng: number; accuracy?: number } | null;
  isRecording: boolean;
  onLocationUpdate: (location: { lat: number; lng: number }) => void;
  persistentPaths: PathData[];
  currentRecordingPath?: { lat: number; lng: number }[];
  focusArea?: string;
  showSuburbs?: boolean;
  showToilets?: boolean;
}

interface SuburbInfo {
  name: string;
  clearoutType: 'current' | 'next' | 'none';
  demographics?: {
    population: number;
    medianHousePrice: number;
    starRating: number;
  };
}

export default function MapboxMap({
  currentLocation,
  isRecording,
  onLocationUpdate,
  persistentPaths,
  currentRecordingPath = [],
  focusArea = 'imax-van',
  showSuburbs = true,
  showToilets = false
}: MapboxMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const vehicleMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const previousLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const currentBearingRef = useRef<number | null>(null);
  const lastRotationTime = useRef<number>(0);
  const [currentSuburbInfo, setCurrentSuburbInfo] = useState<SuburbInfo | null>(null);
  const [showDemographics, setShowDemographics] = useState(false);
  const [isZoomedToVan, setIsZoomedToVan] = useState(true);

  // Set up Mapbox access token
  const mapboxToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || 'pk.eyJ1IjoiamlmeXNxdWlkIiwiYSI6ImNqZXMwdXBqbzBlZWIyeHVtd294N2Y0OWcifQ.ss-8bQczO8uoCANcVIYIYA';
  mapboxgl.accessToken = mapboxToken;

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    console.log('🗺️ Initializing Mapbox GL JS map');
    console.log('🗺️ Using custom Mapbox style: cmd422kxy01t601rf67tl9ra2');

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/jifysquid/cmd422kxy01t601rf67tl9ra2',
      center: currentLocation ? [currentLocation.lng, currentLocation.lat] : [153.0281, -27.4698],
      zoom: 16,
      pitch: 0,
      bearing: 0
    });

    map.on('load', () => {
      console.log('✅ Mapbox GL JS map loaded successfully');
      setMapReady(true);
      
      // Add sources for dynamic data
      map.addSource('suburbs', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      
      map.addSource('toilets', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      // Add persistent paths source
      map.addSource('persistent-paths', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      // Add current recording path source
      map.addSource('current-recording-path', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      // Add suburb polygons layer
      map.addLayer({
        id: 'suburbs-fill',
        type: 'fill',
        source: 'suburbs',
        paint: {
          'fill-color': ['get', 'fillColor'],
          'fill-opacity': 0.2
        }
      });

      map.addLayer({
        id: 'suburbs-outline',
        type: 'line',
        source: 'suburbs',
        paint: {
          'line-color': ['get', 'borderColor'],
          'line-width': 2
        }
      });

      // Add toilet markers layer
      map.addLayer({
        id: 'toilets',
        type: 'circle',
        source: 'toilets',
        paint: {
          'circle-radius': 6,
          'circle-color': '#8B5CF6',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#FFFFFF'
        }
      });

      // Add persistent paths layer
      map.addLayer({
        id: 'persistent-paths',
        type: 'line',
        source: 'persistent-paths',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 8,
          'line-opacity': 0.75
        }
      });

      // Add current recording path layer (shown in red during recording)
      map.addLayer({
        id: 'current-recording-path',
        type: 'line',
        source: 'current-recording-path',
        paint: {
          'line-color': '#EF4444',
          'line-width': 10,
          'line-opacity': 0.9
        }
      });
    });

    mapRef.current = map;

    return () => {
      if (vehicleMarkerRef.current) {
        vehicleMarkerRef.current.remove();
      }
      map.remove();
    };
  }, []);

  // Handle vehicle marker and rotation
  useEffect(() => {
    if (!mapRef.current || !mapReady || !currentLocation) return;

    const map = mapRef.current;

    // Remove existing vehicle marker
    if (vehicleMarkerRef.current) {
      vehicleMarkerRef.current.remove();
    }

    // Create vehicle marker element
    const vehicleElement = document.createElement('div');
    vehicleElement.className = 'vehicle-marker';
    vehicleElement.style.cssText = `
      width: 30px;
      height: 30px;
      background-image: url(${iMaxVanPath});
      background-size: contain;
      background-repeat: no-repeat;
      background-position: center;
      cursor: pointer;
    `;

    // Create and add vehicle marker
    vehicleMarkerRef.current = new mapboxgl.Marker(vehicleElement)
      .setLngLat([currentLocation.lng, currentLocation.lat])
      .addTo(map);

    // Center map on vehicle
    map.easeTo({
      center: [currentLocation.lng, currentLocation.lat],
      duration: 1000
    });

    // Handle rotation based on movement
    if (previousLocationRef.current) {
      console.log('🔄 Previous location found, calculating movement...');
      console.log('🔄 Previous:', previousLocationRef.current.lat.toFixed(6), previousLocationRef.current.lng.toFixed(6));
      console.log('🔄 Current:', currentLocation.lat.toFixed(6), currentLocation.lng.toFixed(6));
      
      const distance = calculateDistance(
        previousLocationRef.current.lat,
        previousLocationRef.current.lng,
        currentLocation.lat,
        currentLocation.lng
      ) * 1000; // Convert to meters

      const bearing = calculateBearing(
        previousLocationRef.current.lat,
        previousLocationRef.current.lng,
        currentLocation.lat,
        currentLocation.lng
      );

      const now = Date.now();
      const timeSinceLastRotation = now - lastRotationTime.current;

      console.log('🧭 Movement detected - bearing:', bearing.toFixed(1), '°, distance:', distance.toFixed(1), 'm');
      console.log('🧭 Debug - distance check:', distance > 5, 'time check:', timeSinceLastRotation > 1500, 'timeSince:', timeSinceLastRotation);

      // Rotate map based on significant movement
      if (distance > 5 && timeSinceLastRotation > 1500) { // Smooth, less aggressive rotation
        const currentMapBearing = map.getBearing();
        
        // Calculate the target navigation bearing 
        // Try direct bearing first (not opposite) to see if this matches user's expectation
        const navigationBearing = bearing;
        
        // Properly calculate bearing difference, handling negative and wrap-around
        let bearingDiff = Math.abs(navigationBearing - currentMapBearing);
        if (bearingDiff > 180) {
          bearingDiff = 360 - bearingDiff;
        }
        // Ensure we always get a positive difference
        bearingDiff = Math.abs(bearingDiff);

        console.log('🧭 Debug - current map bearing:', currentMapBearing.toFixed(1), '°, travel bearing:', bearing.toFixed(1), '°, target navigation bearing:', navigationBearing.toFixed(1), '°, diff:', bearingDiff.toFixed(1), '°');

        if (bearingDiff > 15) { // Higher threshold for smoother rotation
          console.log('🔄 Rotating map to navigation bearing:', navigationBearing.toFixed(1), '° (was:', currentMapBearing.toFixed(1), '°)');
          console.log('🔄 Executing map rotation - travel bearing:', bearing.toFixed(1), '°, map bearing:', navigationBearing.toFixed(1), '°');
          
          map.easeTo({
            bearing: navigationBearing,
            center: [currentLocation.lng, currentLocation.lat],
            duration: 2000, // Longer, smoother animation
            essential: true
          });

          currentBearingRef.current = bearing;
          lastRotationTime.current = now;
        } else {
          console.log('🧭 Bearing diff too small:', bearingDiff.toFixed(1), '° < 15°');
        }
      } else {
        console.log('🧭 Conditions not met - distance:', distance.toFixed(1), 'm (need >5m), timeSince:', timeSinceLastRotation, 'ms (need >1500ms)');
      }
    }

    previousLocationRef.current = currentLocation;
  }, [currentLocation, mapReady]);

  // Load clearout schedule to get current and next suburbs
  const { data: clearoutSchedule } = useQuery({
    queryKey: ['/api/clearout-schedule'],
    enabled: Boolean(mapReady)
  });

  // Load suburb boundaries
  const { data: suburbs } = useQuery({
    queryKey: ['/api/suburbs/boundaries'],
    enabled: Boolean(showSuburbs && mapReady && clearoutSchedule)
  });

  // Load toilets
  const { data: toilets } = useQuery({
    queryKey: ['/api/toilets'],
    enabled: Boolean(showToilets && mapReady && currentLocation)
  });

  // Load demographics with proper current/next suburb parameters
  const { data: demographicsArray } = useQuery({
    queryKey: ['/api/suburbs/demographics', clearoutSchedule?.current, clearoutSchedule?.next],
    queryFn: async () => {
      if (!clearoutSchedule) return [];
      const params = new URLSearchParams();
      if (clearoutSchedule.current) {
        clearoutSchedule.current.forEach(suburb => params.append('current', suburb));
      }
      if (clearoutSchedule.next) {
        clearoutSchedule.next.forEach(suburb => params.append('next', suburb));
      }
      console.log('🔍 Fetching demographics with params:', params.toString());
      const response = await fetch(`/api/suburbs/demographics?${params}`);
      if (!response.ok) throw new Error('Failed to fetch demographics');
      const data = await response.json();
      console.log('🔍 Demographics data received:', data.length, 'suburbs');
      return data;
    },
    enabled: Boolean(clearoutSchedule && clearoutSchedule.current && clearoutSchedule.next)
  });

  // Convert demographics array to object keyed by suburb name for individual lookups
  const demographics = useMemo(() => {
    if (!demographicsArray || !Array.isArray(demographicsArray)) return {};
    console.log('🔍 Converting demographics array to object:', demographicsArray.length, 'suburbs');
    return demographicsArray.reduce((acc, suburb) => {
      acc[suburb.name] = suburb;
      return acc;
    }, {});
  }, [demographicsArray]);

  // Load current suburb info
  const { data: currentSuburb } = useQuery({
    queryKey: ['/api/suburbs/lookup', currentLocation?.lat, currentLocation?.lng],
    enabled: Boolean(currentLocation && mapReady && currentLocation?.lat && currentLocation?.lng),
    queryFn: async () => {
      if (!currentLocation?.lat || !currentLocation?.lng) return null;
      
      const response = await fetch(`/api/suburbs/lookup?lat=${currentLocation.lat}&lng=${currentLocation.lng}`);
      if (!response.ok) {
        throw new Error('Failed to fetch suburb');
      }
      return response.json();
    }
  });

  // Debug suburb info
  useEffect(() => {
    if (currentSuburb) {
      console.log('🏘️ Current suburb detected:', currentSuburb.suburb);
    }
  }, [currentSuburb]);

  // Update current suburb info with clearout type
  useEffect(() => {
    if (currentSuburb && suburbs) {
      const suburbData = suburbs.find((s: any) => s.name === currentSuburb.suburb);
      if (suburbData) {
        setCurrentSuburbInfo({
          name: suburbData.name,
          clearoutType: suburbData.clearoutType || 'none'
        });
      } else {
        setCurrentSuburbInfo({
          name: currentSuburb.suburb,
          clearoutType: 'none'
        });
      }
    }
  }, [currentSuburb, suburbs]);

  // Update suburb boundaries - only show current and next week clearouts
  useEffect(() => {
    if (!mapRef.current || !mapReady || !showSuburbs) return;

    const map = mapRef.current;
    const source = map.getSource('suburbs') as mapboxgl.GeoJSONSource;
    
    if (source && suburbs) {
      // Filter to only show current and next week clearouts
      const filteredSuburbs = suburbs.filter((suburb: any) => {
        const isCurrent = clearoutSchedule?.current?.includes(suburb.name) || suburb.clearoutType === 'current';
        const isNext = clearoutSchedule?.next?.includes(suburb.name) || suburb.clearoutType === 'next';
        return isCurrent || isNext;
      });

      const features = filteredSuburbs.map((suburb: any) => {
        const isCurrent = clearoutSchedule?.current?.includes(suburb.name);
        const isNext = clearoutSchedule?.next?.includes(suburb.name);
        const clearoutType = isCurrent ? 'current' : isNext ? 'next' : 'none';
        
        return {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [suburb.coordinates.map((coord: any) => [coord[1], coord[0]])]
          },
          properties: {
            name: suburb.name,
            fillColor: clearoutType === 'current' ? '#10B981' : '#3B82F6',
            borderColor: clearoutType === 'current' ? '#059669' : '#2563EB',
            clearoutType: clearoutType
          }
        };
      });

      source.setData({ type: 'FeatureCollection', features });
      console.log('✅ Updated suburb boundaries:', features.length, 'relevant suburbs (current + next week)');
      console.log('🎨 Suburb colors:', features.map(f => `${f.properties.name}: ${f.properties.clearoutType} (${f.properties.fillColor})`));
    }
  }, [suburbs, showSuburbs, mapReady, clearoutSchedule]);

  // Update toilet markers
  useEffect(() => {
    if (!mapRef.current || !mapReady || !showToilets || !toilets) return;

    const map = mapRef.current;
    const source = map.getSource('toilets') as mapboxgl.GeoJSONSource;
    
    if (source) {
      const features = toilets.map((toilet: any) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [toilet.lng, toilet.lat]
        },
        properties: {
          name: toilet.name,
          distance: toilet.distance
        }
      }));

      source.setData({ type: 'FeatureCollection', features });
      console.log('✅ Updated toilet markers:', features.length, 'toilets');
    }
  }, [toilets, showToilets, mapReady]);

  // Update persistent paths
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;

    const map = mapRef.current;
    const source = map.getSource('persistent-paths') as mapboxgl.GeoJSONSource;
    
    if (source) {
      const features = persistentPaths.map((path, index) => ({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: path.coordinates.map(coord => [coord[1], coord[0]])
        },
        properties: {
          name: path.name,
          color: path.color || `hsl(${index * 45}, 70%, 50%)`
        }
      }));

      source.setData({ type: 'FeatureCollection', features });
      console.log('✅ Updated persistent paths:', features.length, 'paths');
    }
  }, [persistentPaths, mapReady]);

  // Update current recording path in real-time
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;

    const map = mapRef.current;
    const source = map.getSource('current-recording-path') as mapboxgl.GeoJSONSource;
    
    if (source) {
      if (isRecording && currentRecordingPath.length > 1) {
        const feature = {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: currentRecordingPath.map(coord => [coord.lng, coord.lat])
          },
          properties: {
            name: 'Current Recording'
          }
        };

        source.setData({ type: 'FeatureCollection', features: [feature] });
        console.log('🔴 Updated current recording path:', currentRecordingPath.length, 'points');
      } else {
        // Clear the recording path when not recording
        source.setData({ type: 'FeatureCollection', features: [] });
      }
    }
  }, [currentRecordingPath, isRecording, mapReady]);

  // Map controls
  const toggleZoom = () => {
    if (mapRef.current && currentLocation) {
      if (isZoomedToVan) {
        // Zoom out to suburb view
        mapRef.current.easeTo({
          center: [currentLocation.lng, currentLocation.lat],
          zoom: 13,
          duration: 1000
        });
        setIsZoomedToVan(false);
      } else {
        // Zoom in to van view
        mapRef.current.easeTo({
          center: [currentLocation.lng, currentLocation.lat],
          zoom: 18,
          duration: 1000
        });
        setIsZoomedToVan(true);
      }
    }
  };

  return (
    <div className="relative w-full h-full">
      <div
        ref={mapContainerRef}
        className="w-full h-full"
        style={{ minHeight: '400px' }}
      />
      
      {/* Current Suburb Info Window */}
      {currentSuburb && (
        <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg p-4 shadow-lg border z-[1000] min-w-[280px]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              <span className="font-semibold text-lg">{currentSuburb.suburb}</span>
            </div>
            <Button
              onClick={() => {
                console.log('🔍 Info button clicked');
                console.log('🔍 Current showDemographics:', showDemographics);
                console.log('🔍 Demographics array:', demographicsArray);
                console.log('🔍 Demographics array length:', demographicsArray?.length);
                console.log('🔍 Clearout schedule:', clearoutSchedule);
                console.log('🔍 Current suburb info:', currentSuburb);
                console.log('🔍 All suburbs window condition:', !showDemographics && demographicsArray && demographicsArray.length > 0);
                console.log('🔍 Individual suburb condition:', !showDemographics && demographics[currentSuburb.suburb]);
                setShowDemographics(!showDemographics);
              }}
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 hover:bg-gray-100"
              title="View Statistics"
            >
              <Info className="h-4 w-4 text-blue-600" />
            </Button>
          </div>
          


          {/* Demographics overlay showing individual suburb info */}
          {showDemographics && demographics[currentSuburb.suburb] && (
            <div className="mt-4 pt-3 border-t border-gray-200">
              <div className="text-sm text-gray-600 space-y-2">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  <span>Population: {demographics[currentSuburb.suburb]?.population?.toLocaleString() || 'N/A'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Building className="h-4 w-4" />
                  <span>Median Price: ${demographics[currentSuburb.suburb]?.medianHousePrice?.toLocaleString() || 'N/A'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex">
                    {[...Array(5)].map((_, i) => (
                      <span key={i} className={`text-sm ${i < (demographics[currentSuburb.suburb]?.starRating || 0) ? 'text-yellow-400' : 'text-gray-300'}`}>
                        ★
                      </span>
                    ))}
                  </div>
                  <span className="text-xs text-gray-500">Price/Density Rating</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* All Clearout Suburbs Demographics Window */}
      {showDemographics && demographicsArray && demographicsArray.length > 0 && (
        <div className="absolute top-4 right-4 bg-white/95 backdrop-blur-sm rounded-lg shadow-xl border p-4 z-[1000] max-w-md max-h-96 overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Building className="h-5 w-5" />
              Clearout Suburbs ({demographicsArray.length} suburbs)
            </h3>
            <Button
              onClick={() => setShowDemographics(false)}
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 hover:bg-gray-100"
              title="Close"
            >
              <X className="h-4 w-4 text-gray-500" />
            </Button>
          </div>
          
          {/* Current Week Suburbs */}
          <div className="mb-4">
            <h4 className="text-sm font-medium text-green-700 mb-2 flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              Current Week
            </h4>
            <div className="space-y-2">
              {demographicsArray.filter(suburb => suburb.clearoutStatus === 'current').map((suburb, index) => (
                <div key={suburb.name} className="bg-green-50 border border-green-200 rounded p-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm">{suburb.name}</span>
                    <div className="flex">
                      {[...Array(5)].map((_, i) => (
                        <span key={i} className={`text-xs ${i < (suburb.starRating || 0) ? 'text-yellow-500' : 'text-gray-300'}`}>
                          ★
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="text-xs text-gray-600 space-y-1">
                    <div>Population: {suburb.population?.toLocaleString() || 'N/A'}</div>
                    <div>Median Price: ${suburb.medianHousePrice?.toLocaleString() || 'N/A'}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Next Week Suburbs */}
          <div>
            <h4 className="text-sm font-medium text-blue-700 mb-2 flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500"></div>
              Next Week
            </h4>
            <div className="space-y-2">
              {demographicsArray.filter(suburb => suburb.clearoutStatus === 'next').map((suburb, index) => (
                <div key={suburb.name} className="bg-blue-50 border border-blue-200 rounded p-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm">{suburb.name}</span>
                    <div className="flex">
                      {[...Array(5)].map((_, i) => (
                        <span key={i} className={`text-xs ${i < (suburb.starRating || 0) ? 'text-yellow-500' : 'text-gray-300'}`}>
                          ★
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="text-xs text-gray-600 space-y-1">
                    <div>Population: {suburb.population?.toLocaleString() || 'N/A'}</div>
                    <div>Median Price: ${suburb.medianHousePrice?.toLocaleString() || 'N/A'}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Map Controls */}
      <div className="absolute top-1/2 right-4 -translate-y-1/2 flex flex-col gap-2 z-[1000]">
        <Button
          onClick={toggleZoom}
          size="sm"
          variant="outline"
          className={`bg-white/90 backdrop-blur-sm border-gray-300 shadow-lg ${
            isZoomedToVan ? 'bg-blue-50 border-blue-300' : 'bg-green-50 border-green-300'
          }`}
          title={isZoomedToVan ? 'Zoom to Suburb' : 'Zoom to Van'}
        >
          {isZoomedToVan ? (
            <Building className="h-4 w-4" />
          ) : (
            <Car className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}