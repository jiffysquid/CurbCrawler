/**
 * GPS Interpolator - Smooths GPS position updates through interpolation
 * This sits between raw GPS data and the camera system to provide smooth movement
 */

export interface GPSPosition {
  lat: number;
  lng: number;
  accuracy?: number;
  timestamp?: number;
}

export class GPSInterpolator {
  private currentPosition: GPSPosition | null = null;
  private targetPosition: GPSPosition | null = null;
  private interpolationStartTime: number = 0;
  private interpolationDuration: number = 500; // 500ms interpolation
  private animationFrame: number | null = null;
  private onPositionUpdate?: (position: GPSPosition) => void;

  constructor(onPositionUpdate?: (position: GPSPosition) => void) {
    this.onPositionUpdate = onPositionUpdate;
  }

  setPositionCallback(callback: (position: GPSPosition) => void) {
    this.onPositionUpdate = callback;
  }

  // Main method: feed new GPS position and start smooth interpolation
  updatePosition(newPosition: GPSPosition) {
    const now = performance.now();
    
    // If this is the first position, set it directly
    if (!this.currentPosition) {
      this.currentPosition = { ...newPosition };
      this.targetPosition = { ...newPosition };
      this.onPositionUpdate?.(this.currentPosition);
      console.log('🎯 GPS Interpolator: Initial position set to:', newPosition.lat.toFixed(6), newPosition.lng.toFixed(6));
      return;
    }

    // Calculate distance to determine if we should interpolate
    const distance = this.calculateDistance(this.currentPosition, newPosition);
    
    // If movement is very small (< 1 meter), skip interpolation
    if (distance < 0.000009) { // ~1 meter in degrees
      console.log('🔍 GPS Interpolator: Small movement, skipping interpolation');
      return;
    }

    // Set new target and start interpolation
    this.targetPosition = { ...newPosition };
    this.interpolationStartTime = now;
    
    console.log('🚀 GPS Interpolator: Starting interpolation from', 
      this.currentPosition.lat.toFixed(6), this.currentPosition.lng.toFixed(6), 
      'to', newPosition.lat.toFixed(6), newPosition.lng.toFixed(6),
      `(${(distance * 111000).toFixed(1)}m)`);

    // Start the interpolation animation
    this.startInterpolation();
  }

  private startInterpolation() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }

    const animate = () => {
      if (!this.currentPosition || !this.targetPosition) return;

      const now = performance.now();
      const elapsed = now - this.interpolationStartTime;
      const progress = Math.min(elapsed / this.interpolationDuration, 1);

      // Use ease-out cubic for smooth deceleration
      const easedProgress = 1 - Math.pow(1 - progress, 3);

      // Interpolate between current and target positions
      const interpolatedPosition: GPSPosition = {
        lat: this.lerp(this.currentPosition.lat, this.targetPosition.lat, easedProgress),
        lng: this.lerp(this.currentPosition.lng, this.targetPosition.lng, easedProgress),
        accuracy: this.targetPosition.accuracy,
        timestamp: this.targetPosition.timestamp
      };

      // Update current position and notify callback
      this.currentPosition = interpolatedPosition;
      this.onPositionUpdate?.(interpolatedPosition);

      // Continue animation if not complete
      if (progress < 1) {
        this.animationFrame = requestAnimationFrame(animate);
      } else {
        console.log('✅ GPS Interpolator: Interpolation complete');
        this.animationFrame = null;
      }
    };

    this.animationFrame = requestAnimationFrame(animate);
  }

  // Linear interpolation
  private lerp(start: number, end: number, progress: number): number {
    return start + (end - start) * progress;
  }

  // Calculate distance between two GPS points (rough approximation)
  private calculateDistance(pos1: GPSPosition, pos2: GPSPosition): number {
    return Math.sqrt(
      Math.pow(pos2.lat - pos1.lat, 2) + 
      Math.pow(pos2.lng - pos1.lng, 2)
    );
  }

  // Set interpolation duration (default 500ms)
  setInterpolationDuration(duration: number) {
    this.interpolationDuration = Math.max(100, Math.min(2000, duration));
    console.log('⏱️ GPS Interpolator: Duration set to', this.interpolationDuration, 'ms');
  }

  // Get current interpolated position
  getCurrentPosition(): GPSPosition | null {
    return this.currentPosition;
  }

  // Stop any ongoing interpolation
  stop() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  // Check if interpolation is active
  isInterpolating(): boolean {
    return this.animationFrame !== null;
  }
}