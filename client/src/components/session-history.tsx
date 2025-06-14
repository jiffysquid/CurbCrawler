import { SessionWithStats } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, MapPin, Route } from "lucide-react";

interface SessionHistoryProps {
  sessions: SessionWithStats[];
  isLoading: boolean;
  isMobile?: boolean;
}

export default function SessionHistory({ sessions, isLoading, isMobile = false }: SessionHistoryProps) {
  const formatDuration = (minutes: number | null) => {
    if (!minutes) return 'N/A';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === now.toDateString()) {
      return `Today, ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
    } else if (date.toDateString() === yesterday.toDateString()) {
      return `Yesterday, ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
    } else {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    }
  };

  const formatSuburbs = (suburbs: string[] | null) => {
    if (!suburbs || suburbs.length === 0) return 'No suburbs recorded';
    if (suburbs.length <= 3) return suburbs.join(' → ');
    return `${suburbs.slice(0, 3).join(' → ')} + ${suburbs.length - 3} more`;
  };

  const getTotalStats = () => {
    const totalSessions = sessions.length;
    const totalDistance = sessions.reduce((sum, session) => sum + (session.distance || 0), 0);
    return { totalSessions, totalDistance: totalDistance.toFixed(1) };
  };

  const stats = getTotalStats();

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        {!isMobile && (
          <div className="bg-gray-50 border-b border-gray-200 p-4 -m-4 mb-4">
            <div className="grid grid-cols-2 gap-4 text-center">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          </div>
        )}
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`${isMobile ? 'space-y-4' : 'flex-1 overflow-y-auto sidebar-scroll'}`}>
      {/* Quick Stats - Desktop only */}
      {!isMobile && (
        <div className="p-4 bg-gray-50 border-b border-gray-200">
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-gray-900">{stats.totalSessions}</div>
              <div className="text-xs text-gray-500">Total Sessions</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{stats.totalDistance}km</div>
              <div className="text-xs text-gray-500">Total Distance</div>
            </div>
          </div>
        </div>
      )}

      {/* Session History */}
      <div className="p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Recent Sessions</h3>
        
        {sessions.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-6 text-center">
              <MapPin className="h-8 w-8 text-gray-400 mx-auto mb-2" />
              <div className="text-sm text-gray-500">No sessions recorded yet</div>
              <div className="text-xs text-gray-400 mt-1">Start your first tracking session to see history here</div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => (
              <Card key={session.id} className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-3">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="font-medium text-gray-900 text-sm">
                        {formatDate(session.startTime)}
                      </div>
                      <div className="text-xs text-gray-500 flex items-center space-x-3 mt-1">
                        <span className="flex items-center space-x-1">
                          <Clock className="h-3 w-3" />
                          <span>{formatDuration(session.duration)}</span>
                        </span>
                        <span className="flex items-center space-x-1">
                          <Route className="h-3 w-3" />
                          <span>{session.distance?.toFixed(1) || '0.0'} km</span>
                        </span>
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      session.isActive 
                        ? 'bg-secondary/10 text-secondary' 
                        : 'bg-green-100 text-green-800'
                    }`}>
                      {session.isActive ? 'Active' : 'Completed'}
                    </span>
                  </div>
                  <div className="text-xs text-gray-600">
                    <div className="flex items-start space-x-1">
                      <MapPin className="h-3 w-3 mt-0.5 text-gray-400" />
                      <span className="line-clamp-2">
                        {formatSuburbs(session.suburbsVisited)}
                      </span>
                    </div>
                  </div>
                  {session.locationCount > 0 && (
                    <div className="text-xs text-gray-400 mt-1">
                      {session.locationCount} location points recorded
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
