# Implementation Plan: Smart IT Helpdesk and Incident Management System

## Overview

Implement a full-stack IT helpdesk web application using React 18 (Vite) for the frontend and Node.js 20 + Express 4 for the backend REST API, backed by PostgreSQL 15 via Prisma ORM, with an OpenAI-compatible AI integration layer. Tasks are ordered to build foundational infrastructure first, then core business logic, then the frontend, finishing with integration wiring.

## Tasks

- [x] 1. Set up project structure, tooling, and database schema
  - [x] 1.1 Initialize backend project with Node.js, TypeScript, Express, Prisma, and dependencies
    - Create `package.json` with all backend dependencies: `express`, `prisma`, `@prisma/client`, `jsonwebtoken`, `bcrypt`, `zod`, `axios`, `express-rate-limit`, `pino`, dependencies for testing (`jest`, `ts-jest`, `supertest`, `fast-check`)
    - Configure `tsconfig.json`, `jest.config.ts`, and `.env.example`
    - Set up `src/app.ts` (Express app factory), `src/server.ts` (HTTP entry point), `src/config.ts` (Zod env validation)
    - Create the full `src/` directory structure as specified in the design (`middleware/`, `modules/`, `services/`, `lib/`, `prisma/`)
    - _Requirements: 12.8, 13.1, 13.5_

  - [x] 1.2 Define Prisma schema with all models, enums, and indexes
    - Write `prisma/schema.prisma` with `User`, `Incident`, `Comment`, `AuditLog` models and all enums (`Role`, `UserStatus`, `IncidentStatus`, `IncidentPriority`, `IncidentCategory`, `AuditOperation`)
    - Add indexes on `Incident.submitter_id`, `Incident.status`, `Incident.assigned_to`, `Incident.created_at`, `Comment.incident_id`, `AuditLog.incident_id`, `AuditLog.timestamp`
    - Run initial migration to produce SQL and generate the Prisma client
    - _Requirements: 12.8, 12.9_

  - [x] 1.3 Initialize frontend project with React, Vite, Tailwind CSS, and TanStack Query
    - Create `frontend/` with `vite.config.ts`, `tailwind.config.ts`, and all dependencies: `react`, `react-dom`, `react-router-dom`, `@tanstack/react-query`, `vitest`, `@testing-library/react`, `msw`
    - Set up project entry (`main.tsx`, `App.tsx`), router skeleton, and TanStack Query provider
    - _Requirements: 3.6_

- [x] 2. Implement shared backend infrastructure
  - [x] 2.1 Implement error classes, error handler middleware, and request logger
    - Write `src/lib/errors.ts` with `AppError` and all typed subclasses (`ValidationError`, `AuthenticationError`, `AuthorizationError`, `NotFoundError`, `ConflictError`, `PayloadTooLargeError`, `RateLimitError`, `InternalServerError`)
    - Write `src/middleware/errorHandler.ts` mapping each `AppError` subclass to the standard JSON error envelope (with `error_code`, `message`, `details`)
    - Write `src/middleware/requestLogger.ts` using pino, logging method, path, status code, response time — excluding JWT values and password fields
    - _Requirements: 13.4, 12.10_

  - [x] 2.2 Implement body size limit, sanitization, and pagination helper
    - Configure Express to reject request bodies > 1 MB with HTTP 413 in `src/app.ts`
    - Write `src/middleware/sanitize.ts` to sanitize all user-supplied string inputs to prevent stored XSS before persistence
    - Write `src/lib/pagination.ts` with a `buildPaginationEnvelope` helper that computes `total_count`, `page`, `page_size`, `total_pages`
    - _Requirements: 12.3, 12.7, 13.3_

  - [x] 2.3 Implement rate limiting middleware
    - Write `src/middleware/rateLimiter.ts` with two limiters: authenticated users (60 requests/user/minute → HTTP 429) and unauthenticated login endpoint (10 attempts/IP/minute → HTTP 429)
    - Apply limiters in `src/app.ts`
    - _Requirements: 12.5, 12.6_

  - [x]* 2.4 Write property test for rate limit enforcement
    - **Property 15: Rate limit enforcement**
    - **Validates: Requirements 12.5, 12.6**

