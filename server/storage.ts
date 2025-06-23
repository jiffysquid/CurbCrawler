import { sessions, locations, type Session, type Location, type InsertSession, type InsertLocation, type UpdateSession, type SessionWithStats } from "@shared/schema";

export interface IStorage {
  // Session methods
  createSession(session: InsertSession): Promise<Session>;
  getSession(id: number): Promise<Session | undefined>;
  updateSession(id: number, updates: UpdateSession): Promise<Session | undefined>;
  getAllSessions(): Promise<SessionWithStats[]>;
  getActiveSession(): Promise<Session | undefined>;
  
  // Location methods
  addLocation(location: InsertLocation): Promise<Location>;
  getSessionLocations(sessionId: number): Promise<Location[]>;
  getLatestLocation(sessionId: number): Promise<Location | undefined>;
}

export class MemStorage implements IStorage {
  private sessions: Map<number, Session>;
  private locations: Map<number, Location>;
  private sessionIdCounter: number;
  private locationIdCounter: number;

  constructor() {
    this.sessions = new Map();
    this.locations = new Map();
    this.sessionIdCounter = 1;
    this.locationIdCounter = 1;
  }

  async createSession(insertSession: InsertSession): Promise<Session> {
    const id = this.sessionIdCounter++;
    const session: Session = {
      id,
      startTime: insertSession.startTime,
      endTime: insertSession.endTime || null,
      duration: insertSession.duration || null,
      distance: insertSession.distance || null,
      isActive: insertSession.isActive || true,
      suburbsVisited: insertSession.suburbsVisited || null,
      routeCoordinates: insertSession.routeCoordinates || null,
      startLocation: insertSession.startLocation || null,
      endLocation: insertSession.endLocation || null,
    };
    this.sessions.set(id, session);
    return session;
  }

  async getSession(id: number): Promise<Session | undefined> {
    return this.sessions.get(id);
  }

  async updateSession(id: number, updates: UpdateSession): Promise<Session | undefined> {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    
    const updatedSession = { ...session, ...updates };
    this.sessions.set(id, updatedSession);
    return updatedSession;
  }

  async getAllSessions(): Promise<SessionWithStats[]> {
    const allSessions = Array.from(this.sessions.values());
    
    return allSessions.map(session => {
      const sessionLocations = Array.from(this.locations.values())
        .filter(loc => loc.sessionId === session.id);
      
      const locationCount = sessionLocations.length;
      const averageAccuracy = sessionLocations.length > 0 
        ? sessionLocations.reduce((sum, loc) => sum + (loc.accuracy || 0), 0) / sessionLocations.length
        : 0;

      return {
        ...session,
        locationCount,
        averageAccuracy,
      };
    }).sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  }

  async getActiveSession(): Promise<Session | undefined> {
    return Array.from(this.sessions.values()).find(session => session.isActive);
  }

  async addLocation(insertLocation: InsertLocation): Promise<Location> {
    const id = this.locationIdCounter++;
    const location: Location = {
      id,
      sessionId: insertLocation.sessionId,
      latitude: insertLocation.latitude,
      longitude: insertLocation.longitude,
      timestamp: insertLocation.timestamp,
      suburb: insertLocation.suburb || null,
      accuracy: insertLocation.accuracy || null,
    };
    this.locations.set(id, location);
    return location;
  }

  async getSessionLocations(sessionId: number): Promise<Location[]> {
    return Array.from(this.locations.values())
      .filter(location => location.sessionId === sessionId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  async getLatestLocation(sessionId: number): Promise<Location | undefined> {
    const sessionLocations = await this.getSessionLocations(sessionId);
    return sessionLocations[sessionLocations.length - 1];
  }
}

export const storage = new MemStorage();
