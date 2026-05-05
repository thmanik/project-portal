# Project Management Portal — Updated Implementation Note

This frontend codebase now represents a workflow-driven project management portal, not a simple tracker.

## Key implemented frontend behaviors
- CCR creates Bid / Project shells
- client selection auto-fills registered email
- initial documents are collected during project/bid creation
- credentials are simulated as prepared at project creation
- work requests must always be created under an existing Bid or active Project
- work requests route through division queue -> leader -> member -> TMS -> origin division -> CCR -> HML document list
- routing history keeps transfer records with from/to context
- document registry reflects final listed documents
- sidebar and pages are actor-aware

## Still simulated because this is frontend-only
- actual email sending
- real authentication and password delivery
- persistent backend/database
- Microsoft 365 / Graph upload session integration
- server-side permission enforcement

## Current actor model
- System Admin
- Prime Consultant
- CCR Coordinator
- ECM / PMO Lead
- ECM / PMO Member
- TMS Manager
- TMS Drawing / Checking / Approval
- Client / Owner

## Work Request creation rule
A work request cannot be created in isolation. It must be attached to:
- a Bid (default)
- or an active Project
