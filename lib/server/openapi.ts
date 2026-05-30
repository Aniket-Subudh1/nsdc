export function getOpenApiDocument() {
  return {
    openapi: "3.1.0",
    info: {
      title: "NSDC Training Management Portal API",
      version: "0.1.0",
      description: "Sprint 01 foundation, auth, scoped user management, training centers, and health endpoints.",
    },
    servers: [{ url: "/api/v1" }],
    components: {
      securitySchemes: {
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "nsdc_access_token",
        },
      },
      schemas: {
        ApiSuccess: {
          type: "object",
          properties: {
            success: { type: "boolean", const: true },
            message: { type: "string" },
            data: { type: "object" },
            meta: { type: "object" },
          },
        },
        ApiError: {
          type: "object",
          properties: {
            success: { type: "boolean", const: false },
            message: { type: "string" },
            errorCode: { type: "string" },
            errors: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  field: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    paths: {
      "/auth/login": { post: { summary: "Authenticate a user" } },
      "/auth/forgot-password/request": { post: { summary: "Send a password reset OTP to the user's email" } },
      "/auth/forgot-password/reset": { post: { summary: "Reset a password with email, portal, and OTP" } },
      "/auth/logout": { post: { summary: "Logout the current user", security: [{ cookieAuth: [] }] } },
      "/auth/me": { get: { summary: "Get the current authenticated user", security: [{ cookieAuth: [] }] } },
      "/admin/users": {
        get: { summary: "List users in the visible scope", security: [{ cookieAuth: [] }] },
        post: { summary: "Create a new internal user", security: [{ cookieAuth: [] }] },
      },
      "/admin/users/{userId}": {
        get: { summary: "Get a specific user", security: [{ cookieAuth: [] }] },
        patch: { summary: "Update a user", security: [{ cookieAuth: [] }] },
      },
      "/admin/users/{userId}/roles": {
        post: { summary: "Assign roles to a user", security: [{ cookieAuth: [] }] },
      },
      "/admin/users/{userId}/centers": {
        post: { summary: "Assign centers to a user", security: [{ cookieAuth: [] }] },
      },
      "/masters/training-centers": {
        get: { summary: "List training centers", security: [{ cookieAuth: [] }] },
        post: { summary: "Create a training center", security: [{ cookieAuth: [] }] },
      },
      "/health": { get: { summary: "Liveness probe" } },
      "/health/ready": { get: { summary: "Readiness probe" } },
      "/openapi": { get: { summary: "OpenAPI document" } },
    },
  };
}