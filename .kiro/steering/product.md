# Smart IT Helpdesk

## Product Overview

Smart IT Helpdesk is a full-stack incident management system designed for small and medium-sized organizations.

The system helps employees report IT issues and enables support agents and administrators to efficiently manage, track, assign, prioritize, and resolve those incidents.

## Target Users

### Employees
- Create IT support incidents
- Provide incident title and description
- Select category and priority
- Add attachment information
- View submitted incidents
- Search and filter their incidents
- Add comments to incidents

### Support Agents
- View and manage assigned incidents
- Update incident status and priority
- Assign incidents
- Add internal notes
- Add resolution details
- Search, filter, and sort incidents
- View incident information and history

### Administrators
- Manage users and roles
- Access all incidents
- Assign incidents to support agents
- Monitor incident activity
- View dashboard statistics
- Review audit information

## Core Features

1. Incident creation and validation
2. Incident assignment and status management
3. Priority and category management
4. Comments and internal notes
5. Search, filtering, and sorting
6. Dashboard and incident statistics
7. Role-based access control
8. Authentication using JWT
9. Audit logging
10. AI-assisted incident analysis

## AI Assistance

The system can analyze an incident description and suggest:

- Incident category
- Incident priority
- Short incident summary

AI assistance must not block incident creation. If the AI service is unavailable or times out, the incident should still be created successfully.

## Product Goals

- Make IT issue reporting simple for employees
- Help support teams manage incidents efficiently
- Provide clear incident visibility and tracking
- Maintain secure role-based access
- Provide reliable validation and error handling
- Reduce manual effort using AI-assisted analysis

## Non-Goals

The initial version does not aim to provide:

- Enterprise-scale IT asset management
- Real-time chat
- Advanced enterprise workflow automation
- Complex SLA management
- Native mobile applications

## Technology Direction

The application uses:

- React for the frontend
- Node.js and Express for the backend
- PostgreSQL with Prisma for data persistence
- TypeScript across the application
- Zod for request validation
- JWT for authentication
- Role-based access control for authorization
- An isolated AI service integration for incident analysis

## Development Principles

- Follow the approved project specifications before implementation.
- Keep frontend, backend, database, and AI responsibilities separated.
- Validate all user input at API boundaries.
- Preserve existing functionality when adding features.
- Prefer simple and maintainable solutions.
- Write automated tests for important business logic.
- Do not make AI functionality a hard dependency for core incident operations.
- Maintain secure handling of authentication, authorization, and user data.