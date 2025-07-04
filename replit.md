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
- June 24, 2025: Replaced placeholder boundaries with accurate Australian Bureau of Statistics coordinates for all 13 Brisbane clearout suburbs
- June 24, 2025: Added demographics overlay displaying population density and median house prices for active clearout suburbs using ABS Census 2021 data
- June 24, 2025: Fixed suburb boundary coordinate accuracy issues - replaced inaccurate boundary data with properly positioned Brisbane suburb boundaries
- June 24, 2025: Successfully implemented authentic Brisbane City Council suburb boundaries using geo_shape data from clearout schedule API
- June 24, 2025: Fixed geo_shape parsing to handle Brisbane Council's nested Feature/geometry structure correctly
- June 24, 2025: Suburb boundaries now display 100 authentic Brisbane suburbs with proper coordinate conversion and clearout schedule color coding
- June 24, 2025: Filtered suburb display to show only current and next week clearout areas, removed redundant info button
- June 24, 2025: Configured geolocation for production deployment - uses real GPS on deployed app, test coordinates in development
- June 25, 2025: Implemented continuous GPS tracking with watchPosition API for real-time location updates
- June 25, 2025: Simplified UI to clean start/stop button interface for mobile van use
- June 25, 2025: Fixed session creation validation - recordings now store in memory (temporary until server restart)
- June 25, 2025: Diagnosed GPS polling issue - Replit environment returns cached coordinates instead of real device GPS
- June 25, 2025: Added GPS Debug panel with manual testing and enhanced mobile GPS settings for field testing
- June 25, 2025: Fixed map zoom preservation during GPS updates, improved rotation around vehicle marker, added live route tracking display
- June 25, 2025: Added Screen Wake Lock API to keep phone screen on during recording sessions
- June 26, 2025: Doubled vehicle marker size from 30px to 60px base size for better visibility during field work
- June 26, 2025: Fixed stop button to immediately switch back to "Start Recording" when pressed and properly stop recording
- June 26, 2025: Moved GPS debug panel down to avoid clashing with mobile menu button
- June 26, 2025: Fixed map centering to always follow vehicle marker, not just during tracking sessions
- June 29, 2025: Reduced vehicle marker size by 50% from 60px to 30px base size for better map visibility
- June 29, 2025: Fixed map rotation logic - vehicle marker now always points forward while map rotates around it based on direction of travel
- July 3, 2025: Diagnosed map rotation issue - added comprehensive debugging and movement-based rotation logic
- July 3, 2025: Fixed marker flashing by only updating when position changes significantly (>1m)
- July 3, 2025: Enhanced path recording with movement detection and proper GPS coordinate filtering
- July 3, 2025: Added detailed console logging for debugging rotation and recording functionality
- July 4, 2025: Successfully implemented KML route visualization system displaying authentic 2253-point Brisbane GPS route
- July 4, 2025: Connected actual user KML data to map display - shows real Brisbane streets through Paddington, Milton, Auchenflower
- July 4, 2025: Identified KML simulation event system issue - events dispatched but Home component not receiving location updates

## User Preferences

Preferred communication style: Simple, everyday language.
UI Preference: Clean, minimal interface - prefers simple start/stop button over large control panels for mobile van use.
Mobile Requirements: Needs phone screen to stay on during recording sessions for van field work.