export interface KMLPoint {
  lat: number;
  lng: number;
  altitude?: number;
  timestamp?: string;
}

export class KMLSimulator {
  private points: KMLPoint[] = [];
  private currentIndex = 0;
  private isRunning = false;
  private intervalId: number | null = null;
  private onLocationUpdate?: (location: { lat: number; lng: number; accuracy?: number }) => void;

  constructor() {}

  async loadKMLFile(kmlContent: string): Promise<void> {
    this.points = this.parseKMLCoordinates(kmlContent);
    console.log(`🗺️ KML loaded with ${this.points.length} GPS points`);
  }

  private parseKMLCoordinates(kmlContent: string): KMLPoint[] {
    const points: KMLPoint[] = [];
    
    // Extract coordinates using regex
    const coordRegex = /<gx:coord>([0-9.-]+)\s+([0-9.-]+)\s+([0-9.-]+)<\/gx:coord>/g;
    let match;
    
    while ((match = coordRegex.exec(kmlContent)) !== null) {
      const lng = parseFloat(match[1]);
      const lat = parseFloat(match[2]);
      const altitude = parseFloat(match[3]);
      
      if (!isNaN(lat) && !isNaN(lng)) {
        points.push({
          lat,
          lng,
          altitude: !isNaN(altitude) ? altitude : undefined
        });
      }
    }
    
    return points;
  }

  setLocationCallback(callback: (location: { lat: number; lng: number; accuracy?: number }) => void) {
    console.log('🔗 KML: Setting location callback, callback provided:', typeof callback);
    this.onLocationUpdate = callback;
    console.log('🔗 KML: Callback stored, onLocationUpdate is now:', typeof this.onLocationUpdate);
  }

  startSimulation(speedMultiplier: number = 1) {
    if (this.isRunning || this.points.length === 0) return;
    
    console.log('🔗 KML: Starting simulation, callback available:', typeof this.onLocationUpdate);
    
    this.isRunning = true;
    this.currentIndex = 0;
    
    console.log(`🚗 Starting KML simulation with ${this.points.length} points (speed: ${speedMultiplier}x)`);
    
    // Simulate GPS updates every 2000ms divided by speed multiplier (slower for stability)
    const interval = Math.max(1000, 2000 / speedMultiplier);
    
    this.intervalId = window.setInterval(() => {
      if (this.currentIndex >= this.points.length) {
        // Loop back to beginning for continuous simulation
        this.currentIndex = 0;
        console.log('🔄 KML simulation reached end, looping back to start');
      }
      
      const point = this.points[this.currentIndex];
      
      // Validate point data before processing
      if (!point || typeof point.lat !== 'number' || typeof point.lng !== 'number' || 
          isNaN(point.lat) || isNaN(point.lng)) {
        console.error(`❌ KML: Invalid point data at index ${this.currentIndex}:`, point);
        this.currentIndex++;
        return;
      }

      // Try callback first (for compatibility)
      if (this.onLocationUpdate) {
        try {
          this.onLocationUpdate({
            lat: point.lat,
            lng: point.lng,
            accuracy: 5 // Simulate good GPS accuracy
          });
        } catch (error) {
          console.error(`❌ KML: Location callback failed:`, error);
        }
      }
      
      // Direct window callback approach
      if ((window as any).kmlLocationCallback) {
        try {
          (window as any).kmlLocationCallback({
            lat: point.lat,
            lng: point.lng,
            accuracy: 5
          });
        } catch (error) {
          console.error(`❌ KML: Global callback failed:`, error);
        }
      }
      
      // Reduced logging for performance
      if (this.currentIndex % 10 === 0) { // Log every 10th point
        console.log(`📍 KML simulation: Point ${this.currentIndex + 1}/${this.points.length} - ${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`);
      }
      
      this.currentIndex++;
    }, interval);
  }

  stopSimulation() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('⏹️ KML simulation stopped');
  }
  
  // Restart simulation from beginning for continuous playback
  restartSimulation(speedMultiplier: number = 1) {
    this.stopSimulation();
    this.currentIndex = 0;
    console.log('🔄 Restarting KML simulation from beginning');
    this.startSimulation(speedMultiplier);
  }

  jumpToPoint(index: number) {
    if (index >= 0 && index < this.points.length) {
      this.currentIndex = index;
      const point = this.points[index];
      
      if (this.onLocationUpdate) {
        this.onLocationUpdate({
          lat: point.lat,
          lng: point.lng,
          accuracy: 5
        });
      }
      
      console.log(`⏭️ Jumped to point ${index + 1}/${this.points.length}`);
    }
  }

  getCurrentProgress(): { current: number; total: number; percentage: number } {
    return {
      current: this.currentIndex,
      total: this.points.length,
      percentage: this.points.length > 0 ? (this.currentIndex / this.points.length) * 100 : 0
    };
  }

  getAllPoints(): KMLPoint[] {
    return this.points;
  }

  isSimulationRunning(): boolean {
    return this.isRunning;
  }
}

export const kmlSimulator = new KMLSimulator();