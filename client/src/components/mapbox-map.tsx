import React, { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useQuery } from '@tanstack/react-query';
import { calculateBearing, calculateDistance } from '../lib/utils';
import { PathData } from '../lib/path-storage';
import iMaxVanPath from '@assets/imax_1750683369388.png';
import { Button } from '@/components/ui/button';
import { MapPin, Navigation, Info, Users, Car, Building } from 'lucide-react';

interface MapboxMapProps {
  currentLocation: { lat: number; lng: number; accuracy?: number } | null;
  isRecording: boolean;
  onLocationUpdate: (location: { lat: number; lng: number }) => void;
  persistentPaths: PathData[];
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
      border-radius: 50%;
      border: 2px solid #fff;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
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

      // Rotate map if significant movement and bearing change
      if (distance > 25 && timeSinceLastRotation > 4000) {
        const bearingDiff = Math.abs(bearing - (currentBearingRef.current || 0));
        const normalizedBearingDiff = Math.min(bearingDiff, 360 - bearingDiff);

        if (normalizedBearingDiff > 20) {
          console.log('🔄 Rotating map to bearing:', bearing.toFixed(1), '°');
          
          // Rotate map so driving direction faces up
          map.easeTo({
            bearing: bearing,
            center: [currentLocation.lng, currentLocation.lat],
            duration: 2000
          });

          currentBearingRef.current = bearing;
          lastRotationTime.current = now;
        }
      }
    }

    previousLocationRef.current = currentLocation;
  }, [currentLocation, mapReady]);

  // Load suburb boundaries
  const { data: suburbs } = useQuery({
    queryKey: ['/api/suburbs/boundaries'],
    enabled: Boolean(showSuburbs && mapReady)
  });

  // Load toilets
  const { data: toilets } = useQuery({
    queryKey: ['/api/toilets'],
    enabled: Boolean(showToilets && mapReady && currentLocation)
  });

  // Load demographics
  const { data: demographics } = useQuery({
    queryKey: ['/api/demographics'],
    enabled: Boolean(showDemographics && mapReady)
  });

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
        const isCurrent = suburb.clearoutType === 'current';
        const isNext = suburb.clearoutType === 'next';
        return isCurrent || isNext;
      });

      const features = filteredSuburbs.map((suburb: any) => ({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [suburb.coordinates.map((coord: any) => [coord[1], coord[0]])]
        },
        properties: {
          name: suburb.name,
          fillColor: suburb.clearoutType === 'current' ? '#10B981' : '#3B82F6',
          borderColor: suburb.clearoutType === 'current' ? '#059669' : '#2563EB',
          clearoutType: suburb.clearoutType
        }
      }));

      source.setData({ type: 'FeatureCollection', features });
      console.log('✅ Updated suburb boundaries:', features.length, 'relevant suburbs (current + next week)');
    }
  }, [suburbs, showSuburbs, mapReady]);

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
              onClick={() => setShowDemographics(!showDemographics)}
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 hover:bg-gray-100"
              title="View Statistics"
            >
              <Info className="h-4 w-4 text-blue-600" />
            </Button>
          </div>
          
          {currentSuburbInfo && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${
                  currentSuburbInfo.clearoutType === 'current' ? 'bg-green-500' : 
                  currentSuburbInfo.clearoutType === 'next' ? 'bg-blue-500' : 'bg-gray-400'
                }`} />
                <span className="text-sm font-medium">
                  {currentSuburbInfo.clearoutType === 'current' ? 'Current Week Clearout' :
                   currentSuburbInfo.clearoutType === 'next' ? 'Next Week Clearout' : 'No Scheduled Clearout'}
                </span>
              </div>
            </div>
          )}

          {/* Demographics overlay */}
          {showDemographics && demographics && currentSuburbInfo && (
            <div className="mt-4 pt-3 border-t border-gray-200">
              <div className="text-sm text-gray-600 space-y-2">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  <span>Population: {demographics[currentSuburbInfo.name]?.population?.toLocaleString() || 'N/A'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Building className="h-4 w-4" />
                  <span>Median Price: ${demographics[currentSuburbInfo.name]?.medianHousePrice?.toLocaleString() || 'N/A'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex">
                    {[...Array(5)].map((_, i) => (
                      <span key={i} className={`text-sm ${i < (demographics[currentSuburbInfo.name]?.starRating || 0) ? 'text-yellow-400' : 'text-gray-300'}`}>
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

      {/* Map Controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-2 z-[1000]">
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