# Calendar App Frontend

A production-ready React frontend with TypeScript that integrates with the Express.js backend for Google Calendar management.

## Features

- **Authentication**: Google OAuth integration with automatic token refresh
- **Calendar Management**: View, create, and sync Google Calendar events
- **Date Range Selection**: Toggle between 1, 7, and 30-day views
- **Real-time Updates**: Optimistic updates and automatic syncing
- **Responsive Design**: Clean, modern UI built with Tailwind CSS
- **TypeScript**: Full type safety throughout the application

## Project Structure

```
src/
├── components/
│   ├── auth/           # Authentication components
│   ├── calendar/       # Calendar-related components
│   ├── layout/         # Layout components
│   └── common/         # Reusable components
├── services/           # API services
├── hooks/              # Custom React hooks
├── types/              # TypeScript type definitions
└── utils/              # Utility functions
```

## Setup and Installation

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Environment Configuration**:
   Create a `.env` file with:
   ```
   REACT_APP_API_URL=http://localhost:5001
   ```

3. **Start the development server**:
   ```bash
   npm start
   ```

4. **Build for production**:
   ```bash
   npm run build
   ```

## Available Scripts

- `npm start` - Runs the app in development mode (http://localhost:3000)
- `npm test` - Launches the test runner
- `npm run build` - Builds the app for production
- `npm run eject` - Ejects from Create React App (irreversible)

## Key Components

### Authentication
- **LoginPage**: Google OAuth login interface
- **AuthCallback**: Handles OAuth redirect and token exchange
- **ProtectedRoute**: Guards authenticated routes

### Calendar Features
- **Dashboard**: Main calendar interface
- **EventList**: Displays events grouped by day/week
- **EventCard**: Individual event display component
- **AddEventForm**: Form for creating new events
- **DateRangeSelector**: Toggle between date ranges

### API Integration
- **authService**: Authentication and user management
- **eventService**: Calendar event operations
- **apiClient**: Axios instance with auth interceptors

## Technologies Used

- **React 18** with TypeScript
- **React Router** for navigation
- **TanStack Query** for state management
- **Axios** for HTTP requests
- **Tailwind CSS** for styling
- **Create React App** for build tooling

## Integration with Backend

The frontend integrates with the Express.js backend through:

1. **Authentication Flow**:
   - Redirects to `/auth/google` for login
   - Handles callback at `/auth/callback`
   - Automatic token refresh

2. **Calendar Operations**:
   - Fetch events: `GET /calendar/events`
   - Create events: `POST /calendar/events`
   - Sync with Google: `POST /calendar/sync`

3. **Error Handling**:
   - Automatic retry on network failures
   - User-friendly error messages
   - Graceful degradation

## Development Notes

- Default view shows next 7 days from current date
- Events are sorted by start time within each group
- Automatic token refresh prevents authentication issues
- Optimistic updates provide immediate feedback
- Responsive design works on all screen sizes

## Deployment

The build output can be deployed to any static hosting service:

```bash
npm run build
# Deploy the 'build' folder contents
```

For backend integration, ensure CORS is configured and the API URL is accessible from your deployment environment.
