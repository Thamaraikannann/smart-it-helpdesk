# Design Document — Smart IT Helpdesk and Incident Management System

## Overview

The Smart IT Helpdesk and Incident Management System is a full-stack web application enabling employees to report IT issues, track resolution progress, and communicate with support staff. Support agents and administrators manage the incident lifecycle from triage through closure. An AI analysis layer enriches incoming incidents with suggested category, priority, and summary.

The system follows a layered architecture with strict separation between the frontend (React SPA), backend (Node.js REST API), database (PostgreSQL), and external AI integration (OpenAI-compatible LLM). All communication between client and server is JSON over HTTPS.

### Key Design Goals

- **Role-based access control** enforced at the API layer for all resources.
- **Resilient AI integration** — incident creation never blocks on AI availability.
- **Full audit trail** — immutable log of every incident mutation.
- **Consistent REST API** versioned at `/api/v1/`, returning uniform JSON envelopes.
- **Performance** — sub-500ms P95 response time under 100 concurrent users.

---

## Architecture

The system is composed of four layers:

```
┌─────────────────────────────────────┐
│          React Frontend (SPA)        │
│  Vite + React 18 + React Router +   │
│  TanStack Query + Tailwind CSS       │
└──────────────────┬──────────────────┘
                   │ HTTPS / REST JSON
┌──────────────────▼──────────────────┐
│       Node.js Backend API           │
│  Express 4 + JWT + Zod validation   │
│  /api/v1/* routes                   │
│                                     │
│  ┌──────────────────────────────┐   │
│  │  Auth  │  Incidents │  Users │   │
│  │  Comments │ Dashboard │ Audit│   │
│  └──────────────────────────────┘   │
└──────────┬──────────────┬───────────┘
           │              │ async (timeout 5s)
┌──────────▼──────┐  ┌────▼──────────────┐
│   PostgreSQL 15  │  │  AI Service Proxy  │
│   (Prisma ORM)  │  │  (OpenAI API call)  │
└─────────────────┘  └───────────────────┘
```

### Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| Frontend | React 18 + Vite | Fast HMR, ecosystem maturity, component model fits incident forms and dashboards |
| State / Data fetching | TanStack Query v5 | Declarative server-state caching, automatic background refetch |
| Styling | Tailwind CSS | Utility-first, low footprint, consistent design tokens |
| Backend | Node.js 20 + Express 4 | Large ecosystem, async-first, straightforward REST routing |
| Validation | Zod | Runtime schema validation with TypeScript inference; used in both API input and Prisma model mapping |
| ORM | Prisma 5 | Type-safe, migrations, parameterized queries by default (prevents SQL injection) |
| Database | PostgreSQL 15 | ACID transactions, full-text search, JSON columns for audit snapshots |
| Auth | JWT (jsonwebtoken) + bcrypt | Stateless tokens; bcrypt cost factor 12 for password hashing |
| Rate limiting | express-rate-limit | Per-user and per-IP sliding window |
| AI Integration | Axios with timeout | Wraps OpenAI Chat Completions API; isolated service module |

### Deployment Topology

```
Internet → Reverse Proxy (nginx / TLS termination)
            ├── /api/v1/*  → Node.js API (port 3001)
            └── /*         → Static React build (port 80)

Node.js API → PostgreSQL (port 5432, internal network)
Node.js API → OpenAI API (HTTPS, external)
```

---

## Components and Interfaces

### Backend Module Structure

