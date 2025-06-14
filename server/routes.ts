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

      if (!ODS_API_KEY) {
        return res.status(500).json({ 
          message: "ODS API key not configured. Please set ODS_API_KEY environment variable." 
        });
      }

      // Use point-in-polygon query to find which suburb contains the coordinates
      const response = await axios.get(BRISBANE_SUBURBS_API_URL, {
        params: {
          service: "WFS",
          version: "1.0.0",
          request: "GetFeature",
          typeName: "brisbane-city-council:suburb_boundaries",
          outputFormat: "application/json",
          key: ODS_API_KEY,
          cql_filter: `INTERSECTS(the_geom, POINT(${lng} ${lat}))`
        }
      });

      const suburb = response.data.features?.[0]?.properties?.suburb_name || 
                    response.data.features?.[0]?.properties?.name || 
                    "Unknown";

      res.json({ suburb });
    } catch (error) {
      console.error("Error looking up suburb:", error);
      if (axios.isAxiosError(error)) {
        res.status(error.response?.status || 500).json({ 
          message: `ODS API Error: ${error.response?.data?.message || error.message}` 
        });
      } else {
        res.status(500).json({ message: "Failed to lookup suburb" });
      }
    }
  });

  // Public toilets in Brisbane area
  app.get("/api/toilets", async (req, res) => {
    try {
      const { lat, lng, radius = 2 } = req.query;
      
      if (!ODS_API_KEY) {
        return res.status(500).json({ 
          message: "ODS API key not configured. Please set ODS_API_KEY environment variable." 
        });
      }

      // Brisbane City Council public toilets dataset
      const response = await axios.get(BRISBANE_SUBURBS_API_URL, {
        params: {
          service: "WFS",
          version: "1.0.0",
          request: "GetFeature",
          typeName: "brisbane-city-council:public_toilets",
          outputFormat: "application/json",
          key: ODS_API_KEY,
          ...(lat && lng && {
            bbox: `${parseFloat(lng as string) - parseFloat(radius as string)/100},${parseFloat(lat as string) - parseFloat(radius as string)/100},${parseFloat(lng as string) + parseFloat(radius as string)/100},${parseFloat(lat as string) + parseFloat(radius as string)/100}`
          })
        }
      });

      const toilets = response.data.features?.map((feature: any) => ({
        id: feature.id,
        name: feature.properties.name || feature.properties.facility_name || 'Public Toilet',
        lat: feature.geometry.coordinates[1],
        lng: feature.geometry.coordinates[0],
        address: feature.properties.address || feature.properties.location,
        openHours: feature.properties.opening_hours || feature.properties.hours,
        accessible: feature.properties.accessible || feature.properties.disability_access,
        properties: feature.properties
      })) || [];

      res.json(toilets);
    } catch (error) {
      console.error("Error fetching public toilets:", error);
      if (axios.isAxiosError(error)) {
        res.status(error.response?.status || 500).json({ 
          message: `ODS API Error: ${error.response?.data?.message || error.message}` 
        });
      } else {
        res.status(500).json({ message: "Failed to fetch public toilets" });
      }
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
