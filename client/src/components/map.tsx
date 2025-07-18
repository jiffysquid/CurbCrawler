import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { LocationPoint, SuburbBoundary, PublicToilet, SessionWithStats } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { Crosshair, Focus, Info, BarChart3, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getVehicleFocusCoordinates, getVehicleIcon, calculateBearing, calculateDistance, throttle, getPathColor, loadPersistentPaths, savePersistentPath, PersistentPath } from "@/lib/utils";
import imaxVanImage from "@assets/imax_1750683369388.png";
import { kmlSimulator } from "../utils/kmlParser";

// Import Leaflet CSS
import 'leaflet/dist/leaflet.css';

// Leaflet instance
let L: any = null;

interface MapProps {
  currentLocation: { lat: number; lng: number; accuracy?: number } | null;
  sessionLocations: LocationPoint[];
  currentSuburb: string;
  isTracking: boolean;
  isRecording: boolean;
  allSessions?: SessionWithStats[];
}

export default function Map({ currentLocation, sessionLocations, currentSuburb, isTracking, isRecording, allSessions = [] }: MapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const routePolylineRef = useRef<any>(null);
  const suburbPolygonsRef = useRef<any[]>([]);
  const currentLocationMarkerRef = useRef<any>(null);
  const vehicleMarkerRef = useRef<any>(null);
  const toiletMarkersRef = useRef<any[]>([]);
  const historicalRoutesRef = useRef<any[]>([]);
  const [isMapReady, setIsMapReady] = useState(false);
  const [showSuburbs, setShowSuburbs] = useState(true);
  const [showToilets, setShowToilets] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  // Removed map style selection - only using custom Mapbox style
  const [focusArea, setFocusArea] = useState<string>('imax-van');
  const [mapRotation, setMapRotation] = useState(0);
  const [pathColorScheme, setPathColorScheme] = useState<'bright' | 'fade'>('bright');
  const [persistentPaths, setPersistentPaths] = useState<PersistentPath[]>([]);
  const [isLoadingTiles, setIsLoadingTiles] = useState(false);
  const [pendingRotation, setPendingRotation] = useState<number | null>(null);
  const labelsLayerRef = useRef<any>(null);
  const [isZoomedIn, setIsZoomedIn] = useState(false);
  const [savedZoomLevel, setSavedZoomLevel] = useState(12);
  const [currentBearing, setCurrentBearing] = useState<number | null>(null);
  const [lastRotationTime, setLastRotationTime] = useState<number>(0);

  // Track zoom level changes to update button state
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    const handleZoomEnd = () => {
      const currentZoom = mapInstanceRef.current.getZoom();
      // Consider zoomed in if zoom level is 15 or higher
      setIsZoomedIn(currentZoom >= 15);
    };

    mapInstanceRef.current.on('zoomend', handleZoomEnd);
    
    // Set initial state
    handleZoomEnd();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.off('zoomend', handleZoomEnd);
      }
    };
  }, [isMapReady]);

  const [showDemographics, setShowDemographics] = useState(false);
  
  // Additional refs for new functionality
  const currentRoutePolylineRef = useRef<any>(null);
  const hasInitialLocationRef = useRef<boolean>(false);
  const currentRoutePointsRef = useRef<{ lat: number; lng: number }[]>([]);
  const [currentSuburbName, setCurrentSuburbName] = useState<string>('Unknown');
  const kmlRoutePolylineRef = useRef<any>(null);
  const previousLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const { toast } = useToast();

  // Map rotation function for smooth driving direction alignment
  const updateMapRotation = useCallback((newLocation: { lat: number; lng: number }) => {
    if (!mapInstanceRef.current) return;
    
    const now = Date.now();
    const timeSinceLastRotation = now - lastRotationTime;
    
    console.log('🔄 updateMapRotation called with:', {
      hasMap: !!mapInstanceRef.current,
      isRecording,
      newLocation,
      prevLocation: previousLocationRef.current
    });
    
    // If we have a previous location, calculate bearing for rotation
    if (previousLocationRef.current) {
      const bearing = calculateBearing(
        previousLocationRef.current.lat,
        previousLocationRef.current.lng,
        newLocation.lat,
        newLocation.lng
      );
      
      const distance = calculateDistance(
        previousLocationRef.current.lat,
        previousLocationRef.current.lng,
        newLocation.lat,
        newLocation.lng
      ) * 1000; // Convert to meters
      
      console.log('🧭 Calculated bearing:', bearing, 'degrees, distance:', distance, 'meters');
      
      // Only rotate if:
      // 1. We've moved significantly (>5 meters)
      // 2. It's been at least 2 seconds since last rotation (smooth, not jerky)
      // 3. The bearing change is significant (>10 degrees)
      if (distance > 5 && timeSinceLastRotation > 2000) {
        const bearingDiff = Math.abs(bearing - (currentBearing || 0));
        const normalizedBearingDiff = Math.min(bearingDiff, 360 - bearingDiff);
        
        if (normalizedBearingDiff > 10) {
          console.log('🔄 Applying smooth rotation:', bearing, 'degrees (prev:', currentBearing, ')');
          
          // Apply smooth rotation to map container
          const mapContainer = mapInstanceRef.current.getContainer();
          if (mapContainer) {
            // Calculate the rotation needed to make driving direction face up
            const rotationAngle = -bearing; // Negative to rotate map, not vehicle
            
            mapContainer.style.transform = `rotate(${rotationAngle}deg)`;
            mapContainer.style.transformOrigin = '50% 50%';
            mapContainer.style.transition = 'transform 1.5s ease-out'; // Smooth 1.5s transition
            
            // Prevent scroll bars from appearing due to rotation
            if (mapContainer.parentElement) {
              mapContainer.parentElement.style.overflow = 'hidden';
            }
            
            setCurrentBearing(bearing);
            setMapRotation(rotationAngle);
            setLastRotationTime(now);
          }
        } else {
          console.log('🔄 Bearing change too small:', normalizedBearingDiff, 'degrees - no rotation');
        }
      } else {
        console.log('🔄 Movement too small or rotation too recent - no rotation applied');
      }
    } else {
      console.log('📍 Setting initial location for rotation tracking');
    }
    
    // Always update previous location for bearing calculation when there's movement
    const prevLoc = previousLocationRef.current;
    if (!prevLoc || calculateDistance(prevLoc.lat, prevLoc.lng, newLocation.lat, newLocation.lng) * 1000 > 1) {
      previousLocationRef.current = newLocation;
    }
  }, [currentBearing, lastRotationTime, isRecording]);

  // Custom Mapbox tile configuration with cache busting
  const getTileConfig = () => {
    // Use the Mapbox token directly from environment variables
    const mapboxToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || 'pk.eyJ1IjoiamlmeXNxdWlkIiwiYSI6ImNqZXMwdXBqbzBlZWIyeHVtd294N2Y0OWcifQ.ss-8bQczO8uoCANcVIYIYA';
    
    // Add cache busting parameter to force fresh tiles
    const cacheBust = Date.now();
    
    console.log('🗺️ Using custom Mapbox style: cmd422kxy01t601rf67tl9ra2');
    console.log('🗺️ VITE_MAPBOX_ACCESS_TOKEN:', import.meta.env.VITE_MAPBOX_ACCESS_TOKEN);
    console.log('🗺️ Using fallback token for custom style');
    console.log('🗺️ Mapbox token available:', !!mapboxToken);
    console.log('🗺️ Cache bust timestamp:', cacheBust);
    
    return {
      url: `https://api.mapbox.com/styles/v1/jifysquid/cmd422kxy01t601rf67tl9ra2/tiles/512/{z}/{x}/{y}@2x?access_token=${mapboxToken}&cb=${cacheBust}`,
      attribution: '© <a href="https://www.mapbox.com/about/maps/">Mapbox</a> © <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      tileSize: 512,
      zoomOffset: -1
    };
  };

  // Load settings and persistent paths from localStorage
  useEffect(() => {
    const savedFocusArea = localStorage.getItem('focusArea');
    const savedShowSuburbs = localStorage.getItem('showSuburbBoundaries');
    const savedShowToilets = localStorage.getItem('showToilets');
    const savedShowLabels = localStorage.getItem('showLabels');
    const savedPathColorScheme = localStorage.getItem('pathColorScheme');
    
    if (savedFocusArea) setFocusArea(savedFocusArea);
    if (savedShowSuburbs !== null) {
      setShowSuburbs(savedShowSuburbs === 'true');
    } else {
      setShowSuburbs(true); // Default to showing suburbs
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
    // Removed mapStyle handling - only using custom Mapbox style
    if (savedPathColorScheme) {
      setPathColorScheme(savedPathColorScheme as 'bright' | 'fade');
    }
    
    // Load persistent paths
    const paths = loadPersistentPaths();
    console.log('🗺️ Loading persistent paths from localStorage:', paths.length, 'paths');
    paths.forEach((path, index) => {
      console.log(`🗺️ Path ${index + 1}: "${path.name}" with ${path.coordinates.length} coordinates`);
    });
    setPersistentPaths(paths);

    // Listen for storage changes from settings panel
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'focusArea' && e.newValue) {
        setFocusArea(e.newValue);
      }
      if (e.key === 'showSuburbBoundaries' && e.newValue) {
        setShowSuburbs(e.newValue === 'true');
      }
      if (e.key === 'showToilets' && e.newValue) {
        setShowToilets(e.newValue === 'true');
      }
      if (e.key === 'pathColorScheme' && e.newValue) {
        setPathColorScheme(e.newValue as 'bright' | 'fade');
      }
      if (e.key === 'showLabels' && e.newValue) {
        setShowLabels(e.newValue === 'true');
      }
      // Removed mapStyle handling - using fixed custom style
      if (e.key === 'persistentPaths') {
        const paths = loadPersistentPaths();
        console.log('🗺️ Storage event - reloading persistent paths:', paths.length, 'paths');
        setPersistentPaths(paths);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Listen for KML route display events
  useEffect(() => {
    const handleShowKMLRoute = (event: CustomEvent) => {
      const { show } = event.detail;
      
      if (!mapInstanceRef.current) {
        console.log('🗺️ Map not ready, cannot display route');
        return;
      }
      
      const L = (window as any).L;
      if (!L) {
        console.log('🗺️ Leaflet not loaded, cannot display route');
        return;
      }
      
      if (show) {
        console.log('🗺️ Displaying actual KML route on map');
        
        // Get the actual KML route data
        const kmlPoints = kmlSimulator.getAllPoints();
        if (kmlPoints.length === 0) {
          console.log('🗺️ No KML data available');
          return;
        }
        
        // Convert KML points to Leaflet format [lat, lng]
        const routeCoordinates = kmlPoints.map(point => [point.lat, point.lng]);
        console.log(`🗺️ Displaying route with ${routeCoordinates.length} actual GPS points`);
        
        // Remove existing route if any
        if (kmlRoutePolylineRef.current) {
          try {
            kmlRoutePolylineRef.current.remove();
          } catch (e) {
            console.log('🗺️ Error removing existing route:', e);
          }
        }
        
        try {
          // Create polyline for actual KML route
          kmlRoutePolylineRef.current = L.polyline(routeCoordinates, {
            color: '#FF6B35',
            weight: 6,
            opacity: 1.0,
            dashArray: '10, 5'
          }).addTo(mapInstanceRef.current);
          
          console.log('🗺️ KML test route displayed successfully');
          
          // Zoom to show the route
          setTimeout(() => {
            if (kmlRoutePolylineRef.current && mapInstanceRef.current) {
              mapInstanceRef.current.fitBounds(kmlRoutePolylineRef.current.getBounds(), {
                padding: [50, 50]
              });
              console.log('🗺️ Map zoomed to show route');
            }
          }, 100);
          
        } catch (error) {
          console.error('🗺️ Error creating route polyline:', error);
        }
        
      } else {
        // Hide the route
        if (kmlRoutePolylineRef.current) {
          try {
            kmlRoutePolylineRef.current.remove();
            kmlRoutePolylineRef.current = null;
            console.log('🗺️ KML route hidden successfully');
          } catch (error) {
            console.error('🗺️ Error hiding route:', error);
          }
        }
      }
    };

    window.addEventListener('show-kml-route', handleShowKMLRoute as EventListener);
    
    return () => {
      window.removeEventListener('show-kml-route', handleShowKMLRoute as EventListener);
    };
  }, []);

  // Update current suburb when location changes
  useEffect(() => {
    const updateCurrentSuburb = async () => {
      if (!currentLocation) {
        setCurrentSuburbName('Unknown');
        return;
      }

      try {
        const response = await fetch(`/api/suburbs/lookup?lat=${currentLocation.lat}&lng=${currentLocation.lng}`);
        if (response.ok) {
          const data = await response.json();
          setCurrentSuburbName(data.suburb || 'Unknown');
        } else {
          setCurrentSuburbName('Unknown');
        }
      } catch (error) {
        console.log('Could not determine current suburb:', error);
        setCurrentSuburbName('Unknown');
      }
    };

    updateCurrentSuburb();
  }, [currentLocation]);

  // FIXED: Proper map rotation using native Leaflet bearing + counter-rotation
  // This approach fixes: van stays upright, no blank tiles, readable text
  const updateMapRotationV2 = useCallback((newLocation: { lat: number; lng: number }) => {
    if (!mapInstanceRef.current) return;
    
    const now = Date.now();
    const timeSinceLastRotation = now - lastRotationTime;
    
    console.log('🔄 updateMapRotation called with:', {
      hasMap: !!mapInstanceRef.current,
      isRecording,
      newLocation,
      prevLocation: previousLocationRef.current
    });
    
    // If we have a previous location, calculate bearing for rotation
    if (previousLocationRef.current) {
      const bearing = calculateBearing(
        previousLocationRef.current.lat,
        previousLocationRef.current.lng,
        newLocation.lat,
        newLocation.lng
      );
      
      const distance = calculateDistance(
        previousLocationRef.current.lat,
        previousLocationRef.current.lng,
        newLocation.lat,
        newLocation.lng
      ) * 1000; // Convert to meters
      
      console.log('🧭 Calculated bearing:', bearing, 'degrees, distance:', distance, 'meters');
      
      // Only rotate if:
      // 1. We've moved significantly (>10 meters)
      // 2. It's been at least 3 seconds since last rotation (prevent oscillation)
      // 3. The bearing change is significant (>15 degrees)
      if (distance > 10 && timeSinceLastRotation > 3000) {
        const bearingDiff = Math.abs(bearing - (currentBearing || 0));
        const normalizedBearingDiff = Math.min(bearingDiff, 360 - bearingDiff);
        
        console.log('🧭 Rotation check - distance:', distance, 'bearingDiff:', normalizedBearingDiff, 'timeSince:', timeSinceLastRotation);
        
        if (normalizedBearingDiff > 15) {
          console.log('🔄 Applying proper map rotation:', bearing, 'degrees (prev:', currentBearing, ')');
          
          // NEW APPROACH: Use Leaflet's native bearing rotation
          // This avoids blank tiles and keeps UI elements properly positioned
          try {
            // STEP 1: Ensure the map is properly centered on the vehicle
            const currentZoom = mapInstanceRef.current.getZoom();
            mapInstanceRef.current.setView([newLocation.lat, newLocation.lng], currentZoom, { animate: false });
            
            // STEP 2: Apply smooth rotation to the map
            const mapPane = mapInstanceRef.current.getPanes().mapPane;
            if (mapPane) {
              // Fix the rotation direction - use positive bearing to rotate map so driving direction faces up
              const rotationAngle = bearing;
              
              // Use center of map container as rotation origin
              mapPane.style.transform = `rotate(${rotationAngle}deg)`;
              mapPane.style.transformOrigin = '50% 50%';
              mapPane.style.transition = 'transform 1.5s ease-out';
              
              console.log('✅ Map rotation applied - bearing:', bearing, 'rotation:', rotationAngle, 'degrees');
              console.log('✅ Map pane transform:', mapPane.style.transform);
            } else {
              console.log('❌ Map pane not found');
            }
            
            // Counter-rotate UI elements to keep them readable
            const counterRotation = bearing; // Positive to counter the map rotation
            
            // Counter-rotate vehicle marker to keep it pointing up
            if (vehicleMarkerRef.current) {
              const vehicleElement = vehicleMarkerRef.current.getElement();
              if (vehicleElement) {
                // Keep the vehicle marker always pointing north (up)
                vehicleElement.style.transform = `rotate(${counterRotation}deg)`;
                vehicleElement.style.transformOrigin = 'center center';
                vehicleElement.style.transition = 'transform 1.5s ease-out';
                console.log('✅ Counter-rotated vehicle marker to stay upright');
              }
            }
            
            // Counter-rotate suburb polygons to keep text readable
            suburbPolygonsRef.current.forEach((polygon: any) => {
              if (polygon.getElement) {
                const element = polygon.getElement();
                if (element) {
                  element.style.transform = `rotate(${counterRotation}deg)`;
                  element.style.transformOrigin = '50% 50%';
                  element.style.transition = 'transform 1.5s ease-out';
                }
              }
            });
            
            // Counter-rotate toilet markers to keep them readable
            toiletMarkersRef.current.forEach((marker: any) => {
              if (marker.getElement) {
                const element = marker.getElement();
                if (element) {
                  element.style.transform = `rotate(${counterRotation}deg)`;
                  element.style.transformOrigin = '50% 50%';
                  element.style.transition = 'transform 1.5s ease-out';
                }
              }
            });
            
            setCurrentBearing(bearing);
            setMapRotation(-bearing);
            setLastRotationTime(now);
            
            console.log('✅ Map rotation applied successfully - van stays upright, no blank tiles');
            
          } catch (error) {
            console.error('❌ Map rotation failed:', error);
            console.log('🚫 Falling back to no rotation');
          }
        } else {
          console.log('🔄 Bearing change too small:', normalizedBearingDiff, 'degrees - no rotation');
        }
      } else {
        console.log('🔄 Movement too small or rotation too recent - no rotation applied');
      }
    } else {
      console.log('📍 Setting initial location for rotation tracking');
    }
    
    // Always update previous location for bearing calculation when there's movement
    const prevLoc = previousLocationRef.current;
    if (!prevLoc || calculateDistance(prevLoc.lat, prevLoc.lng, newLocation.lat, newLocation.lng) * 1000 > 1) {
      previousLocationRef.current = newLocation;
    }
  }, [currentBearing, lastRotationTime, isRecording]);

  // Apply pending rotation when tiles finish loading
  useEffect(() => {
    if (!isLoadingTiles && pendingRotation !== null && mapInstanceRef.current) {
      console.log('✅ Applying pending rotation:', pendingRotation, 'degrees');
      const mapContainer = mapInstanceRef.current.getContainer();
      if (mapContainer) {
        mapContainer.style.transform = `rotate(${pendingRotation}deg)`;
        mapContainer.style.transformOrigin = '50% 50%';
        mapContainer.style.transition = 'transform 0.5s ease-out';
        // Prevent scroll bars from rotated content
        mapContainer.parentElement.style.overflow = 'hidden';
        setPendingRotation(null);
      }
    }
  }, [isLoadingTiles, pendingRotation]);

  // Update current route during tracking
  const updateCurrentRoute = useCallback(() => {
    if (!mapInstanceRef.current || !L || currentRoutePointsRef.current.length < 2) return;

    // Remove existing current route
    if (currentRoutePolylineRef.current) {
      mapInstanceRef.current.removeLayer(currentRoutePolylineRef.current);
    }

    // Add new current route polyline
    const routeCoords = currentRoutePointsRef.current.map(point => [point.lat, point.lng]);
    
    currentRoutePolylineRef.current = L.polyline(routeCoords, {
      color: '#EF4444',  // Red color for current session
      weight: 5,
      opacity: 0.9,
      smoothFactor: 1,
      dashArray: '10, 5'  // Dashed line to distinguish from historical routes
    }).addTo(mapInstanceRef.current);
  }, []);

  // Using new PATH_COLORS system from utils

  // Fetch suburb boundaries for Brisbane area with optimized caching
  const { data: suburbBoundaries = [], isError: suburbError } = useQuery<SuburbBoundary[]>({
    queryKey: ['/api/suburbs/boundaries'],
    enabled: isMapReady,
    retry: 1,
    staleTime: 30 * 60 * 1000, // Cache for 30 minutes to reduce frequent re-fetches
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
    refetchOnWindowFocus: false, // Prevent refetch on window focus to avoid UI freezing
    refetchOnMount: false, // Prevent refetch on component mount if data exists
  });

  // Fetch council clearout schedule
  const { data: clearoutSchedule, error: clearoutError } = useQuery<{
    current: string[];
    next: string[];
    weekNumber?: number;
    lastUpdated: string;
    error?: string;
    isTransitionPeriod?: boolean;
    message?: string;
    dataSource?: string;
    warning?: string;
  }>({
    queryKey: ['/api/clearout-schedule'],
    enabled: isMapReady,
    retry: 2,
    staleTime: 60 * 60 * 1000, // Cache for 1 hour
  });

  // Fetch public toilets near current location with throttled requests
  const { data: publicToilets = [] } = useQuery<PublicToilet[]>({
    queryKey: ['/api/toilets', currentLocation?.lat, currentLocation?.lng],
    queryFn: async () => {
      if (!currentLocation) {
        console.log('🚽 No current location for toilet query');
        return [];
      }
      console.log('🚽 Fetching toilets for location:', currentLocation.lat, currentLocation.lng);
      const params = new URLSearchParams({
        lat: currentLocation.lat.toString(),
        lng: currentLocation.lng.toString(),
        radius: '5'
      });
      const response = await fetch(`/api/toilets?${params}`);
      if (!response.ok) throw new Error('Failed to fetch toilets');
      const toilets = await response.json();
      console.log('🚽 Received toilets:', toilets.length, 'toilets for location', currentLocation.lat, currentLocation.lng);
      return toilets;
    },
    enabled: !!currentLocation && isMapReady,
    retry: 1,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes to reduce requests
    refetchOnWindowFocus: false, // Prevent refetch on window focus
  });

  // Fetch demographics data for active clearout suburbs
  const { data: suburbDemographics = [] } = useQuery<any[]>({
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
      const response = await fetch(`/api/suburbs/demographics?${params}`);
      if (!response.ok) throw new Error('Failed to fetch demographics');
      return response.json();
    },
    enabled: !!clearoutSchedule && isMapReady,
    retry: 2,
    staleTime: 30 * 60 * 1000, // Cache for 30 minutes
  });



  // Initialize map
  useEffect(() => {
    const initMap = async () => {
      if (!mapRef.current || mapInstanceRef.current) return;

      try {
        // Import Leaflet dynamically
        const leaflet = await import('leaflet');
        L = leaflet.default;

        // Fix default markers
        delete (L.Icon.Default.prototype as any)._getIconUrl;
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
          iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
          shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        });

        // Initialize map centered on Brisbane
        const map = L.map(mapRef.current, {
          center: [-27.4705, 153.0260],
          zoom: 12,
          zoomControl: true,
          scrollWheelZoom: true,
          doubleClickZoom: true,
          boxZoom: true,
          keyboard: true,
          dragging: true,
          touchZoom: true,
          tap: true,
          tapTolerance: 15,
          wheelPxPerZoomLevel: 60,
        });

        // Add tiles with custom Mapbox style
        const tileConfig = getTileConfig();
        const tileLayer = L.tileLayer(tileConfig.url, {
          attribution: tileConfig.attribution,
          maxZoom: 19,
          tileSize: tileConfig.tileSize || 256,
          zoomOffset: tileConfig.zoomOffset || 0,
          subdomains: tileConfig.subdomains || 'abc',
          updateWhenIdle: false,
          updateWhenZooming: false,
          keepBuffer: 16,  // Increased from 12 to 16 for better rotation coverage
          padding: 4.0,    // Increased from 3.0 to 4.0 for wider tile loading
          bounds: null,    // No bounds restriction
          continuousWorld: true,  // Allows seamless world wrapping
          noWrap: false,   // Allow world wrapping
          detectRetina: true,
          crossOrigin: false,
          // Force cache clearing
          className: 'mapbox-tiles-fresh'
        });

        // Clear any existing tile cache
        if (tileLayer._tileCache) {
          tileLayer._tileCache.clear();
        }
        
        // Force immediate tile refresh
        tileLayer.on('tileloadstart', function(e) {
          e.tile.crossOrigin = '';
        });

        // Listen for tile loading events
        tileLayer.on('loading', () => {
          setIsLoadingTiles(true);
          console.log('🔄 Tiles loading started');
        });

        tileLayer.on('load', () => {
          setIsLoadingTiles(false);
          console.log('✅ Tiles loading completed');
        });

        tileLayer.addTo(map);

        mapInstanceRef.current = map;
        setIsMapReady(true);
      } catch (error) {
        console.error('Failed to initialize map:', error);
      }
    };

    initMap();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        setIsMapReady(false);
      }
    };
  }, []);

  // Update tile layer when map style changes
  useEffect(() => {
    if (!mapInstanceRef.current || !L) return;

    const updateTileLayer = () => {
      // Remove all existing tile layers
      mapInstanceRef.current.eachLayer((layer: any) => {
        if (layer instanceof L.TileLayer) {
          mapInstanceRef.current.removeLayer(layer);
        }
      });

      // Add new tile layer with custom style
      const tileConfig = getTileConfig();
      const tileLayer = L.tileLayer(tileConfig.url, {
        attribution: tileConfig.attribution,
        maxZoom: 19,
        tileSize: tileConfig.tileSize || 256,
        zoomOffset: tileConfig.zoomOffset || 0,
        subdomains: tileConfig.subdomains || 'abc',
        updateWhenIdle: false,
        updateWhenZooming: false,
        keepBuffer: 16,
        padding: 4.0,
        bounds: null,
        continuousWorld: true,
        noWrap: false,
        detectRetina: true,
        crossOrigin: false,
        // Force cache clearing
        className: 'mapbox-tiles-fresh'
      });

      // Clear any existing tile cache
      if (tileLayer._tileCache) {
        tileLayer._tileCache.clear();
      }
      
      // Force immediate tile refresh
      tileLayer.on('tileloadstart', function(e) {
        e.tile.crossOrigin = '';
      });

      // Listen for tile loading events
      tileLayer.on('loading', () => {
        setIsLoadingTiles(true);
        console.log('🔄 Tiles loading started');
      });

      tileLayer.on('load', () => {
        setIsLoadingTiles(false);
        console.log('✅ Tiles loading completed');
      });

      tileLayer.addTo(mapInstanceRef.current);
      
      // Add separate labels layer if needed
      updateLabelsLayer();
      
      console.log('🗺️ Updated tile layer to: custom-mapbox');
    };

    updateTileLayer();
  }, []); // No dependencies - always use custom style

  // Function to update labels layer
  const updateLabelsLayer = () => {
    if (!mapInstanceRef.current || !L) return;

    // Remove existing labels layer
    if (labelsLayerRef.current) {
      mapInstanceRef.current.removeLayer(labelsLayerRef.current);
      labelsLayerRef.current = null;
    }

    // Check if we should add labels layer - custom Mapbox style doesn't need labels overlay
    const shouldShowLabels = false; // Custom style has built-in labels

    if (shouldShowLabels) {
      // Add labels overlay for no-labels styles
      const labelsConfig = {
        url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd'
      };

      labelsLayerRef.current = L.tileLayer(labelsConfig.url, {
        attribution: labelsConfig.attribution,
        subdomains: labelsConfig.subdomains,
        opacity: 0.8,
        zIndex: 1000 // Ensure labels appear above base tiles
      });

      labelsLayerRef.current.addTo(mapInstanceRef.current);
      console.log('🏷️ Added labels layer for custom-mapbox');
    } else {
      console.log('🏷️ No labels layer needed for custom-mapbox');
    }
  };

  // Update labels layer when settings change
  useEffect(() => {
    updateLabelsLayer();
  }, [showLabels]); // Only depends on showLabels

  // Handle suburb boundaries with throttling to prevent excessive re-renders
  useEffect(() => {
    if (!mapInstanceRef.current || !L) return;

    // Throttle suburb boundary updates to prevent UI freezing
    let timeoutId: NodeJS.Timeout;
    
    const updateSuburbBoundaries = () => {
      // Clear existing suburb polygons
      suburbPolygonsRef.current.forEach(polygon => {
        try {
          mapInstanceRef.current.removeLayer(polygon);
        } catch (error) {
          console.warn('Error removing suburb polygon:', error);
        }
      });
      suburbPolygonsRef.current = [];

      // Only add if we have data and want to show suburbs - filter for current and next week only
      if (showSuburbs && suburbBoundaries.length > 0) {
        // Filter boundaries to show only current and next week clearouts
        const relevantBoundaries = suburbBoundaries.filter(suburb => {
          if (clearoutSchedule) {
            const suburbBaseName = suburb.name.split(',')[0].trim().toUpperCase();
            
            // Use exact matching for more precise filtering
            const isCurrentClearout = clearoutSchedule.current.some(name => 
              suburbBaseName === name.toUpperCase()
            );
            const isNextClearout = clearoutSchedule.next.some(name => 
              suburbBaseName === name.toUpperCase()
            );
            
            console.log(`Filtering ${suburbBaseName}: current=${isCurrentClearout}, next=${isNextClearout}`);
            return isCurrentClearout || isNextClearout;
          }
          return false;
        });
      
      // Add suburb boundary polygons with clearout-based styling
      relevantBoundaries.forEach(suburb => {
        if (suburb.coordinates && suburb.coordinates.length > 0) {
          // Determine color based on clearout schedule
          let color = '#6B7280';        // Default gray
          let fillColor = '#E5E7EB';    // Gray fill
          let borderStyle = '';         // Solid line
          let status = 'Clearout area';
          
          if (clearoutSchedule) {
            const suburbBaseName = suburb.name.split(',')[0].trim().toUpperCase();
            const isCurrentClearout = clearoutSchedule.current.some(name => 
              suburbBaseName === name.toUpperCase()
            );
            const isNextClearout = clearoutSchedule.next.some(name => 
              suburbBaseName === name.toUpperCase()
            );
            
            console.log(`${suburbBaseName}: current=${isCurrentClearout}, next=${isNextClearout}`);
            
            if (isCurrentClearout) {
              color = '#059669';        // Green border for current period
              fillColor = '#10B981';    // Green fill
              borderStyle = '';         // Solid border
              status = 'Current clearout period';
              console.log(`${suburbBaseName}: Setting GREEN colors - border: ${color}, fill: ${fillColor}`);
            } else if (isNextClearout) {
              color = '#2563EB';        // Blue border for next period
              fillColor = '#3B82F6';    // Blue fill  
              borderStyle = '10, 5';    // Dashed border
              status = 'Next clearout period';
              console.log(`${suburbBaseName}: Setting BLUE colors - border: ${color}, fill: ${fillColor}`);
            }
          }

          // Ensure coordinates are in correct format [lat, lng]
          const formattedCoords = suburb.coordinates.map((coord: number[]) => {
            // Handle both [lat, lng] and [lng, lat] formats
            if (Array.isArray(coord) && coord.length >= 2) {
              const lat = coord[0];
              const lng = coord[1];
              // Brisbane coordinates should have lat around -27 and lng around 153
              if (lat > 0 || lng < 0) {
                // Likely [lng, lat] format, swap them
                return [lng, lat];
              }
              return [lat, lng];
            }
            return coord;
          });

          console.log(`Creating polygon for ${suburb.name} with ${formattedCoords.length} coordinates`);
          
          const polygon = L.polygon(formattedCoords, {
            color: color,
            weight: 2,
            opacity: 0.8,
            fillColor: fillColor,
            fillOpacity: 0.15,
            dashArray: borderStyle,
            interactive: true
          }).addTo(mapInstanceRef.current);

          // Enhanced popup with clearout status
          polygon.bindPopup(`
            <div class="text-sm">
              <strong class="${status.includes('Current') ? 'text-green-700' : status.includes('Next') ? 'text-blue-700' : 'text-gray-700'}">${suburb.name.split(',')[0]}</strong><br/>
              <small class="text-gray-600">${status}</small>
              ${suburb.properties?.postcode ? `<br/><small>Postcode: ${suburb.properties.postcode}</small>` : ''}
              ${clearoutSchedule ? `<br/><small class="text-xs text-gray-500">Week ${clearoutSchedule.weekNumber}</small>` : ''}
            </div>
          `);

          // Add hover effects with proper typing
          polygon.on('mouseover', function(this: any) {
            this.setStyle({
              fillOpacity: 0.3,
              weight: 3
            });
          });

          polygon.on('mouseout', function(this: any) {
            this.setStyle({
              fillOpacity: 0.15,
              weight: 2
            });
          });

          suburbPolygonsRef.current.push(polygon);
        }
      });

        console.log(`Displayed ${relevantBoundaries.length} relevant suburb boundaries (current + next week clearouts)`);
      }
    };
    
    // Use timeout to throttle updates and prevent UI freezing
    timeoutId = setTimeout(updateSuburbBoundaries, 500);
    
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [suburbBoundaries, showSuburbs, clearoutSchedule]);

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

  // Handle public toilet markers
  useEffect(() => {
    console.log('🚽 Toilet markers useEffect triggered:', { 
      mapReady: !!mapInstanceRef.current, 
      leafletLoaded: !!L, 
      showToilets, 
      toiletCount: publicToilets.length,
      currentLocation: !!currentLocation
    });
    
    if (!mapInstanceRef.current || !L) return;

    // Clear existing toilet markers
    toiletMarkersRef.current.forEach(marker => {
      mapInstanceRef.current.removeLayer(marker);
    });
    toiletMarkersRef.current = [];

    // Only add toilet markers if showToilets is true and we have data
    if (showToilets && publicToilets.length > 0) {
      console.log('🚽 Adding toilet markers to map:', publicToilets.length, 'toilets');
      publicToilets.forEach(toilet => {
        const toiletIcon = L.divIcon({
          className: 'toilet-marker',
          html: `
            <div class="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shadow-lg border-2 border-white">
              🚽
            </div>
          `,
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });

        const marker = L.marker([toilet.lat, toilet.lng], { icon: toiletIcon })
          .addTo(mapInstanceRef.current)
          .bindPopup(`
            <div class="text-sm">
              <strong>${toilet.name}</strong><br/>
              ${toilet.address ? `${toilet.address}<br/>` : ''}
              ${toilet.distance ? `<small>📍 ${toilet.distance.toFixed(2)}km away</small><br/>` : ''}
              <small>Hours: ${toilet.openHours || '24/7'}</small><br/>
              ${toilet.accessible ? '<small>♿ Accessible</small><br/>' : ''}
              ${toilet.fee ? '<small>💰 Fee required</small>' : '<small>🆓 Free</small>'}
            </div>
          `);

        toiletMarkersRef.current.push(marker);
      });
      console.log('🚽 Successfully added', toiletMarkersRef.current.length, 'toilet markers to map');
    } else {
      console.log('🚽 Not adding toilet markers - showToilets:', showToilets, 'toiletCount:', publicToilets.length);
    }
  }, [publicToilets, showToilets, isMapReady, L]);

  // Handle persistent paths with new color system
  useEffect(() => {
    if (!mapInstanceRef.current || !L) return;

    // Clear existing historical routes
    historicalRoutesRef.current.forEach(route => {
      mapInstanceRef.current.removeLayer(route);
    });
    historicalRoutesRef.current = [];

    // Add persistent paths
    console.log('🗺️ Rendering persistent paths:', persistentPaths.length);
    persistentPaths.forEach((path, index) => {
      if (path.coordinates && path.coordinates.length > 1) {
        const pathStyle = getPathColor(index, pathColorScheme, persistentPaths.length);
        const routeCoords = path.coordinates.map((point: any) => [point.lat, point.lng]);
        
        console.log(`🗺️ Path ${index + 1}: "${path.name}" with ${path.coordinates.length} coordinates, color: ${pathStyle.color}, opacity: ${pathStyle.opacity}`);
        
        const polyline = L.polyline(routeCoords, {
          color: pathStyle.color,
          weight: pathStyle.weight,
          opacity: pathStyle.opacity,
          smoothFactor: 1
        }).addTo(mapInstanceRef.current);

        // Add popup with path info
        polyline.bindPopup(`
          <div class="text-sm">
            <strong>${path.name}</strong><br/>
            <small>Date: ${new Date(path.date).toLocaleDateString()}</small><br/>
            <small>Duration: ${Math.round(path.duration)} minutes</small><br/>
            <small>Distance: ${path.distance.toFixed(1)} km</small>
          </div>
        `);

        historicalRoutesRef.current.push(polyline);

        // Add start and end markers for paths
        if (path.coordinates.length > 1) {
          const startLoc = path.coordinates[0];
          const endLoc = path.coordinates[path.coordinates.length - 1];
          
          const startIcon = L.divIcon({
            className: 'path-start-marker',
            html: `
              <div class="w-3 h-3 rounded-full border-2 border-white shadow-lg" style="background-color: ${pathStyle.color}"></div>
            `,
            iconSize: [12, 12],
            iconAnchor: [6, 6]
          });

          const endIcon = L.divIcon({
            className: 'path-end-marker',
            html: `
              <div class="w-3 h-3 rounded-full border-2 border-white shadow-lg" style="background-color: ${pathStyle.color}">
                <div class="w-1 h-1 bg-white rounded-full absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"></div>
              </div>
            `,
            iconSize: [12, 12],
            iconAnchor: [6, 6]
          });

          const startMarker = L.marker([startLoc.lat, startLoc.lng], { icon: startIcon })
            .addTo(mapInstanceRef.current)
            .bindPopup(`<div class="text-sm"><strong>${path.name} Start</strong></div>`);

          const endMarker = L.marker([endLoc.lat, endLoc.lng], { icon: endIcon })
            .addTo(mapInstanceRef.current)
            .bindPopup(`<div class="text-sm"><strong>${path.name} End</strong></div>`);

          historicalRoutesRef.current.push(startMarker, endMarker);
        }
      }
    });
  }, [persistentPaths, pathColorScheme]);

  // Update current location marker (only when vehicle marker is not active)
  useEffect(() => {
    if (!mapInstanceRef.current || !L || !currentLocation) return;

    // Remove existing current location marker
    if (currentLocationMarkerRef.current) {
      mapInstanceRef.current.removeLayer(currentLocationMarkerRef.current);
      currentLocationMarkerRef.current = null;
    }

    // Skip creating dot marker when vehicle marker is being used (focuses on vehicle types)
    const isUsingVehicleMarker = focusArea && focusArea !== 'none';
    if (isUsingVehicleMarker) {
      // Always center on the vehicle marker, not just during recording
      if (markersRef.current.length === 0 && !hasInitialLocationRef.current) {
        mapInstanceRef.current.setView([currentLocation.lat, currentLocation.lng], 15);
        hasInitialLocationRef.current = true;
      } else {
        // Always center on vehicle marker when using vehicle focus - with smooth animation
        mapInstanceRef.current.setView([currentLocation.lat, currentLocation.lng], mapInstanceRef.current.getZoom(), {
          animate: true,
          duration: 1.0
        });
      }
      return;
    }

    // Add new current location marker only when vehicle marker is not used
    const icon = L.divIcon({
      className: 'current-location-marker',
      html: `
        <div class="relative">
          <div class="w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-lg ${isRecording ? 'pulse-dot' : ''}"></div>
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

    // Auto-center only on very first location, preserve zoom level
    if (markersRef.current.length === 0 && !hasInitialLocationRef.current) {
      mapInstanceRef.current.setView([currentLocation.lat, currentLocation.lng], 15);
      hasInitialLocationRef.current = true;
    } else if (isRecording) {
      // Only center on current location during recording sessions with smooth scrolling
      mapInstanceRef.current.setView([currentLocation.lat, currentLocation.lng], mapInstanceRef.current.getZoom(), { 
        animate: true,
        duration: 1.0, // Smooth scrolling - increased duration
        easeLinearity: 0.25 // Smooth easing
      });
    }
    // When not recording, let user scroll/zoom freely without auto-centering
  }, [currentLocation, currentSuburb, isRecording, focusArea]);

  // Handle vehicle marker display
  useEffect(() => {
    console.log('Vehicle marker effect triggered:', { 
      mapReady: !!mapInstanceRef.current, 
      leafletLoaded: !!L, 
      hasLocation: !!currentLocation,
      focusArea,
      currentLocation 
    });
    
    if (!mapInstanceRef.current || !L || !currentLocation) {
      console.log('Vehicle marker: Missing requirements');
      return;
    }

    // Only remove existing vehicle marker if location changed significantly or it doesn't exist
    const existingMarker = vehicleMarkerRef.current;
    let needsRecreation = !existingMarker;
    
    if (existingMarker) {
      const currentPos = existingMarker.getLatLng();
      const distance = calculateDistance(currentPos.lat, currentPos.lng, currentLocation.lat, currentLocation.lng) * 1000;
      needsRecreation = distance > 1; // Only recreate if moved more than 1 meter
    }
    
    if (needsRecreation && existingMarker) {
      console.log('Removed existing vehicle marker for position update');
      mapInstanceRef.current.removeLayer(existingMarker);
      vehicleMarkerRef.current = null;
    } else if (!needsRecreation && existingMarker) {
      // Just update position without recreating
      existingMarker.setLatLng([currentLocation.lat, currentLocation.lng]);
      return; // Skip recreation
    }

    // Create vehicle icon based on selected vehicle type
    let vehicleIcon;
    if (focusArea === 'imax-van') {
      // Calculate size based on zoom level for map scaling
      const currentZoom = mapInstanceRef.current.getZoom();
      const baseSize = 30; // Reduced from 60px to 30px (50% smaller)
      const scaleFactor = Math.max(0.5, Math.min(2, currentZoom / 15));
      const scaledSize = Math.round(baseSize * scaleFactor);
      
      // Use divIcon for IMAX van image - no rotation needed since map rotation is disabled
      vehicleIcon = L.divIcon({
        className: 'vehicle-marker-image',
        html: `<div style="width: ${scaledSize}px; height: ${scaledSize}px;">
          <img src="${imaxVanImage}" style="width: 100%; height: 100%; object-fit: contain;" />
        </div>`,
        iconSize: [scaledSize, scaledSize],
        iconAnchor: [scaledSize / 2, scaledSize / 2]
      });
    } else {
      // Use emoji icons for other vehicle types - keep pointing forward (no counter-rotation)
      const vehicleEmoji = getVehicleIcon(focusArea);
      vehicleIcon = L.divIcon({
        className: 'vehicle-marker',
        html: `
          <div class="text-3xl filter drop-shadow-lg bg-white/80 rounded-full p-1 border border-gray-300">
            ${vehicleEmoji}
          </div>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 20]
      });
    }

    // Create vehicle marker
    try {
      vehicleMarkerRef.current = L.marker([currentLocation.lat, currentLocation.lng], { 
        icon: vehicleIcon 
      }).addTo(mapInstanceRef.current);

      console.log('Vehicle marker created successfully at:', currentLocation.lat, currentLocation.lng);

      // Add popup with vehicle info
      vehicleMarkerRef.current.bindPopup(`
        <div class="text-sm">
          <strong>${focusArea.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}</strong><br/>
          <small>Vehicle Position</small><br/>
          <small>Lat: ${currentLocation.lat.toFixed(6)}</small><br/>
          <small>Lng: ${currentLocation.lng.toFixed(6)}</small>
        </div>
      `);

      // Always keep map centered on vehicle location (not just during recording)
      const currentZoom = mapInstanceRef.current.getZoom();
      mapInstanceRef.current.setView([currentLocation.lat, currentLocation.lng], currentZoom, { 
        animate: true,
        duration: 1.0
      });
      
      // Update map rotation based on driving direction
      updateMapRotationV2(currentLocation);
      
      // Add current location to route if recording
      if (isRecording) {
        // Only add point if it's significantly different from the last point
        const lastPoint = currentRoutePointsRef.current[currentRoutePointsRef.current.length - 1];
        let shouldAddPoint = true;
        
        if (lastPoint) {
          const distance = calculateDistance(lastPoint.lat, lastPoint.lng, currentLocation.lat, currentLocation.lng) * 1000;
          shouldAddPoint = distance > 1; // Only add if moved more than 1 meter
        }
        
        if (shouldAddPoint) {
          currentRoutePointsRef.current.push({ lat: currentLocation.lat, lng: currentLocation.lng });
          console.log('🔴 RECORDING: Added point to current route. Total points:', currentRoutePointsRef.current.length);
          console.log('🔴 RECORDING: State:', isRecording, 'Location:', currentLocation.lat, currentLocation.lng);
        }
        
        // Update current route display
        if (currentRoutePointsRef.current.length >= 2) {
          console.log('Drawing current route polyline with', currentRoutePointsRef.current.length, 'points');
          // Remove existing current route
          if (currentRoutePolylineRef.current) {
            mapInstanceRef.current.removeLayer(currentRoutePolylineRef.current);
          }

          // Add new current route polyline
          const routeCoords = currentRoutePointsRef.current.map(point => [point.lat, point.lng]);
          
          currentRoutePolylineRef.current = L.polyline(routeCoords, {
            color: '#EF4444',  // Red color for current session
            weight: 10,  // Double the thickness (was 5)
            opacity: 0.75,  // 75% opacity (was 0.9)
            smoothFactor: 1,
            dashArray: '10, 5'  // Dashed line to distinguish from historical routes
          }).addTo(mapInstanceRef.current);
        }
      }
    } catch (error) {
      console.error('Failed to create vehicle marker:', error);
    }
  }, [currentLocation, focusArea, isRecording, updateMapRotationV2]);

  // Add zoom event listener for vehicle marker scaling
  useEffect(() => {
    if (!mapInstanceRef.current || !vehicleMarkerRef.current) return;

    const handleZoomEnd = () => {
      // Trigger vehicle marker recreation to update size
      if (currentLocation) {
        // Remove and recreate marker with new size
        if (vehicleMarkerRef.current) {
          mapInstanceRef.current.removeLayer(vehicleMarkerRef.current);
        }
        
        const currentZoom = mapInstanceRef.current.getZoom();
        const baseSize = 30; // Reduced from 60px to 30px (50% smaller)
        const scaleFactor = Math.max(0.5, Math.min(2, currentZoom / 15));
        const scaledSize = Math.round(baseSize * scaleFactor);
        
        let vehicleIcon;
        if (focusArea === 'imax-van') {
          vehicleIcon = L.divIcon({
            className: 'vehicle-marker-image',
            html: `<div style="transform: rotate(${-mapRotation}deg); transform-origin: center; width: ${scaledSize}px; height: ${scaledSize}px;">
              <img src="${imaxVanImage}" style="width: 100%; height: 100%; object-fit: contain;" />
            </div>`,
            iconSize: [scaledSize, scaledSize],
            iconAnchor: [scaledSize / 2, scaledSize / 2]
          });
        } else {
          const vehicleEmoji = getVehicleIcon(focusArea);
          vehicleIcon = L.divIcon({
            className: 'vehicle-marker',
            html: `<div class="text-2xl filter drop-shadow-lg bg-white/80 rounded-full p-1 border border-gray-300">${vehicleEmoji}</div>`,
            iconSize: [scaledSize, scaledSize],
            iconAnchor: [scaledSize / 2, scaledSize / 2]
          });
        }

        vehicleMarkerRef.current = L.marker([currentLocation.lat, currentLocation.lng], { 
          icon: vehicleIcon 
        }).addTo(mapInstanceRef.current);

        vehicleMarkerRef.current.bindPopup(`
          <div class="text-sm">
            <strong>${focusArea.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}</strong><br/>
            <small>Vehicle Position</small><br/>
            <small>Lat: ${currentLocation.lat.toFixed(6)}</small><br/>
            <small>Lng: ${currentLocation.lng.toFixed(6)}</small>
          </div>
        `);
      }
    };

    mapInstanceRef.current.on('zoomend', handleZoomEnd);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.off('zoomend', handleZoomEnd);
      }
    };
  }, [currentLocation, focusArea, imaxVanImage, mapRotation]);

  // Update route polyline with throttling to prevent UI freezing
  useEffect(() => {
    if (!mapInstanceRef.current || !L || sessionLocations.length === 0) return;

    // Throttle route updates to prevent UI freezing
    let timeoutId: NodeJS.Timeout;
    
    const updateRoutePolyline = () => {
      // Remove existing route
      if (routePolylineRef.current) {
        try {
          mapInstanceRef.current.removeLayer(routePolylineRef.current);
        } catch (error) {
          console.warn('Error removing route polyline:', error);
        }
      }

      // Add new route if we have multiple points
      if (sessionLocations.length > 1) {
        const routeCoords = sessionLocations.map(loc => [loc.lat, loc.lng]);
        
        routePolylineRef.current = L.polyline(routeCoords, {
          color: '#10B981',
          weight: 8,  // Double the thickness (was 4)
          opacity: 0.75,  // 75% opacity (was 0.8)
          smoothFactor: 1
        }).addTo(mapInstanceRef.current);

        // Add route markers at significant points (reduced frequency to prevent UI freezing)
        sessionLocations.forEach((location, index) => {
          if (index % 20 === 0 || index === sessionLocations.length - 1) { // Every 20th point or last point
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
    };

    // Use timeout to throttle updates and prevent UI freezing
    timeoutId = setTimeout(updateRoutePolyline, 300);
    
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [sessionLocations]);



  // Reset current route when recording stops
  useEffect(() => {
    if (!isRecording && mapInstanceRef.current) {
      console.log('Recording stopped - cleaning up current route');
      // Clear current route points
      currentRoutePointsRef.current = [];
      
      // Remove current route polyline from map
      if (currentRoutePolylineRef.current) {
        console.log('Removing current route polyline from map');
        mapInstanceRef.current.removeLayer(currentRoutePolylineRef.current);
        currentRoutePolylineRef.current = null;
      }
      
      // Reset map rotation when not tracking
      const mapContainer = mapInstanceRef.current.getContainer();
      if (mapContainer) {
        mapContainer.style.transform = '';
        mapContainer.style.transformOrigin = '';
        mapContainer.style.transition = '';
      }
      setMapRotation(0);
      
      // Reset previous location for fresh bearing calculation
      previousLocationRef.current = null;
    }
  }, [isRecording]);

  const centerOnCurrentLocation = () => {
    if (mapInstanceRef.current && currentLocation) {
      mapInstanceRef.current.setView([currentLocation.lat, currentLocation.lng], 16);
    }
  };

  const toggleZoom = () => {
    if (!mapInstanceRef.current || !currentLocation) return;
    
    const currentZoom = mapInstanceRef.current.getZoom();
    
    if (isZoomedIn) {
      // Zoom out to see current clearout area
      setSavedZoomLevel(currentZoom);
      mapInstanceRef.current.setView([currentLocation.lat, currentLocation.lng], 13); // Clearout area view
      setIsZoomedIn(false);
      console.log('🔍 Zoomed out to clearout area view (zoom 13)');
    } else {
      // Zoom in to current location
      const closeZoom = savedZoomLevel > 15 ? savedZoomLevel : 17; // Use saved zoom or default close zoom
      mapInstanceRef.current.setView([currentLocation.lat, currentLocation.lng], closeZoom);
      setIsZoomedIn(true);
      console.log('🔍 Zoomed in to location (zoom', closeZoom, ')');
    }
  };

  return (
    <div className="relative h-full w-full">
      <div 
        ref={mapRef} 
        className="h-full w-full z-0" 
        style={{ 
          cursor: 'grab'
        }} 
      />
      
      {/* Current Suburb Display */}
      {currentLocation && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-20 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border px-4 py-2">
          <div className="text-sm font-medium text-gray-900 text-center">
            Current Location: <span className="text-blue-600">{currentSuburbName}</span>
          </div>
        </div>
      )}



      {/* Demographics Overlay */}
      {showDemographics && (
        <div className="absolute top-20 right-4 md:top-20 md:right-96 z-20 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border p-3 max-w-72">
          <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Suburb Demographics
          </h3>
          
          {suburbDemographics.length > 0 ? (
            <div className="space-y-3 text-xs max-h-96 overflow-y-auto">
              {suburbDemographics.map((suburb, index) => (
                <div key={suburb.name} className="border-b border-gray-200 pb-2 last:border-b-0">
                  <div className="font-medium text-gray-900 mb-1 flex items-center justify-between">
                    <span>{suburb.name}</span>
                    {suburb.starRating && (
                      <div className="flex items-center gap-1">
                        {[...Array(5)].map((_, i) => (
                          <span key={i} className={`text-sm ${i < suburb.starRating ? 'text-yellow-500' : 'text-gray-300'}`}>
                            ★
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="space-y-1 text-gray-600">
                    <div className="flex justify-between">
                      <span>Population:</span>
                      <span className="font-medium">{suburb.population?.toLocaleString() || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Density:</span>
                      <span className="font-medium">{suburb.populationDensity || 'N/A'} /km²</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Median Price:</span>
                      <span className="font-medium text-green-600">
                        {suburb.medianHousePrice ? `$${suburb.medianHousePrice.toLocaleString()}` : 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Median Income:</span>
                      <span className="font-medium">{suburb.medianIncome ? `$${suburb.medianIncome.toLocaleString()}` : 'N/A'}</span>
                    </div>
                    {suburb.clearoutStatus && (
                      <div className="text-xs mt-1">
                        <span className={`px-2 py-0.5 rounded text-white ${
                          suburb.clearoutStatus === 'current' ? 'bg-green-600' : 
                          suburb.clearoutStatus === 'next' ? 'bg-blue-600' : 'bg-gray-500'
                        }`}>
                          {suburb.clearoutStatus === 'current' ? 'Current clearout' : 
                           suburb.clearoutStatus === 'next' ? 'Next clearout' : 'No clearout'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-gray-500">
              Loading demographic data...
            </div>
          )}
          
          <div className="mt-2 pt-2 border-t border-gray-200 text-xs text-gray-500">
            Data: ABS Census 2021, CoreLogic Property Data
          </div>
        </div>
      )}

      {/* Map controls */}
      <div className="absolute bottom-[180px] right-4 md:bottom-[124px] md:right-96 z-20 flex flex-col gap-2">
        
        {/* Demographics button */}
        <Button
          onClick={() => setShowDemographics(!showDemographics)}
          size="sm"
          className={`${showDemographics ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-600 hover:bg-gray-700'} text-white shadow-lg`}
          title="Toggle suburb demographics"
        >
          <BarChart3 className="h-4 w-4" />
        </Button>
        

        
        {/* Toggle Zoom button */}
        <Button
          onClick={toggleZoom}
          size="sm"
          className="bg-primary hover:bg-blue-700 text-white shadow-lg"
          title={isZoomedIn ? "Zoom out to see whole suburb" : "Zoom in to current location"}
        >
          {isZoomedIn ? <ZoomOut className="h-4 w-4" /> : <ZoomIn className="h-4 w-4" />}
        </Button>
        

      </div>

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
