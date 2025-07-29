import { useMemo } from "react";
import { SessionWithStats } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Clock, Route, TrendingUp } from "lucide-react";
import { loadPersistentPaths } from "@/lib/utils";

interface SessionTotalsProps {
  sessions: SessionWithStats[];
}

export default function SessionTotals({ sessions }: SessionTotalsProps) {
  const stats = useMemo(() => {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay()); // Start of current week (Sunday)
    startOfWeek.setHours(0, 0, 0, 0);

    // Calculate stats from persistent paths (more accurate than sessions)
    const persistentPaths = loadPersistentPaths();
    
    // Filter paths for this week
    const thisWeekPaths = persistentPaths.filter(path => {
      const pathDate = new Date(path.date);
      return pathDate >= startOfWeek;
    });

    // All time stats from persistent paths
    const allTimeDistance = persistentPaths.reduce((total, path) => total + (path.distance || 0), 0);
    const allTimeDuration = persistentPaths.reduce((total, path) => total + (path.duration || 0), 0);

    // This week stats
    const thisWeekDistance = thisWeekPaths.reduce((total, path) => total + (path.distance || 0), 0);
    const thisWeekDuration = thisWeekPaths.reduce((total, path) => total + (path.duration || 0), 0);

    return {
      thisWeek: {
        sessions: thisWeekPaths.length,
        distance: thisWeekDistance,
        duration: thisWeekDuration
      },
      allTime: {
        sessions: persistentPaths.length,
        distance: allTimeDistance,
        duration: allTimeDuration
      }
    };
  }, [sessions]);

  const formatDuration = (minutes: number) => {
    if (minutes < 60) {
      return `${Math.round(minutes)}m`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const formatDistance = (km: number) => {
    if (km < 1) {
      return `${Math.round(km * 1000)}m`;
    }
    return `${km.toFixed(1)}km`;
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="h-5 w-5 text-blue-600" />
        <h2 className="text-lg font-semibold">Recording Totals</h2>
      </div>

      {/* This Week Stats */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4 text-green-600" />
            This Week
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-green-600">{stats.thisWeek.sessions}</div>
              <div className="text-xs text-muted-foreground">Sessions</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600">{formatDistance(stats.thisWeek.distance)}</div>
              <div className="text-xs text-muted-foreground">Distance</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600">{formatDuration(stats.thisWeek.duration)}</div>
              <div className="text-xs text-muted-foreground">Time</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* All Time Stats */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-blue-600" />
            All Time
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-blue-600">{stats.allTime.sessions}</div>
              <div className="text-xs text-muted-foreground">Sessions</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-blue-600">{formatDistance(stats.allTime.distance)}</div>
              <div className="text-xs text-muted-foreground">Distance</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-blue-600">{formatDuration(stats.allTime.duration)}</div>
              <div className="text-xs text-muted-foreground">Time</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {stats.allTime.sessions === 0 && (
        <Card className="border-dashed">
          <CardContent className="p-6 text-center">
            <Route className="h-8 w-8 text-gray-400 mx-auto mb-2" />
            <div className="text-sm text-muted-foreground">No recordings yet</div>
            <div className="text-xs text-muted-foreground mt-1">Start your first recording session to see totals here</div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}