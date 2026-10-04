# Technology Stack

## Frontend

- React 18
- TypeScript
- Vite
- Tailwind CSS
- TanStack Query

The frontend is responsible for the user interface, incident management screens, dashboards, forms, validation feedback, and API communication.

## Backend

- Node.js
- Express 4
- TypeScript

The backend provides REST APIs for authentication, users, incidents, comments, assignments, and other helpdesk operations.

## Database

- PostgreSQL 15
- Prisma ORM

Prisma is used for database schema management, migrations, and type-safe database access.

## Authentication and Authorization

- JWT-based authentication
- bcrypt for password hashing
- Role-based access control

Supported roles include:

- Employee
- Support Agent
- Administrator

Authorization must be enforced on protected API routes.

## Validation and Security

- Zod for request validation
- Express rate limiting
- Request body size limits
- Input sanitization
- Field-level validation errors
- Secure password handling
- JWT authentication middleware

All externally supplied input must be validated before business logic is executed.

## AI Integration

The application contains an isolated AI service module for incident analysis.

The AI service can provide:

- Incident category suggestion
- Incident priority suggestion
- Incident summary

AI failures must not prevent normal incident creation.

The AI integration must have:

- Request timeout handling
- Error handling
- Invalid response handling
- Graceful fallback when configuration is unavailable

## Testing

The project uses:

- Jest
- Supertest
- fast-check
- Vitest / Testing Library where appropriate

Tests should cover:

- Business logic
- Validation
- Authentication
- Authorization
- API behavior
- Security middleware
- Important correctness properties

## Logging and Error Handling

The backend uses structured logging and centralized error handling.

API errors should provide clear, safe responses without exposing sensitive implementation details.

## Development Principles

- Use TypeScript for type safety.
- Keep modules separated by responsibility.
- Prefer reusable services and middleware.
- Validate data at API boundaries.
- Keep AI functionality isolated from core business logic.
- Write tests for important functionality.
- Avoid unnecessary dependencies.
- Preserve existing functionality when introducing changes.