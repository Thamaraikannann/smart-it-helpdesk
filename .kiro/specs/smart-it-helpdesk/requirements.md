# Requirements Document

## Introduction

The Smart IT Helpdesk and Incident Management System is a full-stack web application designed for small and medium-sized organizations. It enables employees to report IT issues, track their resolution status, and communicate with support staff. Support agents and administrators manage the incident lifecycle — triaging, assigning, resolving, and analyzing trends. An AI-assisted analysis layer enriches incoming incidents by suggesting a category, priority, and short summary based on the incident description, reducing manual triage effort.

The system is structured with a clear separation between frontend (web UI), backend (REST API), database (persistent storage), and AI/integration services (LLM-based analysis).

### Assumptions

- Authentication is handled via the application's own user accounts (username + password). External SSO/OAuth is out of scope for this version.
- File attachments are stored as metadata references (filename, size, MIME type) only. Actual binary file upload/storage is out of scope for this version and can be added in a future iteration.
- The AI analysis service calls an external LLM API (e.g., OpenAI). The application treats analysis as best-effort; incidents can be submitted even when the AI service is unavailable.
- Email notifications are out of scope for this version; status visibility is provided through the UI.
- "Small and medium-sized organizations" implies a user base of up to ~500 concurrent users. Performance targets are set accordingly.

---

## Glossary

- **Incident**: An IT support ticket created by an Employee describing an issue or request.
- **Employee**: A regular user who can create incidents and view their own submissions.
- **Support_Agent**: A user with elevated permissions who can manage incidents assigned to them.
- **Admin**: A user with full system permissions, including user management and all incident operations.
- **System**: The Smart IT Helpdesk and Incident Management System backend API and its coordinated services.
- **UI**: The web-based frontend application served to users.
- **AI_Service**: The external AI/LLM integration layer responsible for analyzing incident descriptions.
- **Incident_Status**: The lifecycle state of an incident. Valid values: `Open`, `In Progress`, `On Hold`, `Resolved`, `Closed`.
- **Incident_Priority**: The urgency level of an incident. Valid values: `Low`, `Medium`, `High`, `Critical`.
- **Incident_Category**: The classification of the type of issue. Valid values: `Hardware`, `Software`, `Network`, `Access & Permissions`, `Email & Communication`, `Other`.
- **Internal_Note**: A comment on an incident visible only to Support_Agents and Admins, not to Employees.
- **Resolution_Detail**: A structured field on an incident recording how and when the issue was resolved.
- **Dashboard**: A summary view displaying aggregate incident metrics.
- **JWT**: JSON Web Token used for stateless authentication.
- **API**: The backend REST API exposing all system functionality.

---

## Requirements

### Requirement 1: User Authentication and Authorization

**User Story:** As a user, I want to log in with my credentials, so that I can access the system securely based on my role.

#### Acceptance Criteria

1. WHEN a user submits valid credentials (email and password), THE System SHALL authenticate the user and return a signed JWT with a 24-hour expiry.
2. WHEN a user submits invalid credentials, THE System SHALL return an HTTP 401 response with a descriptive error message and SHALL NOT return any token.
3. WHEN a request is received without a valid JWT in the Authorization header, THE System SHALL return an HTTP 401 response.
4. WHEN a JWT has expired, THE System SHALL return an HTTP 401 response instructing the client to re-authenticate.
5. THE System SHALL enforce role-based access control, granting permissions to `Employee`, `Support_Agent`, and `Admin` roles as defined in the permissions matrix.
6. WHEN an authenticated user attempts an action outside their role's permissions, THE System SHALL return an HTTP 403 response.
7. THE System SHALL store passwords as bcrypt hashes with a minimum cost factor of 12 and SHALL NOT store plaintext passwords.
8. WHEN an Admin creates a new user account, THE System SHALL assign the user a role of `Employee`, `Support_Agent`, or `Admin`.

---

### Requirement 2: Incident Creation by Employee

**User Story:** As an Employee, I want to create an IT support incident, so that the support team is notified of my issue and can work on resolving it.

#### Acceptance Criteria

