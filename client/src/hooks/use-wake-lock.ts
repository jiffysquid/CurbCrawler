import { useEffect, useRef, useState } from 'react';

export function useWakeLock() {
  const [isSupported, setIsSupported] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    // Check if Wake Lock API is supported
    if ('wakeLock' in navigator) {
      setIsSupported(true);
    }
  }, []);

  const requestWakeLock = async () => {
    if (!isSupported) {
      console.log('Wake Lock API not supported');
      return false;
    }

    // Release any existing wake lock first
    if (wakeLockRef.current && !wakeLockRef.current.released) {
      try {
        await wakeLockRef.current.release();
        console.log('Released existing wake lock before requesting new one');
      } catch (error) {
        console.log('Error releasing existing wake lock:', error);
      }
    }

    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen');
      setIsActive(true);
      
      console.log('Screen wake lock activated successfully');
      
      // Listen for wake lock being released
      wakeLockRef.current.addEventListener('release', () => {
        console.log('Screen wake lock released by system');
        setIsActive(false);
        wakeLockRef.current = null;
      });
      
      return true;
    } catch (error) {
      console.error('Failed to request wake lock:', error);
      setIsActive(false);
      return false;
    }
  };

  const releaseWakeLock = async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
        setIsActive(false);
        console.log('Screen wake lock released manually');
      } catch (error) {
        console.error('Failed to release wake lock:', error);
      }
    }
  };

  // Auto-reactivate wake lock when page becomes visible (handles when user switches apps)
  useEffect(() => {
    const handleVisibilityChange = () => {
      console.log('Visibility changed:', document.visibilityState, 'isActive:', isActive, 'wakeLock exists:', !!wakeLockRef.current);
      
      if (document.visibilityState === 'visible' && isActive) {
        // Always try to reacquire wake lock when becoming visible during active session
        console.log('Document visible again, re-requesting wake lock');
        requestWakeLock();
      }
    };

    const handlePageFocus = () => {
      console.log('Page focused, isActive:', isActive, 'wakeLock exists:', !!wakeLockRef.current);
      
      if (isActive) {
        // Always try to reacquire wake lock when page gets focus during active session
        console.log('Page focused again, re-requesting wake lock');
        requestWakeLock();
      }
    };

    const handlePageBlur = () => {
      console.log('Page lost focus');
      // Don't release wake lock on blur, just log it
    };

    // Listen for app becoming active/inactive (mobile specific)
    const handleAppStateChange = () => {
      console.log('App state changed, visibility:', document.visibilityState);
      if (document.visibilityState === 'visible' && isActive) {
        // Small delay to ensure the app is fully active
        setTimeout(() => {
          console.log('App became active, re-requesting wake lock');
          requestWakeLock();
        }, 100);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handlePageFocus);
    window.addEventListener('blur', handlePageBlur);
    
    // Listen for page show event (handles when returning from other apps)
    window.addEventListener('pageshow', handleAppStateChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handlePageFocus);
      window.removeEventListener('blur', handlePageBlur);
      window.removeEventListener('pageshow', handleAppStateChange);
    };
  }, [isActive]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release();
      }
    };
  }, []);

  return {
    isSupported,
    isActive,
    requestWakeLock,
    releaseWakeLock
  };
}