```
src/
├── app.ts                  # Express app factory (middleware, routes)
├── server.ts               # HTTP server entry point
├── config.ts               # Environment variable validation (Zod)
├── middleware/
│   ├── auth.ts             # JWT verification, user attachment to req
│   ├── rbac.ts             # Role guard factory
│   ├── rateLimiter.ts      # Authenticated + unauthenticated rate limiters
│   ├── requestLogger.ts    # HTTP request logging (pino)
│   ├── sanitize.ts         # DOMPurify / manual string sanitization
│   └── errorHandler.ts     # Centralised error → JSON response mapper
├── modules/
│   ├── auth/
│   │   ├── auth.router.ts
│   │   ├── auth.controller.ts
│   │   └── auth.service.ts
│   ├── incidents/
│   │   ├── incidents.router.ts
│   │   ├── incidents.controller.ts
│   │   ├── incidents.service.ts
│   │   └── incidents.schema.ts   # Zod schemas
│   ├── comments/
│   ├── users/
│   ├── dashboard/
│   └── audit/
├── services/
│   └── ai.service.ts       # AI/LLM proxy with timeout + fallback
├── lib/
│   ├── prisma.ts            # Prisma client singleton
│   ├── jwt.ts               # Token sign / verify helpers
│   ├── pagination.ts        # Shared pagination envelope builder
│   └── errors.ts            # AppError base class + typed subclasses
└── prisma/
    ├── schema.prisma
    └── migrations/
```

### REST API Surface

All endpoints are prefixed `/api/v1/`.

#### Authentication

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/login` | None | Authenticate, receive JWT |

#### Incidents

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/incidents` | Employee+ | Create incident (triggers AI analysis) |
| GET | `/incidents` | Any | List incidents (filtered by role) |
| GET | `/incidents/:id` | Any | Get incident detail |
| PATCH | `/incidents/:id` | Agent/Admin | Update status, priority, assignee, resolution |
| GET | `/incidents/:id/audit` | Admin | Incident audit trail |

#### Comments

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/incidents/:id/comments` | Any | Add comment or internal note |
| GET | `/incidents/:id/comments` | Any | List comments (filtered by role) |

#### Users

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/users` | Admin | Create user account |
| GET | `/users` | Admin | List users (paginated) |
| PATCH | `/users/:id` | Admin | Update role or deactivate account |

#### Dashboard

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/dashboard` | Admin | Aggregate incident metrics |

### Request / Response Conventions

**Success envelope (list):**
```json
{
  "data": [...],
  "pagination": {
    "total_count": 42,
    "page": 1,
    "page_size": 20,
    "total_pages": 3
  }
}
```

**Success envelope (single):**
```json
{ "data": { ... } }
```

**Error envelope:**
```json
{
  "error_code": "VALIDATION_ERROR",
  "message": "Request validation failed",
  "details": [
    { "field": "title", "message": "Title is required" }
  ]
}
```

### AI Service Interface

```typescript
interface AISuggestions {
  category: IncidentCategory;
  priority: IncidentPriority;
  summary: string; // truncated to 150 chars
}

// Returns null on timeout (>5s) or any error
async function analyzeIncident(description: string): Promise<AISuggestions | null>
```

The AI service sends a structured prompt to the LLM requesting JSON output with the three fields. Parsing failures, network errors, and timeouts all result in `null` — the caller never sees an exception.

---

## Data Models

### Prisma Schema

```prisma
model User {
  id           String    @id @default(uuid())
  email        String    @unique
  display_name String
  password_hash String
  role         Role
  status       UserStatus @default(ACTIVE)
  created_at   DateTime  @default(now())
  updated_at   DateTime  @updatedAt

  incidents    Incident[] @relation("SubmittedBy")
  assigned     Incident[] @relation("AssignedTo")
  comments     Comment[]
  audit_entries AuditLog[]
}

enum Role {
  Employee
  Support_Agent
  Admin
}

enum UserStatus {
  ACTIVE
  INACTIVE
}

model Incident {
  id             String          @id @default(uuid())
  title          String          @db.VarChar(200)
  description    String          @db.VarChar(5000)
  category       IncidentCategory
  priority       IncidentPriority
  status         IncidentStatus  @default(Open)
  submitter_id   String
  submitter      User            @relation("SubmittedBy", fields: [submitter_id], references: [id])
  assigned_to    String?
  assignee       User?           @relation("AssignedTo", fields: [assigned_to], references: [id])
  assigned_at    DateTime?
  attachment_info Json?          // { filename, size_bytes, mime_type } | null
  ai_suggestions  Json?          // { category, priority, summary } | null
  resolution_detail Json?        // { root_cause, resolution_steps, resolved_at } | null
  created_at     DateTime        @default(now())
  updated_at     DateTime        @updatedAt

  comments       Comment[]
  audit_entries  AuditLog[]

  @@index([submitter_id])
  @@index([status])
  @@index([assigned_to])
  @@index([created_at])
}