1. WHEN an authenticated Employee submits a new incident, THE System SHALL create the incident record with fields: `title`, `description`, `category`, `priority`, and optional `attachment_info`.
2. THE System SHALL assign each new incident a unique identifier, a creation timestamp, an `Incident_Status` of `Open`, and associate it with the submitting Employee's user ID.
3. WHEN an incident is created with a missing `title` or `description`, THE System SHALL return an HTTP 422 response listing all missing required fields and SHALL NOT create the incident.
4. WHEN an incident `title` exceeds 200 characters, THE System SHALL return an HTTP 422 response.
5. WHEN an incident `description` exceeds 5000 characters, THE System SHALL return an HTTP 422 response.
6. WHEN an incident is submitted with a `category` value not in the defined `Incident_Category` enumeration, THE System SHALL return an HTTP 422 response.
7. WHEN an incident is submitted with a `priority` value not in the defined `Incident_Priority` enumeration, THE System SHALL return an HTTP 422 response.
8. WHERE attachment information is provided, THE System SHALL validate that `attachment_info` contains a filename (≤255 characters), file size (≤10 MB expressed as an integer in bytes), and a MIME type from the allowed list: `image/png`, `image/jpeg`, `application/pdf`, `text/plain`.
9. WHEN an incident is successfully created, THE System SHALL return an HTTP 201 response containing the full incident record including its assigned unique identifier.

---

### Requirement 3: AI-Assisted Incident Analysis

**User Story:** As an Employee, I want the system to automatically suggest a category, priority, and summary for my incident, so that I can confirm or adjust them before submitting.

#### Acceptance Criteria

1. WHEN a new incident description is received, THE System SHALL invoke the AI_Service to analyze the description and return a suggested `category`, `priority`, and a `summary`. WHEN the AI_Service returns a summary exceeding 150 characters, THE System SHALL truncate the summary to 150 characters before including it in the response.
2. WHEN the AI_Service returns analysis results, THE System SHALL include the `ai_suggestions` object (containing `category`, `priority`, and `summary`) in the incident creation response.
3. IF the AI_Service is unavailable or returns an error, THEN THE System SHALL proceed with incident creation using the Employee-supplied values and SHALL set `ai_suggestions` to `null` in the response.
4. IF the AI_Service does not respond within 5 seconds, THEN THE System SHALL treat the call as failed and proceed as per criterion 3.
5. THE System SHALL NOT block incident creation on the availability or result of the AI_Service.
6. THE UI SHALL display AI-suggested category, priority, and summary to the Employee before final submission, and SHALL allow the Employee to accept or override each suggestion individually.

---

### Requirement 4: Employee Incident Tracking

**User Story:** As an Employee, I want to view and track my submitted incidents, so that I know the current status and history of my issues.

#### Acceptance Criteria

1. WHEN an authenticated Employee requests their incident list, THE System SHALL return only the incidents submitted by that Employee.
2. THE System SHALL return incident list results in descending order of creation timestamp by default.
3. WHEN an Employee requests a specific incident by ID, THE System SHALL return the full incident record if and only if that incident was submitted by the requesting Employee.
4. IF an Employee requests an incident that does not belong to them, THEN THE System SHALL return an HTTP 404 response and SHALL NOT reveal that the incident exists.
5. THE System SHALL include the current `Incident_Status` and all Employee-visible comments in the incident detail response. WHEN a `Resolution_Detail` exists for the incident, THE System SHALL include it in the response. WHEN no `Resolution_Detail` exists, THE System SHALL omit the resolution detail field entirely from the response.
6. THE System SHALL NOT include `Internal_Note` entries in any response returned to an Employee.

---

### Requirement 5: Incident Commenting

**User Story:** As a user, I want to add comments to an incident, so that I can communicate updates and questions in context.

#### Acceptance Criteria

1. WHEN an authenticated Employee submits a comment on their own incident, THE System SHALL create a comment record associated with that incident, the commenter's user ID, and a creation timestamp.
2. WHEN an authenticated Support_Agent or Admin submits a comment marked as an `Internal_Note`, THE System SHALL store it with an `is_internal` flag set to `true`.
3. WHEN an authenticated Support_Agent or Admin submits a comment not marked as an `Internal_Note`, THE System SHALL store it with `is_internal` set to `false`, and THE System SHALL include it in the Employee's incident view.
4. WHEN a comment body exceeds 2000 characters, THE System SHALL return an HTTP 422 response.
5. WHEN a comment body is empty or contains only whitespace, THE System SHALL return an HTTP 422 response.
6. IF a user attempts to add a comment to an incident with `Incident_Status` of `Closed`, THEN THE System SHALL return an HTTP 409 response.

---

### Requirement 6: Employee Incident Search and Filter

**User Story:** As an Employee, I want to search and filter my submitted incidents, so that I can quickly find a specific incident.

#### Acceptance Criteria

