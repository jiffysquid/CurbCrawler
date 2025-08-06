# Location Tracking Application

## Overview
This is a full-stack location tracking application built with React and Express, designed as a mobile-friendly progressive web application. It allows users to track their location in real-time, visualize routes on a map, and view session history. The application focuses on tracking movement through different suburbs, integrating features like clearout schedule displays and demographic overlays for specific Brisbane suburbs. The business vision is to provide a comprehensive tool for field operations, particularly for users in vehicles needing real-time geographic and logistical information.

## User Preferences
Preferred communication style: Simple, everyday language.
UI Preference: Clean, minimal interface - prefers simple start/stop button over large control panels for mobile van use.
Mobile Requirements: Needs phone screen to stay on during recording sessions for van field work.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter
- **State Management**: TanStack Query (React Query)
- **UI Framework**: Shadcn/ui (Radix UI primitives)
- **Styling**: Tailwind CSS
- **Build Tool**: Vite
- **Map Integration**: Mapbox GL JS for interactive mapping with native rotation support

### Backend
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript (ES modules)
- **API Style**: RESTful API
- **Development**: Hot reload with `tsx`

### Data Storage
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM
- **Schema**: Defined in shared TypeScript files
- **Migrations**: Drizzle Kit

### Key Features
- **Geolocation**: High-accuracy GPS tracking, real-time location updates, speed-based GPS refresh rate ("Smart Rate"), route recording, automatic map rotation based on driving direction.
- **Session Management**: Start/stop tracking, real-time statistics (time, distance), persistent path storage with an 8-color cycling scheme, session history, and totals for distance/time.
- **Mapping**: Custom Mapbox style (mapbox://styles/jifysquid/cmd422kxy01t601rf67tl9ra2), interactive map displaying current location, vehicle marker, and recorded routes. Map centers on the vehicle during recording with a 20-degree tilt for a 3D perspective.
- **Suburb Information**: Integration with Brisbane Council API for clearout schedules, display of authentic Brisbane suburb boundaries, demographics overlay (population density, median house prices, star ratings) for clearout suburbs, and public toilet locations with proximity sorting.
- **UI/UX**: Clean, minimal interface with a focus on mobile use; simplified start/stop controls; persistent screen wake lock during recording sessions; dedicated settings and sessions tabs; and visual indicators for recording status.

## External Dependencies
- React ecosystem (React, React DOM, React Query)
- Express.js
- Drizzle ORM (PostgreSQL adapter)
- Radix UI
- Tailwind CSS
- Lucide React (iconography)
- Mapbox GL JS
- Browser Geolocation API
- OpenStreetMap (for toilet locations and general map data)
- Brisbane Council API (for clearout schedules and suburb geo_shape data)
- Cloudflare R2 (for KML suburb boundary backups)

## Recent Changes
- July 31, 2025: Enhanced map rotation system - rotation now only occurs during recording sessions with improved bearing calculation and normalized angles
- July 31, 2025: Added 20-degree map tilt for 3D perspective view, providing better spatial awareness during navigation  
- August 1, 2025: Increased map tilt to 40 degrees for enhanced 3D perspective and improved rotation responsiveness - reduced movement threshold to 5m and time threshold to 1.5s with 8° bearing sensitivity
- August 3, 2025: Fixed map rotation logic - vehicle now always points "up" on screen with proper bearing calculation so the road appears aligned with travel direction
- August 3, 2025: Fixed current location window to update continuously during recording sessions with 2-second suburb lookup intervals
- August 3, 2025: Adjusted van zoom level from 18 to 16.5 to show 50% more surrounding area for better context
- August 3, 2025: Changed path arrows from triangles (▲) to arrows with tails (↑) for clearer direction recognition
- August 6, 2025: REMOVED ALL ROTATION AND VAN ANIMATION - Simplified vehicle system to static marker that updates position only, no map rotation or vehicle animation due to persistent technical issues