enum IncidentStatus {
  Open
  In_Progress
  On_Hold
  Resolved
  Closed
}

enum IncidentPriority {
  Low
  Medium
  High
  Critical
}

enum IncidentCategory {
  Hardware
  Software
  Network
  Access_Permissions
  Email_Communication
  Other
}

model Comment {
  id          String    @id @default(uuid())
  incident_id String
  incident    Incident  @relation(fields: [incident_id], references: [id])
  author_id   String
  author      User      @relation(fields: [author_id], references: [id])
  body        String    @db.VarChar(2000)
  is_internal Boolean   @default(false)
  created_at  DateTime  @default(now())

  @@index([incident_id])
}

model AuditLog {
  id          String    @id @default(uuid())
  incident_id String
  incident    Incident  @relation(fields: [incident_id], references: [id])
  actor_id    String
  actor       User      @relation(fields: [actor_id], references: [id])
  operation   AuditOperation
  field       String?
  old_value   Json?
  new_value   Json?
  timestamp   DateTime  @default(now())

  @@index([incident_id])
  @@index([timestamp])
}

enum AuditOperation {
  CREATE
  UPDATE
  DELETE
}
```

### Key Data Relationships

- **User → Incident** (1:many) via `submitter_id`
- **User → Incident** (1:many) via `assigned_to` (optional)
- **Incident → Comment** (1:many)
- **Incident → AuditLog** (1:many, append-only)
- `attachment_info`, `ai_suggestions`, and `resolution_detail` are stored as JSON columns, keeping the schema flat while allowing structured data.

### State Machine — Incident Status

```
Open ──────────► In_Progress ──► Resolved ──► Closed
  │                  ▲               (terminal after Closed)
  │                  │
  └──► On_Hold ──────┘
         ▲
         │
    In_Progress