1. WHEN an Employee provides a `search` query parameter, THE System SHALL return incidents belonging to that Employee whose `title` or `description` contains the search string (case-insensitive).
2. WHEN an Employee provides a `status` filter parameter, THE System SHALL return only that Employee's incidents matching the specified `Incident_Status` value.
3. WHEN an Employee provides a `category` filter parameter, THE System SHALL return only that Employee's incidents matching the specified `Incident_Category` value.
4. WHEN an Employee provides a `priority` filter parameter, THE System SHALL return only that Employee's incidents matching the specified `Incident_Priority` value.
5. WHEN multiple filter parameters are provided simultaneously, THE System SHALL apply all filters as a logical AND intersection.
6. WHEN a filter parameter contains a value not in the corresponding enumeration, THE System SHALL return an HTTP 422 response.
7. THE System SHALL support pagination via `page` and `page_size` query parameters. THE System SHALL cap `page_size` at 100 items per page. WHEN a `page_size` value of zero or less is provided, THE System SHALL return an HTTP 422 response.

---

### Requirement 7: Support Agent and Admin Incident Management

**User Story:** As a Support_Agent or Admin, I want to view and manage all incidents, so that I can triage, assign, and resolve issues efficiently.

#### Acceptance Criteria

1. WHEN an authenticated Support_Agent or Admin requests the incident list, THE System SHALL return all incidents across all Employees.
2. WHEN a Support_Agent or Admin assigns an incident to a Support_Agent, THE System SHALL update the `assigned_to` field with the target agent's user ID and record the assignment timestamp.
3. WHEN a Support_Agent or Admin attempts to assign an incident to a user who does not hold the `Support_Agent` or `Admin` role, THE System SHALL return an HTTP 422 response.
4. WHEN a Support_Agent or Admin updates `Incident_Status`, THE System SHALL validate the transition against the allowed state machine: `Open` → `In Progress` | `On Hold`; `In Progress` → `On Hold` | `Resolved`; `On Hold` → `In Progress`; `Resolved` → `Closed`. IF the requested transition is not allowed, THEN THE System SHALL return an HTTP 422 response with the current status and allowed next states.
5. WHEN a Support_Agent or Admin updates `Incident_Priority`, THE System SHALL accept any valid `Incident_Priority` value and update the record.
6. WHEN a Support_Agent or Admin submits a `Resolution_Detail` (root_cause, resolution_steps, resolved_at timestamp), THE System SHALL store it and automatically transition `Incident_Status` to `Resolved` if the current status is `In Progress`.
7. THE System SHALL record a timestamped audit entry for every status change, priority change, and assignment change, capturing the actor's user ID, the field changed, the previous value, and the new value.

---

### Requirement 8: Support Agent and Admin Incident Search, Filter, and Sort

**User Story:** As a Support_Agent or Admin, I want to search, filter, and sort all incidents, so that I can manage my workload effectively.

#### Acceptance Criteria

1. WHEN a Support_Agent or Admin provides a `search` query parameter, THE System SHALL return incidents whose `title` or `description` contains the search string (case-insensitive) across all Employees. WHEN filter parameters are also provided in the same request, THE System SHALL apply the search condition as a logical AND with all filter conditions.
2. THE System SHALL support filtering by `status`, `category`, `priority`, `assigned_to` (agent user ID), and `submitter_id` (employee user ID).
3. WHEN multiple filter parameters are provided simultaneously, THE System SHALL apply all filters as a logical AND intersection.
4. THE System SHALL support sorting by `created_at`, `updated_at`, and `priority` via a `sort_by` parameter and a `sort_order` parameter accepting `asc` or `desc`.
5. WHEN an invalid `sort_by` field is provided, THE System SHALL return an HTTP 422 response listing valid sort fields.
6. THE System SHALL support pagination via `page` and `page_size` query parameters. THE System SHALL cap `page_size` at 100 items per page. WHEN a `page_size` value of zero or less is provided, THE System SHALL return an HTTP 422 response.

---

### Requirement 9: Admin Dashboard

**User Story:** As an Admin, I want to view a dashboard of incident metrics, so that I can understand the current health of the support queue.

#### Acceptance Criteria

1. WHEN an authenticated Admin requests the dashboard, THE System SHALL return aggregate counts of incidents grouped by `Incident_Status`.
2. WHEN an authenticated Admin requests the dashboard, THE System SHALL return aggregate counts of incidents grouped by `Incident_Priority`.
3. WHEN an authenticated Admin requests the dashboard, THE System SHALL return aggregate counts of incidents grouped by `Incident_Category`.
4. WHEN an authenticated Admin requests the dashboard, THE System SHALL return the count of unassigned open incidents (status `Open` with no `assigned_to` value).
5. WHEN an authenticated Admin requests the dashboard, THE System SHALL return the average time in seconds between incident creation and first status transition to `In Progress`, computed over all incidents created in the past 30 days that have transitioned to `In Progress`. Incidents that remain in `Open` status SHALL be excluded from this calculation.
6. THE System SHALL compute all dashboard metrics at query time from the current incident data.

