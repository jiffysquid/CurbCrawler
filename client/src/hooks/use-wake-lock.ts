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

    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen');
      setIsActive(true);
      
      console.log('Screen wake lock activated');
      
      // Listen for wake lock being released
      wakeLockRef.current.addEventListener('release', () => {
        console.log('Screen wake lock released');
        setIsActive(false);
      });
      
      return true;
    } catch (error) {
      console.error('Failed to request wake lock:', error);
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

  // Auto-reactivate wake lock when page becomes visible (handles when user switches tabs)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isActive && !wakeLockRef.current) {
        console.log('Document visible again, re-requesting wake lock');
        requestWakeLock();
      }
    };

    const handlePageFocus = () => {
      if (isActive && !wakeLockRef.current) {
        console.log('Page focused again, re-requesting wake lock');
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handlePageFocus);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handlePageFocus);
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