```

Allowed transitions encoded as a constant map in `incidents.service.ts`:

```typescript
const ALLOWED_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  Open:        ['In_Progress', 'On_Hold'],
  In_Progress: ['On_Hold', 'Resolved'],
  On_Hold:     ['In_Progress'],
  Resolved:    ['Closed'],
  Closed:      [],
};
```

### JWT Payload Structure

```typescript
interface JWTPayload {
  sub: string;       // user ID
  email: string;
  role: Role;
  iat: number;
  exp: number;       // iat + 24h
}
```

### RBAC Permissions Matrix

| Action | Employee | Support_Agent | Admin |
|---|---|---|---|
| Create incident | ✓ | ✓ | ✓ |
| View own incidents | ✓ | ✓ | ✓ |
| View all incidents | ✗ | ✓ | ✓ |
| Comment on incident | own only | any | any |
| Add internal note | ✗ | ✓ | ✓ |
| Update incident status/priority | ✗ | ✓ | ✓ |
| Assign incident | ✗ | ✓ | ✓ |
| Submit resolution detail | ✗ | ✓ | ✓ |
| View dashboard | ✗ | ✗ | ✓ |
| Manage users | ✗ | ✗ | ✓ |
| View audit log | ✗ | ✗ | ✓ |

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Authentication token validity

*For any* valid credential submission, the returned JWT shall decode to a payload containing the correct user ID, role, and an expiry exactly 24 hours after issuance — and conversely, *for any* invalid or expired token, the system shall refuse access.

**Validates: Requirements 1.1, 1.3, 1.4**

---

### Property 2: Password never stored in plaintext

*For any* user account, the stored `password_hash` shall never equal the original plaintext password, and bcrypt verification with the correct password shall always return true.

**Validates: Requirements 1.7**

---

### Property 3: Role access enforcement

*For any* authenticated request, if the requesting user's role does not appear in the allowed roles for the target endpoint, the system shall return HTTP 403, regardless of the request body or path parameters.

**Validates: Requirements 1.5, 1.6**

---

### Property 4: Incident creation field validation

*For any* incident creation request, if any required field (`title`, `description`, `category`, `priority`) is absent or exceeds its length constraint, the system shall return HTTP 422 and no incident record shall be created in the database.

**Validates: Requirements 2.3, 2.4, 2.5, 2.6, 2.7**

---

### Property 5: Incident ownership isolation

*For any* Employee user and *any* incident not submitted by that user, a request for that incident by ID shall return HTTP 404 — the response shall never reveal the existence of the incident.

**Validates: Requirements 4.3, 4.4**

---

### Property 6: Internal note exclusion from Employee responses

*For any* incident with one or more internal notes, a response returned to an Employee-role user shall contain zero comments where `is_internal` is `true`.

**Validates: Requirements 4.6, 5.2**

---

### Property 7: Comment body validation

*For any* string composed entirely of whitespace characters, or *any* string exceeding 2000 characters, submitting it as a comment body shall return HTTP 422 and no comment record shall be created.

**Validates: Requirements 5.4, 5.5**

---

### Property 8: Closed incident comment rejection

*For any* incident whose current status is `Closed`, any attempt to add a comment — regardless of the commenter's role or comment content — shall return HTTP 409.

**Validates: Requirements 5.6**

---

### Property 9: Search and filter logical AND

*For any* combination of `search`, `status`, `category`, `priority`, and `assigned_to` filter parameters provided simultaneously, every incident returned in the result set shall satisfy all supplied conditions simultaneously — no result shall satisfy only a subset of the applied filters.

**Validates: Requirements 6.5, 8.3**

---

### Property 10: Pagination bounds correctness

*For any* valid paginated request with `page_size` N and `page` P against a dataset of T total items, the response shall contain at most N items, `total_count` shall equal T, `total_pages` shall equal ⌈T/N⌉, and *for any* `page_size` ≤ 0 the system shall return HTTP 422.

**Validates: Requirements 6.7, 8.6, 13.3**

---

### Property 11: Status transition invariant

*For any* incident status update request, if the requested target status is not in the set of allowed next states for the current status, the system shall return HTTP 422, and the incident status in the database shall remain unchanged.

**Validates: Requirements 7.4**

---

### Property 12: Audit log completeness

*For any* create, update, or delete operation on an Incident record, exactly one immutable audit log entry shall be appended capturing the actor ID, operation type, timestamp, and before/after values of changed fields.

**Validates: Requirements 7.7, 11.1, 11.2**

---

### Property 13: AI analysis non-blocking

*For any* incident creation request, whether the AI service succeeds, times out, or errors, the incident record shall be created and HTTP 201 returned — `ai_suggestions` shall be the analysis result object on success or `null` on failure, never causing a 5xx response.

**Validates: Requirements 3.3, 3.4, 3.5**

---

### Property 14: Dashboard metrics consistency

*For any* snapshot of incident data, the sum of counts returned by `status` grouping shall equal the sum of counts returned by `priority` grouping, and both shall equal the total number of incidents in the system.

**Validates: Requirements 9.1, 9.2, 9.3**

---

### Property 15: Rate limit enforcement

*For any* authenticated user who has submitted more than 60 API requests within a 60-second sliding window, the next request shall return HTTP 429. *For any* unauthenticated IP that has attempted more than 10 login requests within a 60-second window, the next attempt shall return HTTP 429.

**Validates: Requirements 12.5, 12.6**

---

## Error Handling

### Error Class Hierarchy

```typescript
class AppError extends Error {
  constructor(
    public statusCode: number,
    public errorCode: string,
    public message: string,
    public details?: FieldError[]
  ) {}
}