- [x] 3. Implement authentication module
  - [x] 3.1 Implement JWT helpers, bcrypt password utilities, and auth middleware
    - Write `src/lib/jwt.ts` with `signToken` (payload + 24h expiry) and `verifyToken` helpers using the `JWTPayload` interface (`sub`, `email`, `role`, `iat`, `exp`)
    - Write `src/middleware/auth.ts` to verify JWT on every protected request, attach user to `req`, return HTTP 401 on missing/invalid/expired token
    - Write `src/middleware/rbac.ts` role guard factory returning HTTP 403 when the requesting role is not in the allowed list
    - Implement password hashing with bcrypt cost factor 12; never store plaintext
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [x]* 3.2 Write property test for authentication token validity
    - **Property 1: Authentication token validity**
    - **Validates: Requirements 1.1, 1.3, 1.4**

  - [x]* 3.3 Write property test for password never stored in plaintext
    - **Property 2: Password never stored in plaintext**
    - **Validates: Requirements 1.7**

  - [x]* 3.4 Write property test for role access enforcement
    - **Property 3: Role access enforcement**
    - **Validates: Requirements 1.5, 1.6**

  - [x] 3.5 Implement auth service and login route
    - Write `src/modules/auth/auth.service.ts`: query user by email, compare bcrypt hash, generate JWT on success, return HTTP 401 with descriptive error on failure
    - Write `src/modules/auth/auth.controller.ts` and `src/modules/auth/auth.router.ts` exposing `POST /api/v1/auth/login`
    - Apply unauthenticated rate limiter to the login route
    - _Requirements: 1.1, 1.2_

- [ ] 4. Implement user management module
  - [-] 4.1 Implement user service with LRU status cache and user management routes
    - Write `src/modules/users/users.service.ts` with:
      - `createUser`: require unique email, display name, role; hash password; return HTTP 409 on duplicate email
      - `deactivateUser`: set status to `INACTIVE`; invalidate status cache entry within 60 seconds using an in-process LRU cache (60s TTL) checked by auth middleware
      - `updateUserRole`: update role; new role takes effect on next JWT issuance
      - `listUsers`: paginated list with ID, display name, email, role, status
    - Write controller and router exposing `POST /users`, `GET /users`, `PATCH /users/:id` (Admin-only via RBAC guard)
    - Integrate LRU user-status cache into `src/middleware/auth.ts` so deactivated users are rejected within 60 seconds without a token blacklist
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [ ]* 4.2 Write unit tests for user service
    - Test duplicate email → HTTP 409
    - Test deactivation → inactive user auth rejection within cache TTL
    - Test role update applied on next login
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.6_

- [ ] 5. Implement incident core — creation, validation, and AI integration
  - [-] 5.1 Implement Zod validation schemas for incidents
    - Write `src/modules/incidents/incidents.schema.ts` with `createIncidentSchema` enforcing: `title` (required, ≤200 chars), `description` (required, ≤5000 chars), `category` (IncidentCategory enum), `priority` (IncidentPriority enum), optional `attachment_info` (filename ≤255 chars, size_bytes ≤10 MB, MIME in allowed list)
    - Return HTTP 422 with field-level `details` for any violation
    - _Requirements: 2.1, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

  - [ ]* 5.2 Write property test for incident creation field validation
    - **Property 4: Incident creation field validation**
    - **Validates: Requirements 2.3, 2.4, 2.5, 2.6, 2.7**

  - [ ] 5.3 Implement AI service proxy
    - Write `src/services/ai.service.ts` implementing `analyzeIncident(description): Promise<AISuggestions | null>`
    - Use Axios with a 5-second timeout to call the external LLM API
    - Parse the response JSON; truncate `summary` to 150 characters; return `null` on any error (timeout, network error, parse failure) — never propagate exceptions to caller
    - _Requirements: 3.1, 3.3, 3.4, 3.5_

  - [ ]* 5.4 Write property test for AI analysis non-blocking
    - **Property 13: AI analysis non-blocking**
    - **Validates: Requirements 3.3, 3.4, 3.5**

  - [~] 5.5 Implement incident creation service and route
    - Write `src/modules/incidents/incidents.service.ts` `createIncident` method: validate input via Zod schema, call `analyzeIncident` concurrently (non-blocking), persist incident with `status = Open`, `submitter_id` from JWT, return HTTP 201 with full record including `ai_suggestions`
    - Write `src/modules/incidents/incidents.controller.ts` and `src/modules/incidents/incidents.router.ts` exposing `POST /api/v1/incidents`
    - Write an `AuditLog` entry for the `CREATE` operation
    - _Requirements: 2.1, 2.2, 2.9, 3.1, 3.2, 3.3, 11.1, 11.2_

