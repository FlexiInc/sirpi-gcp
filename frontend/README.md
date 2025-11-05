# Sirpi Frontend

Next.js 15 frontend application for the Sirpi cloud deployment platform.

## Structure

```
frontend/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── [userProjects]/    # User project pages
│   │   ├── api/               # API route handlers
│   │   ├── github/            # GitHub OAuth callback
│   │   ├── sign-in/           # Authentication pages
│   │   └── sign-up/
│   ├── components/            # React components
│   ├── hooks/                 # Custom React hooks
│   └── lib/                   # Utilities and API clients
├── public/                    # Static assets
└── package.json              # Dependencies
```

## Key Features

### Pages
- **Home** (`app/page.tsx`) - Landing page with project overview
- **Deploy** (`app/[userProjects]/[projectSlug]/deploy/`) - Deployment interface with real-time logs
- **Settings** (`app/[userProjects]/[projectSlug]/settings/`) - Project configuration
- **Env Vars** (`app/[userProjects]/[projectSlug]/env-vars/`) - Environment variable management

### Components
- `DeploymentLogs.tsx` - Real-time log streaming with SSE
- `GCPSetupFlow.tsx` - GCP OAuth connection flow
- `AWSSetupFlow.tsx` - AWS IAM role setup
- `SirpiAssistant.tsx` - AI chat assistant for troubleshooting
- `ProjectCard.tsx` - Project overview cards
- `EnvVarManager.tsx` - Environment variable UI

### Hooks
- `useDeploymentLogs.ts` - SSE log streaming hook
- `useGCPCredentialStatus.ts` - GCP credential validation
- `useAgentLogs.ts` - AI agent log streaming
- `useDeploymentPolling.ts` - (Legacy) Polling-based logs

### API Clients
- `lib/api-client.ts` - Authenticated API wrapper
- `lib/api/projects.ts` - Project API methods
- `lib/api/deployments.ts` - Deployment API methods
- `lib/api/github.ts` - GitHub integration

## Running the Frontend

### Development
```bash
# Install dependencies
npm install

# Start dev server
npm run dev
```

Visit `http://localhost:3000`

### Production Build
```bash
# Build for production
npm run build

# Start production server
npm start
```

## Environment Variables

Create `.env.local`:

```env
# Backend API
NEXT_PUBLIC_API_URL=http://localhost:8000

# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# Supabase (for direct access if needed)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx...
```

## Styling

- **Tailwind CSS** - Utility-first CSS framework
- **Custom Theme** - Dark theme with blue accents
- **Responsive Design** - Mobile-first approach

Configuration in:
- `tailwind.config.ts` - Tailwind configuration
- `app/globals.css` - Global styles and CSS variables

## Authentication

Authentication is handled by Clerk:
- Sign up/Sign in pages
- Protected routes via middleware
- User profile management
- Session handling

Protected routes are defined in `src/middleware.ts`.

## Real-time Features

### Server-Sent Events (SSE)
The app uses SSE for real-time log streaming during deployments:

```typescript
// Example usage
const { logs, isConnected, isComplete } = useDeploymentLogs(
  projectId,
  enabled
);
```

Events:
- `connected` - Connection established
- `log` - Log message
- `complete` - Operation complete
- `error` - Error occurred
- `timeout` - Stream timeout

## API Integration

All API calls go through the authenticated `apiCall` wrapper:

```typescript
import { apiCall } from '@/lib/api-client';

const response = await apiCall('/projects', {
  method: 'POST',
  body: JSON.stringify(data)
});
```

This automatically:
- Adds authentication headers
- Handles errors
- Parses JSON responses

## TypeScript

The project uses strict TypeScript for type safety:
- Interface definitions for all data models
- Type-safe API responses
- React component prop types

## Development Tips

### Hot Reload
Next.js automatically reloads on file changes.

### Debugging
- Use React DevTools for component inspection
- Check browser console for errors
- Network tab for API calls

### Building
```bash
# Check for build errors
npm run build

# Run linter
npm run lint

# Type check
npx tsc --noEmit
```

## Dependencies

Core:
- `next` - React framework
- `react` & `react-dom` - UI library
- `@clerk/nextjs` - Authentication
- `tailwindcss` - Styling
- `typescript` - Type safety
- `react-hot-toast` - Notifications

See `package.json` for complete list.
