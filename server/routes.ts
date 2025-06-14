import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertSessionSchema, insertLocationSchema, updateSessionSchema } from "@shared/schema";
import { z } from "zod";
import axios from "axios";

// ODS API integration for Brisbane suburb boundaries
const ODS_API_KEY = process.env.ODS_API_KEY || process.env.VITE_ODS_API_KEY || "";
const QLD_DATA_API_URL = "https://www.data.qld.gov.au/api/3/action/datastore_search";

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Session routes
  app.post("/api/sessions", async (req, res) => {
    try {
      const sessionData = insertSessionSchema.parse(req.body);
      const session = await storage.createSession(sessionData);
      res.json(session);
    } catch (error) {
      console.error("Error creating session:", error);
      res.status(400).json({ message: "Invalid session data" });
    }
  });

  app.get("/api/sessions", async (req, res) => {
    try {
      const sessions = await storage.getAllSessions();
      res.json(sessions);
    } catch (error) {
      console.error("Error fetching sessions:", error);
      res.status(500).json({ message: "Failed to fetch sessions" });
    }
  });

  app.get("/api/sessions/active", async (req, res) => {
    try {
      const activeSession = await storage.getActiveSession();
      res.json(activeSession || null);
    } catch (error) {
      console.error("Error fetching active session:", error);
      res.status(500).json({ message: "Failed to fetch active session" });
    }
  });

  app.get("/api/sessions/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const session = await storage.getSession(id);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      res.json(session);
    } catch (error) {
      console.error("Error fetching session:", error);
      res.status(500).json({ message: "Failed to fetch session" });
    }
  });

  app.patch("/api/sessions/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = updateSessionSchema.parse(req.body);
      const session = await storage.updateSession(id, updates);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      res.json(session);
    } catch (error) {
      console.error("Error updating session:", error);
      res.status(400).json({ message: "Invalid update data" });
    }
  });

  // Location routes
  app.post("/api/locations", async (req, res) => {
    try {
      const locationData = insertLocationSchema.parse(req.body);
      const location = await storage.addLocation(locationData);
      res.json(location);
    } catch (error) {
      console.error("Error adding location:", error);
      res.status(400).json({ message: "Invalid location data" });
    }
  });

  app.get("/api/sessions/:id/locations", async (req, res) => {
    try {
      const sessionId = parseInt(req.params.id);
      const locations = await storage.getSessionLocations(sessionId);
      res.json(locations);
    } catch (error) {
      console.error("Error fetching session locations:", error);
      res.status(500).json({ message: "Failed to fetch session locations" });
    }
  });

  app.get("/api/sessions/:id/locations/latest", async (req, res) => {
    try {
      const sessionId = parseInt(req.params.id);
      const location = await storage.getLatestLocation(sessionId);
      res.json(location || null);
    } catch (error) {
      console.error("Error fetching latest location:", error);
      res.status(500).json({ message: "Failed to fetch latest location" });
    }
  });

  // Suburb boundaries using Nominatim/OpenStreetMap
  app.get("/api/suburbs/boundaries", async (req, res) => {
    try {
      const { lat, lng } = req.query;
      
      // Use Nominatim to get suburb boundaries around Brisbane
      const response = await axios.get('https://nominatim.openstreetmap.org/search', {
        params: {
          q: 'Brisbane Queensland Australia',
          format: 'geojson',
          polygon_geojson: 1,
          addressdetails: 1,
          limit: 10,
          extratags: 1
        },
        headers: {
          'User-Agent': 'Brisbane-Clearout-Tracker/1.0'
        }
      });

      const suburbs = response.data.features?.map((feature: any) => ({
        name: feature.properties.display_name?.split(',')[0] || 'Brisbane Area',
        coordinates: feature.geometry.type === 'Polygon' 
          ? feature.geometry.coordinates[0].map((coord: number[]) => [coord[1], coord[0]])
          : [],
        properties: feature.properties
      })) || [];

      res.json(suburbs);
    } catch (error) {
      console.error("Error fetching suburb boundaries:", error);
      res.status(500).json({ message: "Failed to fetch suburb boundaries" });
    }
  });

  // Reverse geocoding to get suburb name from coordinates
  app.get("/api/suburbs/lookup", async (req, res) => {
    try {
      const { lat, lng } = req.query;
      
      if (!lat || !lng) {
        return res.status(400).json({ message: "Latitude and longitude are required" });
      }

      // Use Nominatim reverse geocoding
      const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
        params: {
          lat: lat,
          lon: lng,
          format: 'json',
          addressdetails: 1
        },
        headers: {
          'User-Agent': 'Brisbane-Clearout-Tracker/1.0'
        }
      });

      const suburb = response.data.address?.suburb || 
                    response.data.address?.neighbourhood ||
                    response.data.address?.city_district ||
                    response.data.address?.city ||
                    "Unknown";

      res.json({ suburb });
    } catch (error) {
      console.error("Error looking up suburb:", error);
      res.status(500).json({ message: "Failed to lookup suburb" });
    }
  });

  // Public toilets using Overpass API (OpenStreetMap)
  app.get("/api/toilets", async (req, res) => {
    try {
      const { lat, lng, radius = 2 } = req.query;
      const centerLat = lat ? parseFloat(lat as string) : -27.4705;
      const centerLng = lng ? parseFloat(lng as string) : 153.0260;
      const searchRadius = parseFloat(radius as string) * 1000; // Convert km to meters

      // Use Overpass API to find public toilets
      const overpassQuery = `
        [out:json][timeout:25];
        (
          node["amenity"="toilets"](around:${searchRadius},${centerLat},${centerLng});
        );
        out geom;
      `;

      const response = await axios.post('https://overpass-api.de/api/interpreter', overpassQuery, {
        headers: {
          'Content-Type': 'text/plain',
          'User-Agent': 'Brisbane-Clearout-Tracker/1.0'
        }
      });

      const toilets = response.data.elements?.map((element: any) => ({
        id: element.id.toString(),
        name: element.tags?.name || 'Public Toilet',
        lat: element.lat,
        lng: element.lon,
        address: element.tags?.["addr:full"] || element.tags?.["addr:street"],
        openHours: element.tags?.opening_hours || '24/7',
        accessible: element.tags?.wheelchair === 'yes',
        fee: element.tags?.fee === 'yes',
        properties: element.tags
      })) || [];

      res.json(toilets);
    } catch (error) {
      console.error("Error fetching public toilets:", error);
      res.status(500).json({ message: "Failed to fetch public toilets" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
