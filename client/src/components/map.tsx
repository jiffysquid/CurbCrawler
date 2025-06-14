import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LocationPoint, SuburbBoundary } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { Crosshair } from "lucide-react";
import { Button } from "@/components/ui/button";

// Import Leaflet dynamically to avoid SSR issues
let L: any = null;
if (typeof window !== 'undefined') {
  import('leaflet').then((leaflet) => {
    L = leaflet.default;
    // Fix default markers
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
    });
  });
}

interface MapProps {
  currentLocation: { lat: number; lng: number; accuracy?: number } | null;
  sessionLocations: LocationPoint[];
  currentSuburb: string;
  isTracking: boolean;
}

export default function Map({ currentLocation, sessionLocations, currentSuburb, isTracking }: MapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const routePolylineRef = useRef<any>(null);
  const suburbPolygonsRef = useRef<any[]>([]);
  const currentLocationMarkerRef = useRef<any>(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const { toast } = useToast();

  // Fetch suburb boundaries based on current location
  const { data: suburbBoundaries = [], isError: suburbError } = useQuery<SuburbBoundary[]>({
    queryKey: ['/api/suburbs/boundaries', currentLocation?.lat, currentLocation?.lng],
    enabled: !!currentLocation && isMapReady,
    retry: 2,
  });

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || !L || mapInstanceRef.current) return;

    // Initialize map centered on Brisbane
    const map = L.map(mapRef.current, {
      center: [-27.4705, 153.0260],
      zoom: 12,
      zoomControl: true,
    });

    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map);

    mapInstanceRef.current = map;
    setIsMapReady(true);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        setIsMapReady(false);
      }
    };
  }, []);

  // Handle suburb boundaries
  useEffect(() => {
    if (!mapInstanceRef.current || !L || !suburbBoundaries.length) return;

    // Clear existing suburb polygons
    suburbPolygonsRef.current.forEach(polygon => {
      mapInstanceRef.current.removeLayer(polygon);
    });
    suburbPolygonsRef.current = [];

    // Add new suburb polygons
    suburbBoundaries.forEach(suburb => {
      if (suburb.coordinates && suburb.coordinates.length > 0) {
        const polygon = L.polygon(suburb.coordinates, {
          color: '#2563EB',
          weight: 2,
          opacity: 0.8,
          fillColor: '#2563EB',
          fillOpacity: 0.1
        }).addTo(mapInstanceRef.current);

        polygon.bindPopup(`<strong>${suburb.name}</strong>`);
        suburbPolygonsRef.current.push(polygon);
      }
    });
  }, [suburbBoundaries]);

  // Handle suburb fetch error
  useEffect(() => {
    if (suburbError) {
      toast({
        title: "Suburb Data Error",
        description: "Unable to load suburb boundaries. Check your ODS API key configuration.",
        variant: "destructive",
      });
    }
  }, [suburbError, toast]);

  // Update current location marker
  useEffect(() => {
    if (!mapInstanceRef.current || !L || !currentLocation) return;

    // Remove existing current location marker
    if (currentLocationMarkerRef.current) {
      mapInstanceRef.current.removeLayer(currentLocationMarkerRef.current);
    }

    // Add new current location marker
    const icon = L.divIcon({
      className: 'current-location-marker',
      html: `
        <div class="relative">
          <div class="w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-lg ${isTracking ? 'pulse-dot' : ''}"></div>
          ${currentLocation.accuracy ? `<div class="absolute inset-0 rounded-full border border-blue-300 opacity-30" style="width: ${Math.min(currentLocation.accuracy / 2, 50)}px; height: ${Math.min(currentLocation.accuracy / 2, 50)}px; margin: auto;"></div>` : ''}
        </div>
      `,
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    });

    currentLocationMarkerRef.current = L.marker([currentLocation.lat, currentLocation.lng], { icon })
      .addTo(mapInstanceRef.current)
      .bindPopup(`
        <div class="text-sm">
          <strong>Current Location</strong><br/>
          ${currentSuburb || 'Unknown Suburb'}<br/>
          <small>Lat: ${currentLocation.lat.toFixed(6)}<br/>
          Lng: ${currentLocation.lng.toFixed(6)}</small>
          ${currentLocation.accuracy ? `<br/><small>Accuracy: ±${Math.round(currentLocation.accuracy)}m</small>` : ''}
        </div>
      `);

    // Auto-center on first location
    if (markersRef.current.length === 0) {
      mapInstanceRef.current.setView([currentLocation.lat, currentLocation.lng], 15);
    }
  }, [currentLocation, currentSuburb, isTracking]);

  // Update route polyline
  useEffect(() => {
    if (!mapInstanceRef.current || !L || sessionLocations.length === 0) return;

    // Remove existing route
    if (routePolylineRef.current) {
      mapInstanceRef.current.removeLayer(routePolylineRef.current);
    }

    // Add new route if we have multiple points
    if (sessionLocations.length > 1) {
      const routeCoords = sessionLocations.map(loc => [loc.lat, loc.lng]);
      
      routePolylineRef.current = L.polyline(routeCoords, {
        color: '#10B981',
        weight: 4,
        opacity: 0.8,
        smoothFactor: 1
      }).addTo(mapInstanceRef.current);

      // Add route markers at significant points
      sessionLocations.forEach((location, index) => {
        if (index % 10 === 0 || index === sessionLocations.length - 1) { // Every 10th point or last point
          const marker = L.circleMarker([location.lat, location.lng], {
            radius: 3,
            fillColor: '#10B981',
            color: '#059669',
            weight: 1,
            opacity: 1,
            fillOpacity: 0.8
          }).addTo(mapInstanceRef.current);

          marker.bindPopup(`
            <div class="text-sm">
              <strong>Route Point ${index + 1}</strong><br/>
              ${location.suburb || 'Unknown Suburb'}<br/>
              <small>${new Date(location.timestamp).toLocaleTimeString()}</small>
            </div>
          `);
        }
      });
    }
  }, [sessionLocations]);

  const centerOnCurrentLocation = () => {
    if (mapInstanceRef.current && currentLocation) {
      mapInstanceRef.current.setView([currentLocation.lat, currentLocation.lng], 16);
    }
  };

  return (
    <div className="relative h-full w-full">
      <div ref={mapRef} className="h-full w-full" />
      
      {/* Center on location button */}
      {currentLocation && (
        <Button
          onClick={centerOnCurrentLocation}
          size="sm"
          className="absolute bottom-20 right-4 md:bottom-6 md:right-96 z-20 bg-primary hover:bg-blue-700 text-white shadow-lg"
        >
          <Crosshair className="h-4 w-4" />
        </Button>
      )}

      {/* Loading indicator */}
      {!isMapReady && (
        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-lg p-6 flex flex-col items-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-3"></div>
            <div className="text-sm text-gray-600">Loading map...</div>
          </div>
        </div>
      )}
    </div>
  );
}
