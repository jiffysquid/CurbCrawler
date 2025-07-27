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

  // Enhanced wake lock management for app focus changes and background operation
  useEffect(() => {
    const handleVisibilityChange = () => {
      console.log('Visibility changed:', document.visibilityState, 'isActive:', isActive, 'wakeLock exists:', !!wakeLockRef.current);
      
      if (document.visibilityState === 'visible') {
        console.log('App state changed, visibility:', document.visibilityState);
        
        // When app becomes visible, check if we should have an active wake lock
        if (isActive || (wakeLockRef.current && !wakeLockRef.current.released)) {
          console.log('Document visible again, re-requesting wake lock to maintain screen lock');
          requestWakeLock();
        }
      } else if (document.visibilityState === 'hidden') {
        console.log('App lost focus but maintaining wake lock state for background operation');
        // Don't release wake lock when app goes to background during recording
        // Wake lock should persist in background to keep screen on
      }
    };

    const handlePageFocus = () => {
      console.log('Page gained focus, checking wake lock status');
      // Always try to reacquire wake lock when page regains focus during active session
      if (isActive) {
        setTimeout(() => {
          console.log('Page focus restored, re-requesting wake lock after delay');
          requestWakeLock();
        }, 100); // Small delay to ensure proper reacquisition
      }
    };

    const handlePageBlur = () => {
      console.log('Page lost focus but keeping wake lock active for recording');
      // Don't release wake lock on blur - maintain for background recording
    };

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

    // Add multiple event listeners for comprehensive focus management
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handlePageFocus);
    window.addEventListener('blur', handlePageBlur);
    window.addEventListener('pageshow', handleAppStateChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handlePageFocus);
      window.removeEventListener('blur', handlePageBlur);
      window.removeEventListener('pageshow', handleAppStateChange);
    };
  }, [isActive, requestWakeLock]);

  // Additional effect to monitor and maintain wake lock during active sessions
  useEffect(() => {
    let wakeLockMonitor: NodeJS.Timeout;
    
    if (isActive) {
      // Monitor wake lock every 5 seconds during active sessions
      wakeLockMonitor = setInterval(() => {
        if (!wakeLockRef.current || wakeLockRef.current.released) {
          console.log('Wake lock lost during active session, attempting to reacquire...');
          requestWakeLock();
        }
      }, 5000);
    }

    return () => {
      if (wakeLockMonitor) {
        clearInterval(wakeLockMonitor);
      }
    };
  }, [isActive, requestWakeLock]);

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
    releaseWakeLock,
  };
}