- [ ] 6. Implement incident read, search, filter, and pagination
  - [~] 6.1 Implement incident listing and detail retrieval with role-based scoping
    - In `incidents.service.ts` add `listIncidents` method: for `Employee` role, scope to `submitter_id = req.user.id`; for `Support_Agent`/`Admin`, return all incidents; default sort by `created_at` desc
    - Add `getIncidentById` method: for `Employee`, return HTTP 404 (not revealing existence) if incident does not belong to them; for `Agent`/`Admin`, return any incident
    - Include `Resolution_Detail` in response only when present; omit the field entirely when absent
    - Expose `GET /api/v1/incidents` and `GET /api/v1/incidents/:id`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 7.1_

  - [ ]* 6.2 Write property test for incident ownership isolation
    - **Property 5: Incident ownership isolation**
    - **Validates: Requirements 4.3, 4.4**

  - [~] 6.3 Implement search, filter, and sort query parameters
    - Extend `listIncidents` to accept and apply: `search` (case-insensitive `title`/`description` contains), `status`, `category`, `priority` filters for Employees (own incidents only); additionally `assigned_to` and `submitter_id` filters for Agent/Admin
    - Apply all provided filters as logical AND; return HTTP 422 for invalid enum values in filter params or invalid `sort_by` fields
    - Support `sort_by` (`created_at`, `updated_at`, `priority`) and `sort_order` (`asc`, `desc`) for Agent/Admin
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ]* 6.4 Write property test for search and filter logical AND
    - **Property 9: Search and filter logical AND**
    - **Validates: Requirements 6.5, 8.3**

  - [~] 6.5 Implement pagination for incident list endpoints
    - Add `page` / `page_size` query params to `listIncidents`; cap `page_size` at 100; return HTTP 422 for `page_size` ≤ 0; use `buildPaginationEnvelope` to produce `pagination` object in list responses
    - Apply the same pagination to the users list endpoint
    - _Requirements: 6.7, 8.6, 13.3_

  - [ ]* 6.6 Write property test for pagination bounds correctness
    - **Property 10: Pagination bounds correctness**
    - **Validates: Requirements 6.7, 8.6, 13.3**

- [ ] 7. Implement incident mutation — status, assignment, and resolution
  - [~] 7.1 Implement ALLOWED_TRANSITIONS state machine and status update logic
    - In `incidents.service.ts`, define `ALLOWED_TRANSITIONS` constant mapping each `IncidentStatus` to its allowed next states
    - Implement `updateIncidentStatus`: validate the requested transition; return HTTP 422 with current status and allowed next states if invalid; persist new status and record audit log entry
    - _Requirements: 7.4, 11.1, 11.2_

  - [ ]* 7.2 Write property test for status transition invariant
    - **Property 11: Status transition invariant**
    - **Validates: Requirements 7.4**

  - [~] 7.3 Implement incident assignment and priority update
    - Implement `assignIncident`: validate that target user holds `Support_Agent` or `Admin` role; update `assigned_to` and `assigned_at`; record audit log entry; return HTTP 422 if assignee role is invalid
    - Implement `updateIncidentPriority`: accept any valid `IncidentPriority` value; update record; record audit log entry
    - Expose `PATCH /api/v1/incidents/:id` wiring status update, assignment, and priority update (Agent/Admin only via RBAC)
    - _Requirements: 7.2, 7.3, 7.5, 7.7, 11.1, 11.2_

  - [~] 7.4 Implement resolution detail submission
    - Implement `submitResolutionDetail`: validate `root_cause`, `resolution_steps`, `resolved_at`; store as JSON in `resolution_detail`; auto-transition status from `In_Progress` to `Resolved` if current status is `In_Progress`; record audit log entry
    - _Requirements: 7.6, 7.7, 11.1, 11.2_

  - [ ]* 7.5 Write property test for audit log completeness
    - **Property 12: Audit log completeness**
    - **Validates: Requirements 7.7, 11.1, 11.2**