---

### Requirement 10: User Management by Admin

**User Story:** As an Admin, I want to manage user accounts, so that I can control who has access to the system and with what permissions.

#### Acceptance Criteria

1. WHEN an Admin creates a user, THE System SHALL require a unique email address, a display name, and a role (`Employee`, `Support_Agent`, or `Admin`).
2. WHEN an Admin attempts to create a user with an email address already registered, THE System SHALL return an HTTP 409 response.
3. WHEN an Admin deactivates a user account, THE System SHALL set the account status to `inactive` and THE System SHALL invalidate any active JWT issued to that user within 60 seconds.
4. WHEN an inactive user attempts to authenticate, THE System SHALL return an HTTP 401 response.
5. THE System SHALL return a paginated list of all users when requested by an Admin, including each user's ID, display name, email, role, and account status.
6. WHEN an Admin updates a user's role, THE System SHALL apply the new role on the user's next JWT issuance (re-authentication). THE existing active JWT SHALL retain the previous role until it expires or the user re-authenticates.

---

### Requirement 11: Data Integrity and Audit

**User Story:** As an Admin, I want the system to maintain a complete audit trail, so that I can review all changes made to incidents for accountability and compliance.

#### Acceptance Criteria

1. THE System SHALL create an immutable audit log entry for every create, update, and delete operation on an Incident record.
2. THE System SHALL capture in each audit log entry: the incident ID, the actor's user ID, the operation type, the timestamp, and a before/after snapshot of changed fields.
3. THE System SHALL retain audit log entries for a minimum of 90 days.
4. WHEN an Admin requests the audit log for a specific incident, THE System SHALL return all entries for that incident in ascending timestamp order. IF the System fails to retrieve the audit entries, THEN THE System SHALL return an HTTP 500 response with an explicit error message indicating retrieval failure.
5. THE System SHALL NOT allow any user role, including Admin, to modify or delete audit log entries.

---

### Requirement 12: Non-Functional Requirements

**User Story:** As a system stakeholder, I want the application to meet performance, reliability, and security standards, so that it is dependable for everyday organizational use.

#### Acceptance Criteria

1. WHEN any API endpoint receives a valid request under normal load (up to 100 concurrent users), THE System SHALL respond within 500 milliseconds at the 95th percentile.
2. THE System SHALL be available for at least 99% of the time, measured monthly, excluding scheduled maintenance windows announced at least 24 hours in advance.
3. THE System SHALL sanitize all user-supplied string inputs to prevent stored cross-site scripting (XSS) attacks before persisting them to the database.
4. THE System SHALL enforce HTTPS for all client-server communication and SHALL reject plain HTTP connections.
5. THE System SHALL apply rate limiting of no more than 60 authenticated API requests per user per minute. WHEN the rate limit flag for a user is set, THE System SHALL return an HTTP 429 response.
6. THE System SHALL apply rate limiting of no more than 10 unauthenticated login attempts per IP address per minute. WHEN the rate limit flag for that IP address is set, THE System SHALL return an HTTP 429 response.
7. THE System SHALL validate and reject request bodies exceeding 1 MB in size with an HTTP 413 response.
8. THE System SHALL store all data in a persistent relational database with transaction support.
9. THE System SHALL use parameterized queries or an ORM with parameterized bindings for all database interactions to prevent SQL injection.
10. WHILE the system is running, THE System SHALL log all HTTP requests at INFO level, capturing method, path, status code, and response time, without logging JWT values or password fields.

---

### Requirement 13: API Design Standards

**User Story:** As a developer, I want the API to follow consistent REST conventions, so that it is predictable and easy to integrate with.

#### Acceptance Criteria

1. THE System SHALL expose all resources using RESTful URL patterns (e.g., `/api/v1/incidents`, `/api/v1/incidents/{id}/comments`).
2. THE System SHALL return all responses in JSON format with a `Content-Type: application/json` header.
3. WHEN the System returns a list resource, THE System SHALL include a `pagination` object with `total_count`, `page`, `page_size`, and `total_pages` fields.
4. WHEN the System encounters an error, THE System SHALL return a JSON error body containing a machine-readable `error_code`, a human-readable `message`, and an optional `details` array for field-level validation errors.
5. THE System SHALL version the API at the URL path level using `/api/v1/` as the base path for this version.
6. THE System SHALL accept `application/json` as the request `Content-Type` for all POST and PATCH endpoints.
