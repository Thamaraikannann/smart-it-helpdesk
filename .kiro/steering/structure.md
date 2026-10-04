# Project Structure

## Repository Structure

The Smart IT Helpdesk project is organized as a full-stack application with separate frontend, backend, database, service, middleware, and testing responsibilities.

## Main Directories

### `src/`

Contains the backend application source code.

### `src/modules/`

Contains business modules organized by domain.

Examples include:

- `auth` — authentication and login
- `users` — user management
- `incidents` — incident creation and management

Each module should keep related business logic together.

### `src/middleware/`

Contains reusable Express middleware for:

- Authentication
- Authorization
- Request sanitization
- Rate limiting
- Error handling
- Request logging

### `src/lib/`

Contains shared utility functionality such as:

- JWT helpers
- Password utilities
- Pagination utilities

### `src/services/`

Contains shared application services.

The AI integration is isolated here so that AI-related failures do not affect core incident operations.

### `prisma/`

Contains the Prisma database schema and database-related configuration.

The Prisma schema is the source of truth for database models and relationships.

### `src/**/*.test.ts`

Contains automated tests for application functionality.

Tests should remain close to the functionality they verify where practical.

## Kiro Configuration

### `.kiro/specs/`

Contains feature specifications generated and maintained through Kiro.

The Smart IT Helpdesk specification includes:

- `requirements.md`
- `design.md`
- `tasks.md`

### `.kiro/steering/`

Contains persistent project guidance that should be considered during development.

Current steering documents include:

- `product.md`
- `tech.md`
- `structure.md`

### `.kiro/hooks/`

Contains Kiro hooks used to automate project-related workflows.

### `.kiro/ugmdu.json`

Contains Kiro University challenge/project tracking configuration.

## Architectural Principles

- Keep domain logic inside appropriate modules.
- Keep reusable cross-cutting functionality inside shared middleware or libraries.
- Keep database access through Prisma.
- Keep AI integration isolated from core business operations.
- Avoid placing unrelated functionality into a single module.
- Keep tests organized around the functionality they validate.
- Follow the approved Kiro specifications when implementing new features.

## Change Guidelines

When adding a new feature:

1. Update the relevant specification when requirements change.
2. Place business logic in the appropriate domain module.
3. Add or update validation at API boundaries.
4. Add tests for important behavior.
5. Avoid unnecessary changes to unrelated modules.
6. Preserve the existing project architecture.