- [ ] 8. Implement comments and internal notes module
  - [~] 8.1 Implement comment service and routes
    - Write `src/modules/comments/comments.service.ts` `addComment` method: validate body (non-empty, non-whitespace, ≤2000 chars) → HTTP 422 on violation; reject if incident status is `Closed` → HTTP 409; set `is_internal = true` only when requested by `Support_Agent`/`Admin`; attach `author_id` from JWT; record audit log entry
    - Implement `listComments`: for `Employee` role, exclude all comments where `is_internal = true`; for `Agent`/`Admin`, return all comments
    - Write controller and router exposing `POST /api/v1/incidents/:id/comments` and `GET /api/v1/incidents/:id/comments`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 4.6_

  - [ ]* 8.2 Write property test for internal note exclusion from Employee responses
    - **Property 6: Internal note exclusion from Employee responses**
    - **Validates: Requirements 4.6, 5.2**

  - [ ]* 8.3 Write property test for comment body validation
    - **Property 7: Comment body validation**
    - **Validates: Requirements 5.4, 5.5**

  - [ ]* 8.4 Write property test for closed incident comment rejection
    - **Property 8: Closed incident comment rejection**
    - **Validates: Requirements 5.6**

- [ ] 9. Implement audit log module
  - [~] 9.1 Implement audit log service and read route
    - Write `src/modules/audit/audit.service.ts` with `createAuditEntry` (append-only; captures `incident_id`, `actor_id`, `operation`, `field`, `old_value`, `new_value`, `timestamp`) — called from incident, comment, and user mutation operations
    - Implement `getAuditLog(incidentId)`: return all entries in ascending timestamp order; return HTTP 500 with explicit error message on retrieval failure
    - Ensure `createAuditEntry` is always called within the same database transaction as the mutating operation to guarantee atomicity
    - Expose `GET /api/v1/incidents/:id/audit` (Admin only)
    - No update or delete operations are exposed — the table is append-only for all roles including Admin
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

- [ ] 10. Implement admin dashboard module
  - [~] 10.1 Implement dashboard aggregation queries and route
    - Write `src/modules/dashboard/dashboard.service.ts` computing at query time: incident counts by `status`, by `priority`, by `category`; count of unassigned open incidents (`status = Open` AND `assigned_to IS NULL`); average seconds from `created_at` to first `In_Progress` transition within the last 30 days (excluding still-Open incidents)
    - Use a single transaction or multiple queries within one request; do not cache results
    - Write controller and router exposing `GET /api/v1/dashboard` (Admin only via RBAC)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [ ]* 10.2 Write property test for dashboard metrics consistency
    - **Property 14: Dashboard metrics consistency**
    - **Validates: Requirements 9.1, 9.2, 9.3**

- [~] 11. Backend checkpoint — wire all modules and validate full API
  - Ensure all routers are registered on the Express app in `src/app.ts` under `/api/v1/`
  - Confirm HTTPS enforcement and plain HTTP rejection are configured at the reverse proxy / server layer
  - Verify all middleware ordering: body size limit → sanitize → rate limiter → auth → RBAC → route handler → error handler
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. Implement React frontend — authentication and routing
  - [~] 12.1 Implement login page and JWT session management
    - Create `LoginPage` component with email/password form calling `POST /api/v1/auth/login`
    - Store JWT in memory (or `httpOnly` cookie if backend supports it); attach as `Authorization: Bearer` header on all API requests via an Axios instance or TanStack Query default headers
    - Implement protected route wrapper that redirects unauthenticated users to `/login`
    - Set up React Router routes: `/login`, `/incidents`, `/incidents/:id`, `/dashboard`, `/users`
    - _Requirements: 1.1, 1.2, 1.3_

