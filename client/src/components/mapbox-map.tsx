import React, { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useQuery } from '@tanstack/react-query';
import { calculateBearing, calculateDistance } from '../lib/utils';
import { PathData } from '../lib/path-storage';
import iMaxVanPath from '@assets/imax_1750683369388.png';

interface MapboxMapProps {
  currentLocation: { lat: number; lng: number; accuracy?: number } | null;
  isRecording: boolean;
  onLocationUpdate: (location: { lat: number; lng: number }) => void;
  persistentPaths: PathData[];
  focusArea?: string;
  showSuburbs?: boolean;
  showToilets?: boolean;
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
    enabled: showSuburbs && mapReady
  });

  // Load toilets
  const { data: toilets } = useQuery({
    queryKey: ['/api/toilets'],
    enabled: showToilets && mapReady && !!currentLocation
  });

  // Update suburb boundaries
  useEffect(() => {
    if (!mapRef.current || !mapReady || !showSuburbs) return;

    const map = mapRef.current;
    const source = map.getSource('suburbs') as mapboxgl.GeoJSONSource;
    
    if (source && suburbs) {
      const features = suburbs.map((suburb: any) => ({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [suburb.coordinates.map((coord: any) => [coord[1], coord[0]])]
        },
        properties: {
          name: suburb.name,
          fillColor: suburb.name.includes('current') ? '#10B981' : '#3B82F6',
          borderColor: suburb.name.includes('current') ? '#059669' : '#2563EB'
        }
      }));

      source.setData({ type: 'FeatureCollection', features });
      console.log('✅ Updated suburb boundaries:', features.length, 'suburbs');
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

  return (
    <div className="relative w-full h-full">
      <div
        ref={mapContainerRef}
        className="w-full h-full"
        style={{ minHeight: '400px' }}
      />
    </div>
  );
}