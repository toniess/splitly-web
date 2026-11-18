# Container deployment

The Dockerfile builds the Vite app and serves it using unprivileged Nginx on
port 8080. Pass `VITE_API_BASE` as a build argument; the Docker build rejects an
empty value. Runtime environment variables cannot change the API URL.

The `/healthz` endpoint is for health checks. Hashed assets are cached for a
year; `index.html` is not cached so new deployments can load the new asset URLs.

`.github/workflows/coolify.yml` tests, builds and publishes the image, then calls
the deployment webhook. Configure these repository secrets:

- `COOLIFY_REGISTRY_USER`, `COOLIFY_REGISTRY_PASSWORD`
- `COOLIFY_DEPLOY_WEBHOOK`, `COOLIFY_DEPLOY_TOKEN`

Set `COOLIFY_API_BASE` to the intended backend URL. Use workflow_dispatch while
validating migration. Enable automatic production deployment only by setting
`COOLIFY_DEPLOY_ENABLED=true` after database and DNS cutover.

The old Pages workflow remains available during migration. Disable it after
cutover; update the DNS CNAME to the VPS A record when ready. No production DNS
changes are made by this workflow.
