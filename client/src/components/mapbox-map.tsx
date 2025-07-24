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
  currentSuburb?: { suburb: string } | null;
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
  showToilets = false,
  currentSuburb: propCurrentSuburb
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
  const [stableCurrentSuburb, setStableCurrentSuburb] = useState<{ suburb: string } | null>(null);
  
  // Smooth interpolation state
  const interpolationRef = useRef<{
    isAnimating: boolean;
    startLocation: { lat: number; lng: number } | null;
    targetLocation: { lat: number; lng: number } | null;
    startTime: number;
    duration: number;
  }>({
    isAnimating: false,
    startLocation: null,
    targetLocation: null,
    startTime: 0,
    duration: 2000 // 2 seconds for smooth animation
  });

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

  // Smooth interpolation function
  const lerp = (start: number, end: number, progress: number) => {
    return start + (end - start) * progress;
  };

  const easeInOutQuad = (t: number) => {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  };

  // Smooth vehicle marker animation
  const animateVehicle = useCallback(() => {
    if (!mapRef.current || !vehicleMarkerRef.current || !interpolationRef.current.isAnimating) return;

    const now = Date.now();
    const elapsed = now - interpolationRef.current.startTime;
    const progress = Math.min(elapsed / interpolationRef.current.duration, 1);
    const easedProgress = easeInOutQuad(progress);

    if (interpolationRef.current.startLocation && interpolationRef.current.targetLocation) {
      const currentLat = lerp(
        interpolationRef.current.startLocation.lat,
        interpolationRef.current.targetLocation.lat,
        easedProgress
      );
      const currentLng = lerp(
        interpolationRef.current.startLocation.lng,
        interpolationRef.current.targetLocation.lng,
        easedProgress
      );

      // Update vehicle marker position
      vehicleMarkerRef.current.setLngLat([currentLng, currentLat]);

      // Update map center during recording for smooth following
      if (isRecording) {
        mapRef.current.easeTo({
          center: [currentLng, currentLat],
          duration: 100,
          essential: true
        });
      }

      // Add to recording path in real-time during animation (for concurrent path updates)
      // Throttle path updates to every 200ms to avoid overwhelming the system
      const throttleKey = `${currentLat.toFixed(5)}-${currentLng.toFixed(5)}`;
      const lastThrottleTime = (animateVehicle as any).lastThrottleTime || 0;
      const lastThrottleKey = (animateVehicle as any).lastThrottleKey || '';
      
      if (isRecording && onLocationUpdate && (now - lastThrottleTime > 200 || throttleKey !== lastThrottleKey)) {
        onLocationUpdate({ lat: currentLat, lng: currentLng });
        (animateVehicle as any).lastThrottleTime = now;
        (animateVehicle as any).lastThrottleKey = throttleKey;
      }
    }

    if (progress < 1) {
      requestAnimationFrame(animateVehicle);
    } else {
      interpolationRef.current.isAnimating = false;
      console.log('🎯 Vehicle animation completed');
    }
  }, [isRecording, onLocationUpdate]);

  // Handle vehicle marker and smooth movement
  useEffect(() => {
    if (!mapRef.current || !mapReady || !currentLocation) return;

    const map = mapRef.current;

    // Create vehicle marker if it doesn't exist
    if (!vehicleMarkerRef.current) {
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
        transition: transform 0.3s ease;
      `;

      vehicleMarkerRef.current = new mapboxgl.Marker(vehicleElement)
        .setLngLat([currentLocation.lng, currentLocation.lat])
        .addTo(map);

      console.log('🚐 Vehicle marker created at:', currentLocation.lat, currentLocation.lng);
    }

    // Start smooth interpolation to new location
    const startLocation = previousLocationRef.current || currentLocation;
    
    // Calculate movement distance for validation
    const distance = previousLocationRef.current ? calculateDistance(
      previousLocationRef.current.lat,
      previousLocationRef.current.lng,
      currentLocation.lat,
      currentLocation.lng
    ) * 1000 : 0;

    // Only animate if there's meaningful movement (> 1 meter)
    if (distance > 1 || !previousLocationRef.current) {
      // If already animating, update the target location for smooth continuation
      if (interpolationRef.current.isAnimating) {
        console.log('🎯 Updating animation target mid-flight');
        interpolationRef.current.targetLocation = currentLocation;
      } else {
        // Start new animation
        interpolationRef.current = {
          isAnimating: true,
          startLocation,
          targetLocation: currentLocation,
          startTime: Date.now(),
          duration: distance > 50 ? 2000 : 1000 // Longer animation for larger movements
        };

        console.log('🎯 Starting smooth vehicle animation from', startLocation.lat.toFixed(6), startLocation.lng.toFixed(6), 'to', currentLocation.lat.toFixed(6), currentLocation.lng.toFixed(6), `(${distance.toFixed(1)}m)`);
        
        animateVehicle();
      }
    }

    // Handle rotation based on movement (unchanged logic)
    if (previousLocationRef.current && distance > 5) {
      const bearing = calculateBearing(
        previousLocationRef.current.lat,
        previousLocationRef.current.lng,
        currentLocation.lat,
        currentLocation.lng
      );

      const now = Date.now();
      const timeSinceLastRotation = now - lastRotationTime.current;

      if (timeSinceLastRotation > 1500) {
        const currentMapBearing = map.getBearing();
        const navigationBearing = bearing;
        
        let bearingDiff = Math.abs(navigationBearing - currentMapBearing);
        if (bearingDiff > 180) {
          bearingDiff = 360 - bearingDiff;
        }
        bearingDiff = Math.abs(bearingDiff);

        if (bearingDiff > 15) {
          console.log('🔄 Rotating map to navigation bearing:', navigationBearing.toFixed(1), '°');
          
          map.easeTo({
            bearing: navigationBearing,
            center: [currentLocation.lng, currentLocation.lat],
            duration: 2000,
            essential: true
          });

          currentBearingRef.current = bearing;
          lastRotationTime.current = now;
        }
      }
    }

    previousLocationRef.current = currentLocation;
  }, [currentLocation, mapReady, animateVehicle]);

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

  // Use prop-based current suburb only (remove internal query to prevent conflicts)

  // Update stable current suburb from prop only
  useEffect(() => {
    if (propCurrentSuburb && propCurrentSuburb.suburb && propCurrentSuburb.suburb !== 'Unknown') {
      setStableCurrentSuburb(propCurrentSuburb);
      console.log('🏘️ Current suburb detected:', propCurrentSuburb.suburb);
    }
  }, [propCurrentSuburb]);

  // Update current suburb info with clearout type
  useEffect(() => {
    if (stableCurrentSuburb && suburbs) {
      const suburbData = suburbs.find((s: any) => s.name === stableCurrentSuburb.suburb);
      if (suburbData) {
        setCurrentSuburbInfo({
          name: suburbData.name,
          clearoutType: suburbData.clearoutType || 'none'
        });
      } else {
        setCurrentSuburbInfo({
          name: stableCurrentSuburb.suburb,
          clearoutType: 'none'
        });
      }
    }
  }, [stableCurrentSuburb, suburbs]);

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
          coordinates: path.coordinates.map(coord => [coord.lng, coord.lat])
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
      {stableCurrentSuburb && stableCurrentSuburb.suburb && (
        <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg p-4 shadow-lg border z-[1000] min-w-[280px]">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-gray-500" />
                <span className="text-sm text-gray-600">Current Location</span>
              </div>
              <span className="font-semibold text-lg ml-6">{stableCurrentSuburb.suburb}</span>
            </div>
            <Button
              onClick={() => {
                console.log('🔍 Info button clicked');
                console.log('🔍 Current showDemographics:', showDemographics);
                console.log('🔍 Demographics array:', demographicsArray);
                console.log('🔍 Demographics array length:', demographicsArray?.length);
                console.log('🔍 Clearout schedule:', clearoutSchedule);
                console.log('🔍 Current suburb info:', stableCurrentSuburb);
                console.log('🔍 All suburbs window condition:', !showDemographics && demographicsArray && demographicsArray.length > 0);
                console.log('🔍 Individual suburb condition:', !showDemographics && demographics[stableCurrentSuburb?.suburb]);
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
          {showDemographics && stableCurrentSuburb && demographics[stableCurrentSuburb.suburb] && (
            <div className="mt-4 pt-3 border-t border-gray-200">
              <div className="text-sm text-gray-600 space-y-2">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  <span>Population: {demographics[stableCurrentSuburb.suburb]?.population?.toLocaleString() || 'N/A'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Building className="h-4 w-4" />
                  <span>Median Price: ${demographics[stableCurrentSuburb.suburb]?.medianHousePrice?.toLocaleString() || 'N/A'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex">
                    {[...Array(5)].map((_, i) => (
                      <span key={i} className={`text-sm ${i < (demographics[stableCurrentSuburb.suburb]?.starRating || 0) ? 'text-yellow-400' : 'text-gray-300'}`}>
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