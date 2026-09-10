---
name: OpenAPI date boundary
description: Date-only fields need an explicit database/API conversion boundary in this workspace.
---

Date-only values are stored as PostgreSQL date strings (`YYYY-MM-DD`) for calendar correctness, while the generated OpenAPI Zod schemas coerce `format: date` values to JavaScript `Date` objects at the API boundary.

**Why:** Treating a date-only value as an instant can shift the requested ride day across timezones, and generated response validation expects the coerced representation.

**How to apply:** Keep storage and matching comparisons in `YYYY-MM-DD`; normalize incoming API dates before persistence and return UTC-midnight `Date` objects from server response mappers.