- [ ] 13. Implement React frontend — incident list, creation form with AI suggestions
  - [~] 13.1 Implement incident creation form with AI suggestion display
    - Create `NewIncidentForm` component with fields: `title`, `description`, `category`, `priority`, optional `attachment_info`
    - On description change (debounced), call the AI analysis endpoint; display suggested `category`, `priority`, and `summary` to the user before final submission
    - Allow the user to accept or override each AI suggestion individually
    - Validate title (≤200 chars), description (≤5000 chars) client-side with inline error messages
    - _Requirements: 3.6, 2.1, 2.3, 2.4, 2.5_

  - [ ]* 13.2 Write component tests for incident creation form
    - Test AI suggestion display and accept/override flow using MSW to mock the AI endpoint
    - Test client-side validation error messages for over-length fields
    - _Requirements: 3.6_

  - [~] 13.3 Implement incident list page with search, filter, and pagination controls
    - Create `IncidentListPage` showing incidents (role-scoped via backend) with TanStack Query for data fetching
    - Add search input, status/category/priority filter dropdowns, and pagination controls
    - For Agent/Admin: add `assigned_to`, `submitter_id` filters and sort controls (`sort_by`, `sort_order`)
    - _Requirements: 4.1, 4.2, 6.1, 6.2, 6.3, 6.4, 6.5, 6.7, 7.1, 8.1, 8.2, 8.4, 8.6_

- [ ] 14. Implement React frontend — incident detail, comments, and agent actions
  - [~] 14.1 Implement incident detail page
    - Create `IncidentDetailPage` showing full incident record including `Resolution_Detail` (when present) and the comment thread
    - For Employee: hide internal notes; show only public comments
    - For Agent/Admin: show all comments with visual distinction for internal notes; display status/priority/assignee controls; display resolution detail form
    - _Requirements: 4.3, 4.5, 4.6, 5.3, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [~] 14.2 Implement comment submission and internal note toggle
    - Add comment form to `IncidentDetailPage` with body textarea (≤2000 chars) and, for Agent/Admin, an "Internal Note" toggle
    - Disable form and show message when incident status is `Closed`
    - _Requirements: 5.1, 5.2, 5.4, 5.5, 5.6_

- [ ] 15. Implement React frontend — admin dashboard and user management
  - [~] 15.1 Implement admin dashboard page
    - Create `DashboardPage` with metric cards showing: incident counts by status, by priority, by category; unassigned open incidents count; average time to `In Progress`
    - Use TanStack Query to fetch from `GET /api/v1/dashboard`; render only for Admin role
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [~] 15.2 Implement user management page
    - Create `UsersPage` with a paginated user table (ID, display name, email, role, status) and controls for creating users, updating roles, and deactivating accounts
    - Show appropriate HTTP 409 feedback on duplicate email; show confirmation before deactivation
    - _Requirements: 10.1, 10.2, 10.3, 10.5, 10.6_

- [~] 16. Final checkpoint — end-to-end integration and test pass
  - Ensure all backend unit, property-based, and integration tests pass (`jest --runInBand`)
  - Ensure all frontend component tests pass (`vitest --run`)
  - Verify the full incident lifecycle end-to-end via integration tests: create → assign → In_Progress → Resolved → Closed, with audit log entries at each step
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP development
- Each task references specific requirements for full traceability
- Property-based tests use **fast-check** arbitraries and must run a minimum of 100 iterations each
- Unit and integration tests use **Jest** (backend) and **Vitest** (frontend)
- Integration tests require a dedicated PostgreSQL test database; use `DATABASE_URL` from `.env.test`
- All audit log entries are written within the same database transaction as the mutating operation to guarantee atomicity
- The AI service always returns `null` on failure — never throw exceptions to callers
- Deactivated-user JWT invalidation is handled via an in-process LRU cache (60s TTL) in the auth middleware — no token blacklist required

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3"] },
    { "id": 2, "tasks": ["2.4", "3.1"] },
    { "id": 3, "tasks": ["3.2", "3.3", "3.4", "3.5"] },
    { "id": 4, "tasks": ["4.1", "5.1", "5.3"] },
    { "id": 5, "tasks": ["4.2", "5.2", "5.4", "5.5"] },
    { "id": 6, "tasks": ["6.1", "7.1", "8.1", "9.1"] },
    { "id": 7, "tasks": ["6.2", "6.3", "7.2", "7.3", "8.2", "8.3", "8.4"] },
    { "id": 8, "tasks": ["6.4", "6.5", "7.4", "7.5", "10.1"] },
    { "id": 9, "tasks": ["6.6", "10.2", "12.1"] },
    { "id": 10, "tasks": ["13.1", "13.3"] },
    { "id": 11, "tasks": ["13.2", "14.1"] },
    { "id": 12, "tasks": ["14.2", "15.1", "15.2"] }
  ]
}
```
