# Riggs Bid Log

Internal Riggs Companies Bid Log and projected-billings application.

## Architecture

Browser
→ FastAPI application
→ Riggs Data API
→ RiggsDataHub / Microsoft Graph integration

The browser never receives SQL, Graph, Cloudflare Access, or Riggs Data API machine credentials.

## Local development

Port:

    8175

Authentication:

    AUTH_MODE=dev
    DEV_AUTH_ENTRA_OBJECT_ID=<server-side Entra Object ID>

Human authorization:

    POST /v1/access/bid-log/resolve

Session idle timeout:

    3600 seconds

## Current stage

Application shell only.

Next:

    Bid Projected Billings
