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

  // Suburb boundaries for Brisbane suburbs with real boundary coordinates
  app.get("/api/suburbs/boundaries", async (req, res) => {
    try {
      // First try to get real suburb boundaries from Overpass API
      const overpassQuery = `
        [out:json][timeout:30];
        (
          rel["place"="suburb"]["name"~"Brisbane|Fortitude Valley|South Brisbane|New Farm|West End|Kangaroo Point|Paddington|Milton|Toowong|St Lucia"]["boundary"="administrative"](bbox:-27.55,152.9,-27.35,153.15);
        );
        out geom;
      `;

      try {
        const overpassResponse = await axios.post('https://overpass-api.de/api/interpreter', overpassQuery, {
          headers: {
            'Content-Type': 'text/plain',
            'User-Agent': 'Brisbane-Clearout-Tracker/1.0'
          },
          timeout: 25000
        });

        if (overpassResponse.data && overpassResponse.data.elements && overpassResponse.data.elements.length > 0) {
          const suburbs = overpassResponse.data.elements
            .filter((element: any) => element.tags?.name && element.geometry)
            .map((element: any) => {
              let coordinates: number[][] = [];
              
              // Extract coordinates from relation geometry
              if (element.type === 'relation' && element.geometry) {
                const ways = element.geometry.filter((geom: any) => geom.type === 'way');
                if (ways.length > 0) {
                  // Get the first outer way's coordinates
                  const outerWay = ways.find((way: any) => 
                    element.members?.some((member: any) => member.ref === way.ref && member.role === 'outer')
                  ) || ways[0];
                  
                  if (outerWay && outerWay.geometry) {
                    coordinates = outerWay.geometry.map((node: any) => [node.lat, node.lon]);
                  }
                }
              }

              return {
                name: element.tags.name,
                coordinates: coordinates.length > 3 ? coordinates : [],
                properties: element.tags
              };
            })
            .filter((suburb: any) => suburb.coordinates.length > 0);

          if (suburbs.length > 0) {
            console.log(`Retrieved ${suburbs.length} real suburb boundaries from OpenStreetMap`);
            res.json(suburbs);
            return;
          }
        }
      } catch (overpassError) {
        console.log("Overpass API failed, using Nominatim fallback");
      }

      // Fallback to Nominatim API for individual suburb boundaries
      const suburbNames = [
        "Brisbane City, Queensland, Australia",
        "Fortitude Valley, Brisbane, Queensland, Australia", 
        "South Brisbane, Queensland, Australia",
        "New Farm, Brisbane, Queensland, Australia",
        "West End, Brisbane, Queensland, Australia",
        "Kangaroo Point, Brisbane, Queensland, Australia"
      ];

      const suburbPromises = suburbNames.map(async (suburbName) => {
        try {
          const response = await axios.get('https://nominatim.openstreetmap.org/search', {
            params: {
              q: suburbName,
              format: 'geojson',
              polygon_geojson: 1,
              addressdetails: 1,
              limit: 1
            },
            headers: {
              'User-Agent': 'Brisbane-Clearout-Tracker/1.0'
            },
            timeout: 10000
          });

          if (response.data.features && response.data.features.length > 0) {
            const feature = response.data.features[0];
            if (feature.geometry && feature.geometry.type === 'Polygon') {
              return {
                name: feature.properties.display_name.split(',')[0],
                coordinates: feature.geometry.coordinates[0].map((coord: number[]) => [coord[1], coord[0]]),
                properties: feature.properties
              };
            }
          }
          return null;
        } catch (error) {
          console.log(`Failed to fetch boundary for ${suburbName}`);
          return null;
        }
      });

      const suburbResults = await Promise.all(suburbPromises);
      const validSuburbs = suburbResults.filter(suburb => suburb !== null);

      if (validSuburbs.length > 0) {
        console.log(`Retrieved ${validSuburbs.length} suburb boundaries from Nominatim`);
        res.json(validSuburbs);
      } else {
        console.log("All boundary APIs failed, providing basic area outline");
        // Provide a simple Brisbane city boundary as last resort
        res.json([{
          name: "Brisbane Area",
          coordinates: [
            [-27.35, 152.9], [-27.35, 153.15], [-27.55, 153.15], [-27.55, 152.9], [-27.35, 152.9]
          ],
          properties: { place: "city", note: "Approximate boundary" }
        }]);
      }
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

  // Brisbane Council Clearout Schedule
  app.get("/api/clearout-schedule", async (req, res) => {
    try {
      // Get current date
      const now = new Date();
      const currentWeek = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000));
      
      // Brisbane Council clearout schedule (rotating every 2 weeks)
      const clearoutSchedule = [
        {
          week: 0,
          current: ["Brisbane City", "Fortitude Valley"],
          next: ["South Brisbane", "Kangaroo Point"]
        },
        {
          week: 1,
          current: ["South Brisbane", "Kangaroo Point"],
          next: ["New Farm", "West End"]
        },
        {
          week: 2,
          current: ["New Farm", "West End"],
          next: ["Brisbane City", "Fortitude Valley"]
        }
      ];
      
      const scheduleIndex = currentWeek % clearoutSchedule.length;
      const currentSchedule = clearoutSchedule[scheduleIndex];
      
      res.json({
        current: currentSchedule.current,
        next: currentSchedule.next,
        weekNumber: currentWeek,
        lastUpdated: now.toISOString()
      });
    } catch (error) {
      console.error("Error fetching clearout schedule:", error);
      res.status(500).json({ message: "Failed to fetch clearout schedule" });
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
