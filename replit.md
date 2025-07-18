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
- July 4, 2025: Fixed KML simulation connection using global window callbacks - vehicle marker now follows route correctly
- July 4, 2025: Fixed map rotation system - removed recording requirement, rotation now works during KML simulation
- July 4, 2025: Enhanced tile loading with keepBuffer=8 and padding=2.0 to prevent missing tiles during map rotation
- July 4, 2025: Temporarily disabled map rotation due to tile loading issues and scroll bar problems - focusing on core functionality first
- July 6, 2025: Restored settings menu functionality with proper tab navigation for both desktop and mobile
- July 6, 2025: Added real-time recording metrics - timer shows elapsed time (seconds and minutes) and distance counter displays traveled distance in meters/kilometers
- July 6, 2025: Enhanced SimpleControls component with live recording stats display including animated recording indicator and distance tracking
- July 6, 2025: Implemented automatic wake lock management during recording sessions to keep phone screen active for van field work
- July 6, 2025: Updated clearout schedule system to use real current dates instead of hardcoded July 21st test date
- July 6, 2025: Fixed clearout schedule API to use authentic Brisbane Council data with current real dates showing ALGESTER, CALAMVALE, PARKINSON for current period and TARINGA, AUCHENFLOWER, ST LUCIA, MILTON for next period
- July 6, 2025: Fixed mobile menu button positioning with higher z-index and better visibility for settings access
- July 6, 2025: Added Cloudflare R2 backup system for missing suburb boundaries - detects CALAMVALE, PARKINSON and other missing areas from Brisbane Council data
- July 6, 2025: Implemented comprehensive KML backup system with multiple filename patterns (underscores, dashes, folders) and KML-to-coordinate parsing for suburb boundaries
- July 6, 2025: Updated R2 backup system with correct public URL https://pub-ed1d9de860694e218d1e938020acddf9.r2.dev for accessing user's KML files
- July 6, 2025: Fixed clearout schedule to display only current week (7 days) and next week (7 days) instead of 2-week periods
- July 6, 2025: Enhanced demographics endpoint with comprehensive data for all Brisbane clearout suburbs including ALGESTER, CALAMVALE, PARKINSON and all next week suburbs
- July 6, 2025: R2 backup system successfully loading missing suburb boundaries - CALAMVALE (147 coordinates) and PARKINSON (138 coordinates) from user's KML files
- July 6, 2025: Implemented suburb star rating system using Python algorithm that normalizes price/density data and calculates 1-5 star ratings based on distance from optimal center point
- July 6, 2025: Added visual star rating display in demographics overlay showing ALGESTER (2 stars), CALAMVALE (1 star), PARKINSON (2 stars) based on price/density analysis
- July 6, 2025: Fixed public toilet display issue - toilets now properly show on map after fixing settings initialization and effect dependency timing
- July 6, 2025: Fixed toilet proximity sorting - toilets now display in order of closest distance, showing Roma Street Parkland (2.67km) as nearest, with distance information in popups
- July 9, 2025: Fixed mobile settings menu scrolling with proper height constraints and flex layout
- July 9, 2025: Implemented real-time distance tracking using GPS updates for immediate recording stats instead of slow session location queries
- July 9, 2025: Added screen wake lock functionality to keep phone active during recording sessions for van field work
- July 9, 2025: Enhanced error handling with proper cleanup of recording state and wake lock on errors
- July 9, 2025: Changed default toilet visibility to hidden for cleaner initial map display - users can enable in settings if needed
- July 11, 2025: Fixed random recording crashes by implementing comprehensive GPS monitoring and auto-restart system
- July 11, 2025: Added robust error handling to prevent location recording interruptions during van-based field testing
- July 11, 2025: Implemented GPS health monitoring with automatic restart when GPS tracking stops during recording sessions
- July 11, 2025: Enhanced location mutation error handling to continue recording even when individual location saves fail
- July 11, 2025: Added visual GPS status indicator in recording controls to show GPS health during active sessions
- July 15, 2025: Implemented complete persistent path tracking system with 8-color cycling scheme
- July 15, 2025: Added path storage utilities for saving/loading persistent paths from localStorage
- July 15, 2025: Updated map component to display all saved paths with proper color management
- July 15, 2025: Integrated persistent path saving into recording start/stop functions
- July 15, 2025: Added path color scheme setting in settings (bright colors vs age-based fading)
- July 15, 2025: Added path management section to settings for clearing all recorded paths
- July 15, 2025: All recorded paths now automatically saved until manually deleted and visible by default
- July 17, 2025: Fixed map scrolling/zooming - map now only centers on vehicle during recording sessions, allowing free navigation when not recording
- July 17, 2025: Added saved paths display in settings menu showing all recorded paths with names, dates, distances, and color indicators
- July 18, 2025: Successfully implemented exclusive custom Mapbox style (mapbox://styles/jifysquid/cmd422kxy01t601rf67tl9ra2)
- July 18, 2025: Removed all map provider selection options - application now uses only the custom Mapbox style
- July 18, 2025: Replaced map provider dropdown with fixed display showing current custom style in use
- July 18, 2025: Implemented comprehensive field testing improvements based on user feedback
- July 18, 2025: Removed GPS status indicator from recording controls for cleaner interface
- July 18, 2025: Changed zoom out behavior to focus on clearout areas (zoom 13) instead of suburb-wide view
- July 18, 2025: Enhanced path line styling - doubled thickness to 8px weight and reduced opacity to 75%
- July 18, 2025: Fixed screen wake lock to automatically reactivate when returning to app window
- July 18, 2025: Implemented smooth scrolling during recording with 1.0 second duration and easing
- July 18, 2025: Removed map labels and debug info from settings menu for simplified interface
- July 18, 2025: Fixed vehicle type dropdown with proper z-index positioning
- July 18, 2025: Moved path management from settings to sessions tab for logical organization
- July 18, 2025: Fixed saved path distance calculation - now shows correct kilometers traveled instead of 0km
- July 18, 2025: Created dedicated PathManagement component for sessions tab integration
- July 18, 2025: Attempted map rotation system but disabled due to technical issues - van rotated with map, blank tiles appeared, and text became unreadable
- July 18, 2025: Implemented proper map rotation solution using native Leaflet bearing rotation with counter-rotating UI elements
- July 18, 2025: Fixed rotation issues - van now stays pointing up, no blank tiles, and all text remains readable during map rotation
- July 18, 2025: Map rotation now uses proper techniques: native map bearing rotation for tiles, counter-rotation for markers and UI elements

## User Preferences

Preferred communication style: Simple, everyday language.
UI Preference: Clean, minimal interface - prefers simple start/stop button over large control panels for mobile van use.
Mobile Requirements: Needs phone screen to stay on during recording sessions for van field work.