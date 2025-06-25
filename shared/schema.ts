import { pgTable, text, serial, integer, boolean, timestamp, doublePrecision, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time"),
  duration: integer("duration"), // in minutes
  distance: doublePrecision("distance"), // in kilometers
  isActive: boolean("is_active").default(true),
  suburbsVisited: text("suburbs_visited").array(),
  routeCoordinates: jsonb("route_coordinates"), // Array of [lat, lng] coordinates
  startLocation: jsonb("start_location"), // {lat, lng, suburb}
  endLocation: jsonb("end_location"), // {lat, lng, suburb}
});

export const locations = pgTable("locations", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => sessions.id),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  timestamp: timestamp("timestamp").notNull(),
  suburb: text("suburb"),
  accuracy: doublePrecision("accuracy"), // GPS accuracy in meters
});

export const insertSessionSchema = createInsertSchema(sessions).omit({
  id: true,
}).extend({
  startTime: z.string().transform((str) => new Date(str)),
  endTime: z.string().transform((str) => new Date(str)).optional(),
});

export const insertLocationSchema = createInsertSchema(locations).omit({
  id: true,
}).extend({
  sessionId: z.number(),
});

export const updateSessionSchema = createInsertSchema(sessions).partial().omit({
  id: true,
});

export type InsertSession = z.infer<typeof insertSessionSchema>;
export type InsertLocation = z.infer<typeof insertLocationSchema>;
export type UpdateSession = z.infer<typeof updateSessionSchema>;
export type Session = typeof sessions.$inferSelect;
export type Location = typeof locations.$inferSelect;

// API response types
export type SessionWithStats = Session & {
  locationCount: number;
  averageAccuracy: number;
};

export type LocationPoint = {
  lat: number;
  lng: number;
  timestamp: string;
  suburb?: string;
  accuracy?: number;
};

export type SuburbBoundary = {
  name: string;
  coordinates: [number, number][];
  properties?: Record<string, any>;
};

export type PublicToilet = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address?: string;
  openHours?: string;
  accessible?: boolean;
  fee?: boolean;
  properties?: Record<string, any>;
};
