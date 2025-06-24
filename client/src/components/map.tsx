import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { LocationPoint, SuburbBoundary, PublicToilet, SessionWithStats } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { Crosshair, Focus, Info, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getVehicleFocusCoordinates, getVehicleIcon, calculateBearing, calculateDistance } from "@/lib/utils";
import imaxVanImage from "@assets/imax_1750683369388.png";

// Import Leaflet CSS
import 'leaflet/dist/leaflet.css';

// Leaflet instance
let L: any = null;

interface MapProps {
  currentLocation: { lat: number; lng: number; accuracy?: number } | null;
  sessionLocations: LocationPoint[];
  currentSuburb: string;
  isTracking: boolean;
  allSessions?: SessionWithStats[];
}

export default function Map({ currentLocation, sessionLocations, currentSuburb, isTracking, allSessions = [] }: MapProps) {
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
  const [showToilets, setShowToilets] = useState(true);
  const [focusArea, setFocusArea] = useState<string>('imax-van');
  const [mapRotation, setMapRotation] = useState(0);
  const [showInfo, setShowInfo] = useState(false);
  const [showDemographics, setShowDemographics] = useState(false);
  const [currentSuburbName, setCurrentSuburbName] = useState<string>('Unknown');
  const previousLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const { toast } = useToast();

  // Load settings from localStorage and listen for changes
  useEffect(() => {
    const savedFocusArea = localStorage.getItem('focusArea');
    const savedShowSuburbs = localStorage.getItem('showSuburbBoundaries');
    const savedShowToilets = localStorage.getItem('showToilets');
    
    if (savedFocusArea) setFocusArea(savedFocusArea);
    if (savedShowSuburbs) setShowSuburbs(savedShowSuburbs === 'true');
    if (savedShowToilets) setShowToilets(savedShowToilets === 'true');

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
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
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

  // Automatic map rotation based on driving direction
  const updateMapRotation = useCallback((newLocation: { lat: number; lng: number }) => {
    if (!mapInstanceRef.current || !isTracking) return;
    
    const prevLocation = previousLocationRef.current;
    if (!prevLocation) {
      // Store first location
      previousLocationRef.current = newLocation;
      return;
    }
    
    // Calculate bearing between previous and current location
    const bearing = calculateBearing(
      prevLocation.lat,
      prevLocation.lng,
      newLocation.lat,
      newLocation.lng
    );
    
    // Only update rotation if there's significant movement (>5 meters)
    const distance = calculateDistance(
      prevLocation.lat,
      prevLocation.lng,
      newLocation.lat,
      newLocation.lng
    ) * 1000; // Convert to meters
    
    if (distance > 5) {
      const mapContainer = mapInstanceRef.current.getContainer();
      if (mapContainer) {
        // Convert bearing to rotation angle (bearing is from north, we want map rotation)
        const rotationAngle = -(bearing - 90); // Adjust for map orientation
        setMapRotation(rotationAngle);
        mapContainer.style.transform = `rotate(${rotationAngle}deg)`;
        mapContainer.style.transformOrigin = 'center';
        mapContainer.style.transition = 'transform 0.5s ease-out';
      }
      
      // Update previous location
      previousLocationRef.current = newLocation;
    }
  }, [isTracking]);

  // Session colors for different paths
  const sessionColors = [
    '#10B981', // Green
    '#3B82F6', // Blue  
    '#F59E0B', // Orange
    '#EF4444', // Red
    '#8B5CF6', // Purple
    '#06B6D4', // Cyan
    '#F97316', // Orange-red
    '#84CC16', // Lime
    '#EC4899', // Pink
    '#6366F1'  // Indigo
  ];

  // Fetch suburb boundaries for Brisbane area
  const { data: suburbBoundaries = [], isError: suburbError } = useQuery<SuburbBoundary[]>({
    queryKey: ['/api/suburbs/boundaries'],
    enabled: isMapReady,
    retry: 2,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
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

  // Fetch public toilets near current location
  const { data: publicToilets = [] } = useQuery<PublicToilet[]>({
    queryKey: ['/api/toilets', currentLocation?.lat, currentLocation?.lng],
    queryFn: async () => {
      if (!currentLocation) return [];
      const params = new URLSearchParams({
        lat: currentLocation.lat.toString(),
        lng: currentLocation.lng.toString(),
        radius: '5'
      });
      const response = await fetch(`/api/toilets?${params}`);
      if (!response.ok) throw new Error('Failed to fetch toilets');
      return response.json();
    },
    enabled: !!currentLocation && isMapReady,
    retry: 2,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
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
      console.log('Fetching demographics with params:', params.toString());
      const response = await fetch(`/api/suburbs/demographics?${params}`);
      if (!response.ok) throw new Error('Failed to fetch demographics');
      const data = await response.json();
      console.log('Demographics data received:', data);
      return data;
    },
    enabled: !!clearoutSchedule && isMapReady,
    retry: 2,
    staleTime: 30 * 60 * 1000, // Cache for 30 minutes
  });

  // Debug demographics rendering conditions
  useEffect(() => {
    console.log('Demographics render conditions:', {
      showSuburbs,
      showDemographics,
      suburbDemographicsLength: suburbDemographics.length,
      clearoutSchedule: !!clearoutSchedule,
      isMapReady
    });
  }, [showSuburbs, showDemographics, suburbDemographics, clearoutSchedule, isMapReady]);

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
        });

        // Add OpenStreetMap tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 19
        }).addTo(map);

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

  // Handle suburb boundaries
  useEffect(() => {
    if (!mapInstanceRef.current || !L) return;

    // Clear existing suburb polygons
    suburbPolygonsRef.current.forEach(polygon => {
      mapInstanceRef.current.removeLayer(polygon);
    });
    suburbPolygonsRef.current = [];

    // Only add if we have data and want to show suburbs
    if (showSuburbs && suburbBoundaries.length > 0) {
      // Add suburb boundary polygons with clearout-based styling
      suburbBoundaries.forEach(suburb => {
        if (suburb.coordinates && suburb.coordinates.length > 0) {
          // Determine color based on clearout schedule
          let color = '#6B7280';        // Default gray
          let fillColor = '#9CA3AF';    // Default light gray
          let borderStyle = '5, 5';     // Default dashed
          let status = 'No clearout scheduled';
          
          if (clearoutSchedule) {
            console.log(`Checking suburb ${suburb.name} against clearout schedule:`, clearoutSchedule);
            
            const suburbBaseName = suburb.name.split(',')[0].trim();
            const isCurrentClearout = clearoutSchedule.current.some(name => 
              suburbBaseName.toLowerCase().includes(name.toLowerCase()) || 
              name.toLowerCase().includes(suburbBaseName.toLowerCase())
            );
            const isNextClearout = clearoutSchedule.next.some(name => 
              suburbBaseName.toLowerCase().includes(name.toLowerCase()) || 
              name.toLowerCase().includes(suburbBaseName.toLowerCase())
            );
            
            console.log(`${suburbBaseName}: current=${isCurrentClearout}, next=${isNextClearout}`);
            
            if (isCurrentClearout) {
              color = '#059669';        // Green border for current clearout
              fillColor = '#10B981';    // Light green fill
              borderStyle = '';         // Solid border
              status = 'Current clearout area (July 21-27)';
            } else if (isNextClearout) {
              color = '#2563EB';        // Blue border for next clearout
              fillColor = '#3B82F6';    // Light blue fill  
              borderStyle = '10, 5';    // Longer dashes
              status = 'Next clearout area (July 28-Aug 3)';
            }
          }

          const polygon = L.polygon(suburb.coordinates, {
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

      console.log(`Displayed ${suburbPolygonsRef.current.length} suburb boundaries with clearout schedule`);
    }
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
    if (!mapInstanceRef.current || !L) return;

    // Clear existing toilet markers
    toiletMarkersRef.current.forEach(marker => {
      mapInstanceRef.current.removeLayer(marker);
    });
    toiletMarkersRef.current = [];

    // Only add toilet markers if showToilets is true and we have data
    if (showToilets && publicToilets.length > 0) {
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
              <small>Hours: ${toilet.openHours || '24/7'}</small><br/>
              ${toilet.accessible ? '<small>♿ Accessible</small><br/>' : ''}
              ${toilet.fee ? '<small>💰 Fee required</small>' : '<small>🆓 Free</small>'}
            </div>
          `);

        toiletMarkersRef.current.push(marker);
      });
    }
  }, [publicToilets, showToilets]);

  // Handle historical session routes with different colors
  useEffect(() => {
    if (!mapInstanceRef.current || !L || !allSessions.length) return;

    // Clear existing historical routes
    historicalRoutesRef.current.forEach(route => {
      mapInstanceRef.current.removeLayer(route);
    });
    historicalRoutesRef.current = [];

    // Add historical session routes with different colors
    allSessions.forEach((session, index) => {
      if (session.routeCoordinates && Array.isArray(session.routeCoordinates) && session.routeCoordinates.length > 1) {
        const color = sessionColors[index % sessionColors.length];
        const routeCoords = session.routeCoordinates.map((point: any) => [point.lat, point.lng]);
        
        const polyline = L.polyline(routeCoords, {
          color: color,
          weight: 3,
          opacity: 0.7,
          smoothFactor: 1
        }).addTo(mapInstanceRef.current);

        // Add popup with session info
        polyline.bindPopup(`
          <div class="text-sm">
            <strong>Session ${session.id}</strong><br/>
            <small>Started: ${new Date(session.startTime).toLocaleDateString()}</small><br/>
            <small>Duration: ${session.duration ? Math.round(session.duration) : 0} minutes</small><br/>
            <small>Distance: ${session.distance?.toFixed(1) || '0.0'} km</small><br/>
            <small>Suburbs: ${session.suburbsVisited?.length || 0}</small>
          </div>
        `);

        historicalRoutesRef.current.push(polyline);

        // Add start and end markers for completed sessions
        if (!session.isActive && session.startLocation && session.endLocation) {
          const startLoc = session.startLocation as any;
          const endLoc = session.endLocation as any;
          
          if (startLoc.lat && startLoc.lng && endLoc.lat && endLoc.lng) {
            const startIcon = L.divIcon({
              className: 'session-start-marker',
              html: `
                <div class="w-3 h-3 rounded-full border-2 border-white shadow-lg" style="background-color: ${color}"></div>
              `,
              iconSize: [12, 12],
              iconAnchor: [6, 6]
            });

            const endIcon = L.divIcon({
              className: 'session-end-marker',
              html: `
                <div class="w-3 h-3 rounded-full border-2 border-white shadow-lg" style="background-color: ${color}">
                  <div class="w-1 h-1 bg-white rounded-full absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"></div>
                </div>
              `,
              iconSize: [12, 12],
              iconAnchor: [6, 6]
            });

            const startMarker = L.marker([startLoc.lat, startLoc.lng], { icon: startIcon })
              .addTo(mapInstanceRef.current)
              .bindPopup(`<div class="text-sm"><strong>Session ${session.id} Start</strong></div>`);

            const endMarker = L.marker([endLoc.lat, endLoc.lng], { icon: endIcon })
              .addTo(mapInstanceRef.current)
              .bindPopup(`<div class="text-sm"><strong>Session ${session.id} End</strong></div>`);

            historicalRoutesRef.current.push(startMarker, endMarker);
          }
        }
      }
    });
  }, [allSessions]);

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

    // Remove existing vehicle marker
    if (vehicleMarkerRef.current) {
      mapInstanceRef.current.removeLayer(vehicleMarkerRef.current);
      console.log('Removed existing vehicle marker');
    }

    // Create vehicle icon based on selected vehicle type
    let vehicleIcon;
    if (focusArea === 'imax-van') {
      // Calculate size based on zoom level for map scaling
      const currentZoom = mapInstanceRef.current.getZoom();
      const baseSize = 30;
      const scaleFactor = Math.max(0.5, Math.min(2, currentZoom / 15));
      const scaledSize = Math.round(baseSize * scaleFactor);
      
      // Use divIcon for better rotation control with IMAX van image
      vehicleIcon = L.divIcon({
        className: 'vehicle-marker-image',
        html: `<div style="transform: rotate(-${mapRotation}deg); transform-origin: center; width: ${scaledSize}px; height: ${scaledSize}px;">
          <img src="${imaxVanImage}" style="width: 100%; height: 100%; object-fit: contain;" />
        </div>`,
        iconSize: [scaledSize, scaledSize],
        iconAnchor: [scaledSize / 2, scaledSize / 2]
      });
    } else {
      // Use emoji icons for other vehicle types
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

      // Update map rotation based on driving direction
      updateMapRotation(currentLocation);
    } catch (error) {
      console.error('Failed to create vehicle marker:', error);
    }
  }, [currentLocation, focusArea, updateMapRotation]);

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
        const baseSize = 30;
        const scaleFactor = Math.max(0.5, Math.min(2, currentZoom / 15));
        const scaledSize = Math.round(baseSize * scaleFactor);
        
        let vehicleIcon;
        if (focusArea === 'imax-van') {
          vehicleIcon = L.divIcon({
            className: 'vehicle-marker-image',
            html: `<div style="transform: rotate(-${mapRotation}deg); transform-origin: center; width: ${scaledSize}px; height: ${scaledSize}px;">
              <img src="${imaxVanImage}" style="width: 100%; height: 100%; object-fit: contain;" />
            </div>`,
            iconSize: [scaledSize, scaledSize],
            iconAnchor: [scaledSize / 2, scaledSize / 2]
          });
        } else {
          const vehicleEmoji = getVehicleIcon(focusArea);
          vehicleIcon = L.divIcon({
            className: 'vehicle-marker',
            html: `<div style="transform: rotate(-${mapRotation}deg); transform-origin: center;" class="text-2xl filter drop-shadow-lg bg-white/80 rounded-full p-1 border border-gray-300">${vehicleEmoji}</div>`,
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

  const focusOnVehicle = () => {
    if (mapInstanceRef.current) {
      const coordinates = getVehicleFocusCoordinates(focusArea, currentLocation);
      mapInstanceRef.current.setView([coordinates.lat, coordinates.lng], coordinates.zoom);
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

      {/* Clearout Schedule Legend */}
      {showSuburbs && showInfo && (
        <div className="absolute top-4 right-4 md:top-6 md:right-96 z-20 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border p-3 max-w-64">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Council Clearout Schedule</h3>
          
          {clearoutSchedule?.error || clearoutSchedule?.isTransitionPeriod ? (
            <div className="space-y-2 text-xs">
              <div className="text-amber-600 bg-amber-50 p-2 rounded border border-amber-200">
                <strong>Notice:</strong><br />
                {clearoutSchedule.isTransitionPeriod 
                  ? "Council data unavailable during financial year transition (late June - mid July)"
                  : clearoutSchedule.message || "Council clearout data currently unavailable"
                }
              </div>
              <div className="text-gray-600 text-center">
                All suburbs displayed in gray
              </div>
            </div>
          ) : clearoutSchedule ? (
            <>
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 border-2 border-green-600 bg-green-100 rounded-sm"></div>
                  <span className="text-gray-700">Current clearout areas</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 border-2 border-blue-600 bg-blue-100 rounded-sm border-dashed"></div>
                  <span className="text-gray-700">Next clearout areas</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 border-2 border-gray-500 bg-gray-100 rounded-sm border-dashed"></div>
                  <span className="text-gray-700">No clearout scheduled</span>
                </div>
              </div>
              
              <div className="mt-2 pt-2 border-t border-gray-200">
                <div className="text-xs text-gray-600">
                  <div>Current: {clearoutSchedule.current.length > 0 ? clearoutSchedule.current.join(', ') : 'None'}</div>
                  <div>Next: {clearoutSchedule.next.length > 0 ? clearoutSchedule.next.join(', ') : 'None'}</div>
                  {clearoutSchedule.warning && (
                    <div className="text-amber-600 mt-1 text-xs">⚠️ {clearoutSchedule.warning}</div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="text-xs text-gray-500 text-center">
              Loading clearout schedule...
            </div>
          )}
        </div>
      )}

      {/* Demographics Overlay */}
      {showSuburbs && showDemographics && suburbDemographics.length > 0 && (
        <div className="absolute top-20 right-4 md:top-20 md:right-96 z-20 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border p-3 max-w-72">
          <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Suburb Demographics
          </h3>
          
          <div className="space-y-3 text-xs max-h-96 overflow-y-auto">
            {suburbDemographics.map((suburb, index) => (
              <div key={suburb.name} className="border-b border-gray-200 pb-2 last:border-b-0">
                <div className="font-medium text-gray-900 mb-1">{suburb.name}</div>
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
          
          <div className="mt-2 pt-2 border-t border-gray-200 text-xs text-gray-500">
            Data: ABS Census 2021, CoreLogic Property Data
          </div>
        </div>
      )}

      {/* Map controls */}
      <div className="absolute bottom-20 right-4 md:bottom-6 md:right-96 z-20 flex flex-col gap-2">
        
        {/* Demographics button */}
        <Button
          onClick={() => setShowDemographics(!showDemographics)}
          size="sm"
          className={`${showDemographics ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-600 hover:bg-gray-700'} text-white shadow-lg`}
          title="Toggle suburb demographics"
        >
          <BarChart3 className="h-4 w-4" />
        </Button>
        
        {/* Info button */}
        <Button
          onClick={() => setShowInfo(!showInfo)}
          size="sm"
          className={`${showInfo ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-600 hover:bg-gray-700'} text-white shadow-lg`}
          title="Toggle clearout schedule info"
        >
          <Info className="h-4 w-4" />
        </Button>
        
        {/* Focus on Vehicle button */}
        <Button
          onClick={focusOnVehicle}
          size="sm"
          className="bg-primary hover:bg-blue-700 text-white shadow-lg"
          title={`Focus on vehicle (${focusArea.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())})`}
        >
          <Focus className="h-4 w-4" />
        </Button>
        
        {/* Center on current location button */}
        {currentLocation && (
          <Button
            onClick={centerOnCurrentLocation}
            size="sm"
            className="bg-gray-600 hover:bg-gray-700 text-white shadow-lg"
            title="Center on current location"
          >
            <Crosshair className="h-4 w-4" />
          </Button>
        )}
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
