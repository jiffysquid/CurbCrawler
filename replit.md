# Location Tracking Application

## Overview

This is a full-stack location tracking application built with React and Express. The app allows users to start tracking sessions, record their location data in real-time, visualize their routes on a map, and view session history. It's designed as a mobile-friendly progressive web application for tracking movement through different suburbs.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter for client-side routing
- **State Management**: TanStack Query (React Query) for server state management
- **UI Framework**: Shadcn/ui components built on Radix UI primitives
- **Styling**: Tailwind CSS with custom design system
- **Build Tool**: Vite for development and bundling
- **Map Integration**: Leaflet for interactive mapping

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ES modules
- **API Style**: RESTful API endpoints
- **Development**: Hot reload with tsx for TypeScript execution

### Data Storage
- **Database**: PostgreSQL (configured for use with Drizzle ORM)
- **ORM**: Drizzle ORM for type-safe database operations
- **Schema**: Defined in shared TypeScript files for type consistency
- **Migrations**: Drizzle Kit for database schema management

## Key Components

### Database Schema
- **Sessions Table**: Stores tracking session metadata including start/end times, duration, distance, and route data
- **Locations Table**: Stores individual GPS coordinates with timestamps and suburb information
- **Shared Types**: TypeScript interfaces ensure type safety across frontend and backend

### API Endpoints
- `POST /api/sessions` - Create new tracking session
- `GET /api/sessions` - Retrieve all sessions with statistics
- `GET /api/sessions/active` - Get currently active session
- `GET /api/sessions/:id` - Get specific session details
- `PUT /api/sessions/:id` - Update session (e.g., stop tracking)
- `POST /api/locations` - Add location point to session
- `GET /api/sessions/:id/locations` - Get all locations for a session

### Frontend Components
- **Map Component**: Interactive Leaflet map showing current location and route visualization
- **Session Controls**: Start/stop tracking with real-time statistics display
- **Session History**: List view of previous tracking sessions with summaries
- **Settings**: Configuration options for map display and GPS accuracy

### Geolocation Features
- High-accuracy GPS tracking using browser Geolocation API
- Real-time location updates during active sessions
- Suburb detection and boundary visualization
- Route recording with coordinate arrays

## Data Flow

1. **Session Start**: User initiates tracking session via frontend controls
2. **Location Capture**: Browser geolocation API provides coordinates at regular intervals
3. **Data Persistence**: Location points sent to backend API and stored in PostgreSQL
4. **Real-time Updates**: Frontend polls for session updates and displays current statistics
5. **Route Visualization**: Map component renders tracked route from stored coordinates
6. **Session End**: User stops tracking, final session data calculated and stored

## External Dependencies

### Core Framework Dependencies
- React ecosystem (React, React DOM, React Query)
- Express.js with TypeScript support
- Drizzle ORM with PostgreSQL adapter

### UI and Styling
- Radix UI components for accessible primitives
- Tailwind CSS for utility-first styling
- Lucide React for consistent iconography

### Map and Location Services
- Leaflet for interactive mapping
- Browser Geolocation API for GPS coordinates
- OpenStreetMap tiles for map visualization

### Development Tools
- Vite for fast development builds
- TypeScript for type safety
- ESBuild for production bundling
- Replit-specific development plugins

## Deployment Strategy

The application is configured for deployment on Replit's autoscale platform:

- **Development**: `npm run dev` starts both frontend and backend in development mode
- **Production Build**: `npm run build` creates optimized frontend bundle and compiles backend
- **Production Start**: `npm run start` serves the built application
- **Database**: PostgreSQL module configured in Replit environment
- **Port Configuration**: Backend serves on port 5000, mapped to external port 80

## Changelog

- June 14, 2025: Initial setup
- June 14, 2025: Added public toilet locations using OpenStreetMap Overpass API
- June 14, 2025: Implemented different colored paths for each tracking session
- June 14, 2025: Fixed map display issues and UI layering with proper z-index handling
- June 14, 2025: Enhanced session controls with real-time statistics display
- June 23, 2025: Implemented Brisbane Council clearout schedule system with financial year transition detection
- June 23, 2025: Added vehicle-focused map navigation with configurable vehicle types
- June 23, 2025: Replaced geographic focus areas with vehicle-centered positioning using IMAX van asset
- June 23, 2025: Moved show/hide toggles for suburbs and toilets from map controls to settings panel
- June 23, 2025: Implemented automatic map rotation based on driving direction with fixed vehicle marker orientation
- June 23, 2025: Added separate Start Recording and End Recording buttons to session controls
- June 23, 2025: Enhanced vehicle marker scaling with zoom level and rotation compensation
- June 23, 2025: Removed manual rotation controls in favor of automatic rotation during tracking sessions
- June 24, 2025: Integrated real Brisbane Council API v2.1 for authentic clearout data
- June 24, 2025: Implemented dynamic suburb boundary fetching based on actual clearout schedules
- June 24, 2025: Successfully parsing live Brisbane Council "Kerbside large item collection schedule" dataset
- June 24, 2025: Displaying authentic July 21st clearout suburbs: TARINGA, AUCHENFLOWER, ST LUCIA, MILTON
- June 24, 2025: Fixed toilet proximity filtering to use GPS location within 5km radius
- June 24, 2025: Added authentic Brisbane suburb boundary coordinates for all 13 clearout areas

## User Preferences

Preferred communication style: Simple, everyday language.