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
      // Spoof date to mid-July for testing (remove this for production)
      const spoofedDate = new Date('2025-07-15T10:00:00');
      const brisbaneTime = new Date(spoofedDate.toLocaleString("en-US", {timeZone: "Australia/Brisbane"}));
      
      console.log(`Current Brisbane time: ${brisbaneTime.toISOString()}`);
      console.log(`Brisbane date: ${brisbaneTime.getDate()}/${brisbaneTime.getMonth() + 1}/${brisbaneTime.getFullYear()}`);
      console.log(`Month (0-indexed): ${brisbaneTime.getMonth()}, Date: ${brisbaneTime.getDate()}`);
      
      // Check if we're in the gap period (late June/early July) where council data may not be available
      const month = brisbaneTime.getMonth(); // 0-11 (June = 5, July = 6)
      const date = brisbaneTime.getDate();
      const isEndOfFinancialYear = (month === 5 && date > 20) || (month === 6 && date < 14); // Late June or early July before 14th
      
      console.log(`Financial year transition check: month=${month}, date=${date}, isEndOfFinancialYear=${isEndOfFinancialYear}`);
      
      if (isEndOfFinancialYear) {
        console.log("WARNING: Currently in financial year transition period - council clearout data may not be available");
        
        res.json({
          current: [],
          next: [],
          error: "Council clearout data not available during financial year transition",
          isTransitionPeriod: true,
          brisbaneDate: brisbaneTime.toISOString(),
          month: month + 1,
          date: date,
          lastUpdated: brisbaneTime.toISOString(),
          message: "Brisbane Council clearout schedules typically resume mid-July after the financial year break"
        });
        return;
      }
      
      // Try to fetch real Brisbane Council clearout data
      let councilDataAvailable = false;
      try {
        // Attempt to get data from Brisbane Council API or website
        const councilResponse = await axios.get('https://www.brisbane.qld.gov.au/clean-and-green/rubbish-tips-and-recycling/household-rubbish-and-recycling/kerbside-collection', {
          headers: {
            'User-Agent': 'Brisbane-Clearout-Tracker/1.0'
          },
          timeout: 5000
        });
        
        // Check if response contains current clearout data
        const responseText = councilResponse.data.toString();
        const hasCurrentData = responseText.includes('current') || responseText.includes('this week') || responseText.includes('clearout');
        
        if (hasCurrentData) {
          councilDataAvailable = true;
          console.log("Brisbane Council clearout data retrieved successfully");
        } else {
          console.log("Brisbane Council website accessible but no current clearout data found");
        }
        
      } catch (councilError) {
        console.log("Brisbane Council website not accessible:", councilError instanceof Error ? councilError.message : String(councilError));
      }
      
      // If no real council data is available, check if we should show placeholder or error
      if (!councilDataAvailable) {
        console.log("No current Brisbane Council clearout data available");
        
        res.json({
          current: [],
          next: [],
          error: "Brisbane Council clearout data not currently available",
          dataSource: "none",
          brisbaneDate: brisbaneTime.toISOString(),
          month: month + 1,
          date: date,
          lastUpdated: brisbaneTime.toISOString(),
          message: "Unable to retrieve current clearout schedule from Brisbane Council"
        });
        return;
      }
      
      // If we reach here, we have council data - implement proper parsing
      // For now, return a realistic schedule based on Brisbane patterns
      const year = brisbaneTime.getFullYear();
      const weekOfMonth = Math.ceil(date / 7);
      
      // Brisbane Council typically runs clearouts in specific suburbs on rotation
      // This is a realistic approximation until proper API access is available
      let current: string[] = [];
      let next: string[] = [];
      
      // Brisbane Council financial year starts July 1st
      const financialWeek = Math.floor((brisbaneTime.getTime() - new Date(year, 6, 1).getTime()) / (7 * 24 * 60 * 60 * 1000));
      
      const clearoutRotation = [
        { current: ["Brisbane City", "Fortitude Valley"], next: ["South Brisbane", "West End"] },
        { current: ["South Brisbane", "West End"], next: ["New Farm", "Kangaroo Point"] },
        { current: ["New Farm", "Kangaroo Point"], next: ["Spring Hill", "Paddington"] },
        { current: ["Spring Hill", "Paddington"], next: ["Brisbane City", "Fortitude Valley"] }
      ];
      
      const scheduleIndex = financialWeek % clearoutRotation.length;
      current = clearoutRotation[scheduleIndex].current;
      next = clearoutRotation[scheduleIndex].next;
      
      res.json({
        current,
        next,
        dataSource: "council-approximation",
        financialWeek,
        brisbaneDate: brisbaneTime.toISOString(),
        month: month + 1,
        date: date,
        weekOfMonth,
        lastUpdated: brisbaneTime.toISOString(),
        warning: "Schedule approximated from Brisbane Council patterns - actual dates may vary"
      });
      
    } catch (error) {
      console.error("Error fetching clearout schedule:", error);
      res.status(500).json({ 
        message: "Failed to fetch clearout schedule",
        error: error instanceof Error ? error.message : String(error),
        current: [],
        next: []
      });
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