class ValidationError extends AppError { /* 422 */ }
class AuthenticationError extends AppError { /* 401 */ }
class AuthorizationError extends AppError { /* 403 */ }
class NotFoundError extends AppError { /* 404 */ }
class ConflictError extends AppError { /* 409 */ }
class PayloadTooLargeError extends AppError { /* 413 */ }
class RateLimitError extends AppError { /* 429 */ }
class InternalServerError extends AppError { /* 500 */ }
```

The global error handler middleware catches all `AppError` subclasses and maps them to the standard JSON error envelope. Unhandled exceptions are caught, logged, and returned as `INTERNAL_SERVER_ERROR` (500) without leaking stack traces.

### AI Service Error Handling

```typescript
async function analyzeIncident(description: string): Promise<AISuggestions | null> {
  try {
    const response = await axios.post(AI_API_URL, payload, { timeout: 5000 });
    return parseAndTruncate(response.data); // truncates summary to 150 chars
  } catch (err) {
    logger.warn('AI analysis failed or timed out', { error: err.message });
    return null; // never propagates to caller
  }
}
```

### Validation Flow

All request bodies are validated with Zod schemas before reaching service logic:

1. `Content-Type` check → 415 if not `application/json`
2. Body size check → 413 if > 1 MB
3. Zod schema parse → 422 with field-level `details` array
4. Business rule checks (state machine, role constraints) → 422 or 409
5. Database operations → transaction, with 500 fallback on unexpected failure

### User Deactivation and JWT Invalidation

When an Admin deactivates a user, the `status` field is set to `INACTIVE`. The JWT middleware performs a lightweight database check of user status on every request (cached with a 60-second TTL using an in-process LRU cache) to honour the "invalidate within 60 seconds" requirement without a token blacklist.

---

## Testing Strategy

### Dual-Layer Testing Approach

This system uses both property-based tests for universal invariants and example-based unit/integration tests for specific behavior.

#### Property-Based Testing

The following properties from the Correctness Properties section are implemented as property-based tests using **fast-check** (TypeScript-compatible PBT library):

- **Property 1** — JWT validity across arbitrary valid user objects and time offsets
- **Property 2** — bcrypt round-trip for arbitrary password strings
- **Property 3** — RBAC rejection for any role/endpoint combination outside the permission matrix
- **Property 4** — Validation rejects arbitrary over-length or missing fields
- **Property 5** — Ownership isolation for any Employee/Incident pair
- **Property 6** — Internal note filtering for any comment set with mixed `is_internal` values
- **Property 7** — Comment body rejection for any whitespace-only or over-length string
- **Property 8** — Closed incident rejection for any comment attempt
- **Property 9** — AND intersection of any combination of filters
- **Property 10** — Pagination arithmetic for any T, N, P combination
- **Property 11** — Transition rejection for any (current_status, target_status) pair not in the allowed map
- **Property 12** — Audit entry created for any mutation on Incident
- **Property 13** — AI non-blocking for any simulated AI failure mode
- **Property 14** — Dashboard metric totals are internally consistent
- **Property 15** — Rate limit fires at > 60 requests within window

Each property test is tagged: `// Feature: smart-it-helpdesk, Property N: <property_text>` and runs minimum 100 iterations.

#### Unit Tests (Jest)

- Auth service: login success/failure, token generation, bcrypt comparison
- Incident service: state machine transitions (all edges), validation schema parse/reject
- AI service: timeout simulation, parse failure, truncation at exactly 150 chars
- Comment service: closed incident rejection, whitespace rejection
- Pagination helper: boundary values (page 0, page_size 100, large datasets)
- Error handler: each AppError subclass maps to correct HTTP status

#### Integration Tests (Supertest + PostgreSQL test database)

- Full incident lifecycle: create → assign → In_Progress → Resolved → Closed
- RBAC end-to-end: each role attempting permitted and forbidden operations
- AI analysis: mock LLM endpoint returning valid JSON; timeout path
- Audit trail: verify entries after each mutation operation
- Rate limiter: authenticated and unauthenticated window exhaustion
- Dashboard: verify metrics reflect actual data state after mutations

#### Frontend Tests

- **Vitest + Testing Library**: Component tests for incident form (validation, AI suggestion display, accept/override flow)
- **Snapshot tests**: Dashboard metric cards, incident list rows
- **MSW (Mock Service Worker)**: API mock layer for integration-style component tests

### Test Configuration

```typescript
// jest.config.ts (backend)
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFilesAfterFramework: ['./src/test/setup.ts'],
};
```

Property-based tests use fast-check arbitraries (generators) to produce random:
- User objects with valid/invalid role combinations
- Incident payloads with varying field lengths and enum values
- Comment bodies (whitespace, unicode, boundary lengths)
- Filter parameter combinations (all subsets of available filters)
- Pagination parameter pairs (page, page_size)
- Status transition pairs (current × target cross-product)
