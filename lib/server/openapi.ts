const jsonContent = (schema: Record<string, unknown>) => ({
  "application/json": {
    schema,
  },
});

const successSchema = (dataSchema: Record<string, unknown>, metaSchema?: Record<string, unknown>) => ({
  type: "object",
  required: ["success", "message", "data"],
  properties: {
    success: { type: "boolean", enum: [true] },
    message: { type: "string" },
    data: dataSchema,
    meta: metaSchema ?? { type: "object", nullable: true },
  },
});

const successResponse = (description: string, dataSchema: Record<string, unknown>, metaSchema?: Record<string, unknown>) => ({
  description,
  content: jsonContent(successSchema(dataSchema, metaSchema)),
});

const errorResponse = (description: string) => ({
  description,
  content: jsonContent({ $ref: "#/components/schemas/ApiError" }),
});

const ref = (name: string) => ({
  $ref: `#/components/schemas/${name}`,
});

export function getOpenApiDocument() {
  return {
    openapi: "3.0.3",
    info: {
      title: "NSDC Training Management Portal API",
      version: "0.2.0",
      description:
        "Sprint 01 foundation APIs with authentication, forgot-password OTP flow, scoped user management, training center management, health checks, and OpenAPI delivery.",
    },
    servers: [{ url: "/api/v1" }],
    tags: [
      { name: "Auth", description: "Authentication, session, and password reset endpoints" },
      { name: "Admin Users", description: "Scoped internal user management endpoints" },
      { name: "Masters", description: "Training center master data endpoints" },
      { name: "Health", description: "Service liveness and readiness checks" },
      { name: "Docs", description: "OpenAPI and API documentation endpoints" },
    ],
    components: {
      securitySchemes: {
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "nsdc_access_token",
          description: "HttpOnly session cookie issued after successful login",
        },
      },
      parameters: {
        UserId: {
          name: "userId",
          in: "path",
          required: true,
          schema: { type: "string" },
          description: "Internal NSDC user identifier",
          example: "usr_0a1b2c3d4e5f6g7h",
        },
        Page: {
          name: "page",
          in: "query",
          required: false,
          schema: { type: "integer", minimum: 1, default: 1 },
          description: "1-based page number",
        },
        PageSize: {
          name: "pageSize",
          in: "query",
          required: false,
          schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
          description: "Number of rows per page",
        },
      },
      schemas: {
        ApiErrorDetail: {
          type: "object",
          required: ["message"],
          properties: {
            field: { type: "string", nullable: true },
            message: { type: "string" },
          },
        },
        ApiError: {
          type: "object",
          required: ["success", "message", "errorCode", "errors"],
          properties: {
            success: { type: "boolean", enum: [false] },
            message: { type: "string" },
            errorCode: { type: "string" },
            errors: {
              type: "array",
              items: ref("ApiErrorDetail"),
            },
          },
        },
        AuthPortal: {
          type: "string",
          enum: ["admin", "training_partner"],
        },
        RoleKey: {
          type: "string",
          enum: [
            "platform_admin",
            "training_partner_admin",
            "center_manager",
            "trainer_data_entry",
            "auditor_viewer",
          ],
        },
        PermissionKey: {
          type: "string",
          enum: [
            "auth:login",
            "auth:logout",
            "auth:me",
            "users:read",
            "users:write",
            "users:assign_roles",
            "users:assign_centers",
            "centers:read",
            "centers:write",
            "audit:read",
          ],
        },
        User: {
          type: "object",
          required: [
            "id",
            "name",
            "email",
            "mobileNumber",
            "roles",
            "role",
            "centerIds",
            "status",
            "mustChangePassword",
            "lastLoginAt",
          ],
          properties: {
            id: { type: "string", example: "usr_0a1b2c3d4e5f6g7h" },
            name: { type: "string", example: "Platform Admin" },
            email: { type: "string", format: "email", example: "admin@example.com" },
            mobileNumber: { type: "string", nullable: true, example: "9876543210" },
            roles: { type: "array", items: ref("RoleKey") },
            role: ref("RoleKey"),
            centerIds: { type: "array", items: { type: "string" } },
            status: { type: "string", enum: ["active", "inactive"] },
            mustChangePassword: { type: "boolean" },
            lastLoginAt: { type: "string", nullable: true, format: "date-time" },
          },
        },
        LoginRequest: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: { type: "string", format: "email" },
            password: { type: "string", format: "password", minLength: 8 },
            portal: ref("AuthPortal"),
          },
        },
        LoginResponseData: {
          type: "object",
          required: ["user", "accessToken", "permissions", "redirectPath"],
          properties: {
            user: ref("User"),
            accessToken: { type: "string" },
            permissions: { type: "array", items: ref("PermissionKey") },
            redirectPath: { type: "string", example: "/admin/dashboard" },
          },
        },
        AuthMeData: {
          type: "object",
          required: ["user", "permissions"],
          properties: {
            user: ref("User"),
            permissions: { type: "array", items: ref("PermissionKey") },
          },
        },
        ForgotPasswordRequest: {
          type: "object",
          required: ["email", "portal"],
          properties: {
            email: { type: "string", format: "email" },
            portal: ref("AuthPortal"),
          },
        },
        ForgotPasswordResetRequest: {
          type: "object",
          required: ["email", "portal", "otp", "newPassword"],
          properties: {
            email: { type: "string", format: "email" },
            portal: ref("AuthPortal"),
            otp: { type: "string", pattern: "^[0-9]{6}$", example: "123456" },
            newPassword: { type: "string", format: "password", minLength: 8 },
          },
        },
        MessageData: {
          type: "object",
          required: ["message"],
          properties: {
            message: { type: "string" },
          },
        },
        PasswordResetResponseData: {
          type: "object",
          required: ["message", "redirectPath"],
          properties: {
            message: { type: "string" },
            redirectPath: { type: "string", example: "/admin/login" },
          },
        },
        PaginationMeta: {
          type: "object",
          required: ["page", "pageSize", "total"],
          properties: {
            page: { type: "integer", minimum: 1 },
            pageSize: { type: "integer", minimum: 1, maximum: 100 },
            total: { type: "integer", minimum: 0 },
          },
        },
        CreateUserRequest: {
          type: "object",
          required: ["name", "email", "temporaryPassword"],
          properties: {
            name: { type: "string", minLength: 2, maxLength: 120 },
            email: { type: "string", format: "email" },
            mobileNumber: { type: "string", pattern: "^[0-9]{10}$" },
            role: ref("RoleKey"),
            roles: { type: "array", items: ref("RoleKey") },
            centerIds: { type: "array", items: { type: "string" } },
            temporaryPassword: { type: "string", format: "password", minLength: 8 },
          },
        },
        UpdateUserRequest: {
          type: "object",
          properties: {
            name: { type: "string", minLength: 2, maxLength: 120 },
            email: { type: "string", format: "email" },
            mobileNumber: { type: "string", pattern: "^[0-9]{10}$" },
            status: { type: "string", enum: ["active", "inactive"] },
            mustChangePassword: { type: "boolean" },
          },
        },
        AssignRolesRequest: {
          type: "object",
          required: ["roles"],
          properties: {
            roles: { type: "array", minItems: 1, items: ref("RoleKey") },
          },
        },
        AssignCentersRequest: {
          type: "object",
          required: ["centerIds"],
          properties: {
            centerIds: { type: "array", items: { type: "string" } },
          },
        },
        UserListData: {
          type: "object",
          required: ["items", "total", "page", "pageSize"],
          properties: {
            items: { type: "array", items: ref("User") },
            total: { type: "integer", minimum: 0 },
            page: { type: "integer", minimum: 1 },
            pageSize: { type: "integer", minimum: 1, maximum: 100 },
          },
        },
        TrainingCenter: {
          type: "object",
          required: [
            "id",
            "centerId",
            "centerName",
            "centerCode",
            "sidhTcId",
            "district",
            "state",
            "programIds",
            "status",
            "createdAt",
            "updatedAt",
          ],
          properties: {
            id: { type: "string", example: "tc_0a1b2c3d4e5f6g7h" },
            centerId: { type: "string" },
            centerName: { type: "string", example: "Gram Tarang Skill Training Center Jharsuguda" },
            centerCode: { type: "string", example: "GTET-JSG-001" },
            sidhTcId: { type: "string", nullable: true, example: "TC164648" },
            district: { type: "string", example: "Jharsuguda" },
            state: { type: "string", example: "Odisha" },
            programIds: { type: "array", items: { type: "string" } },
            status: { type: "string", enum: ["active", "inactive"] },
            createdAt: { type: "string", nullable: true, format: "date-time" },
            updatedAt: { type: "string", nullable: true, format: "date-time" },
          },
        },
        CreateTrainingCenterRequest: {
          type: "object",
          required: ["centerName", "centerCode", "district", "state"],
          properties: {
            centerName: { type: "string", minLength: 3, maxLength: 160 },
            centerCode: { type: "string", minLength: 3, maxLength: 60 },
            sidhTcId: { type: "string" },
            district: { type: "string", minLength: 2, maxLength: 120 },
            state: { type: "string", minLength: 2, maxLength: 120 },
            programIds: { type: "array", items: { type: "string" } },
            status: { type: "string", enum: ["active", "inactive"] },
          },
        },
        TrainingCenterListData: {
          type: "object",
          required: ["items", "total", "page", "pageSize"],
          properties: {
            items: { type: "array", items: ref("TrainingCenter") },
            total: { type: "integer", minimum: 0 },
            page: { type: "integer", minimum: 1 },
            pageSize: { type: "integer", minimum: 1, maximum: 100 },
          },
        },
        HealthData: {
          type: "object",
          required: ["status", "appEnv", "nodeEnv", "sidhEnv", "sidhBaseUrl", "timestamp"],
          properties: {
            status: { type: "string", example: "ok" },
            appEnv: { type: "string" },
            nodeEnv: { type: "string" },
            sidhEnv: { type: "string", enum: ["uat", "production"] },
            sidhBaseUrl: { type: "string", format: "uri" },
            timestamp: { type: "string", format: "date-time" },
          },
        },
        ReadinessData: {
          type: "object",
          required: ["status", "databaseState"],
          properties: {
            status: { type: "string", example: "ready" },
            databaseState: { type: "integer", example: 1 },
          },
        },
        OpenApiDocument: {
          type: "object",
          description: "Self-describing OpenAPI document returned by this endpoint",
          additionalProperties: true,
        },
      },
    },
    paths: {
      "/auth/login": {
        post: {
          tags: ["Auth"],
          summary: "Authenticate a user",
          requestBody: {
            required: true,
            content: jsonContent(ref("LoginRequest")),
          },
          responses: {
            200: successResponse("Login successful", ref("LoginResponseData")),
            400: errorResponse("Validation failed"),
            401: errorResponse("Invalid credentials"),
            403: errorResponse("Portal access denied or user inactive"),
            500: errorResponse("Unexpected server error"),
          },
        },
      },
      "/auth/forgot-password/request": {
        post: {
          tags: ["Auth"],
          summary: "Send a password reset OTP",
          requestBody: {
            required: true,
            content: jsonContent(ref("ForgotPasswordRequest")),
          },
          responses: {
            200: successResponse("OTP request accepted", ref("MessageData")),
            400: errorResponse("Validation failed"),
            500: errorResponse("SMTP not configured or email delivery failed"),
          },
        },
      },
      "/auth/forgot-password/reset": {
        post: {
          tags: ["Auth"],
          summary: "Reset a password using email, portal, and OTP",
          requestBody: {
            required: true,
            content: jsonContent(ref("ForgotPasswordResetRequest")),
          },
          responses: {
            200: successResponse("Password reset completed", ref("PasswordResetResponseData")),
            400: errorResponse("Validation failed or OTP is invalid/expired"),
            500: errorResponse("Unexpected server error"),
          },
        },
      },
      "/auth/logout": {
        post: {
          tags: ["Auth"],
          summary: "Logout the current user",
          security: [{ cookieAuth: [] }],
          responses: {
            200: successResponse("Logout successful", { type: "object", additionalProperties: false }),
            401: errorResponse("Authentication required"),
          },
        },
      },
      "/auth/me": {
        get: {
          tags: ["Auth"],
          summary: "Get the current authenticated user",
          security: [{ cookieAuth: [] }],
          responses: {
            200: successResponse("Authenticated user loaded", ref("AuthMeData")),
            401: errorResponse("Authentication required"),
          },
        },
      },
      "/admin/users": {
        get: {
          tags: ["Admin Users"],
          summary: "List users in the caller's visible scope",
          security: [{ cookieAuth: [] }],
          parameters: [{ $ref: "#/components/parameters/Page" }, { $ref: "#/components/parameters/PageSize" }],
          responses: {
            200: successResponse("Users loaded", ref("UserListData")),
            401: errorResponse("Authentication required"),
            403: errorResponse("Forbidden"),
          },
        },
        post: {
          tags: ["Admin Users"],
          summary: "Create a new internal user",
          security: [{ cookieAuth: [] }],
          requestBody: {
            required: true,
            content: jsonContent(ref("CreateUserRequest")),
          },
          responses: {
            201: successResponse("User created successfully", ref("User")),
            400: errorResponse("Validation failed"),
            401: errorResponse("Authentication required"),
            403: errorResponse("Forbidden"),
            409: errorResponse("User already exists or invalid scope assignment"),
          },
        },
      },
      "/admin/users/{userId}": {
        get: {
          tags: ["Admin Users"],
          summary: "Get a specific user",
          security: [{ cookieAuth: [] }],
          parameters: [{ $ref: "#/components/parameters/UserId" }],
          responses: {
            200: successResponse("User loaded", ref("User")),
            401: errorResponse("Authentication required"),
            403: errorResponse("Forbidden"),
            404: errorResponse("User not found"),
          },
        },
        patch: {
          tags: ["Admin Users"],
          summary: "Update a specific user",
          security: [{ cookieAuth: [] }],
          parameters: [{ $ref: "#/components/parameters/UserId" }],
          requestBody: {
            required: true,
            content: jsonContent(ref("UpdateUserRequest")),
          },
          responses: {
            200: successResponse("User updated successfully", ref("User")),
            400: errorResponse("Validation failed"),
            401: errorResponse("Authentication required"),
            403: errorResponse("Forbidden"),
            404: errorResponse("User not found"),
            409: errorResponse("User already exists"),
          },
        },
      },
      "/admin/users/{userId}/roles": {
        post: {
          tags: ["Admin Users"],
          summary: "Assign roles to a user",
          security: [{ cookieAuth: [] }],
          parameters: [{ $ref: "#/components/parameters/UserId" }],
          requestBody: {
            required: true,
            content: jsonContent(ref("AssignRolesRequest")),
          },
          responses: {
            200: successResponse("User roles assigned successfully", ref("User")),
            400: errorResponse("Validation failed"),
            401: errorResponse("Authentication required"),
            403: errorResponse("Forbidden"),
            404: errorResponse("User not found"),
          },
        },
      },
      "/admin/users/{userId}/centers": {
        post: {
          tags: ["Admin Users"],
          summary: "Assign training centers to a user",
          security: [{ cookieAuth: [] }],
          parameters: [{ $ref: "#/components/parameters/UserId" }],
          requestBody: {
            required: true,
            content: jsonContent(ref("AssignCentersRequest")),
          },
          responses: {
            200: successResponse("User centers assigned successfully", ref("User")),
            400: errorResponse("Validation failed or center not found"),
            401: errorResponse("Authentication required"),
            403: errorResponse("Forbidden"),
            404: errorResponse("User not found"),
          },
        },
      },
      "/masters/training-centers": {
        get: {
          tags: ["Masters"],
          summary: "List training centers in visible scope",
          security: [{ cookieAuth: [] }],
          parameters: [{ $ref: "#/components/parameters/Page" }, { $ref: "#/components/parameters/PageSize" }],
          responses: {
            200: successResponse("Training centers loaded", ref("TrainingCenterListData")),
            401: errorResponse("Authentication required"),
            403: errorResponse("Forbidden"),
          },
        },
        post: {
          tags: ["Masters"],
          summary: "Create a training center",
          security: [{ cookieAuth: [] }],
          requestBody: {
            required: true,
            content: jsonContent(ref("CreateTrainingCenterRequest")),
          },
          responses: {
            201: successResponse("Training center created successfully", ref("TrainingCenter")),
            400: errorResponse("Validation failed"),
            401: errorResponse("Authentication required"),
            403: errorResponse("Forbidden"),
            409: errorResponse("Training center already exists"),
          },
        },
      },
      "/health": {
        get: {
          tags: ["Health"],
          summary: "Liveness probe",
          responses: {
            200: successResponse("Service is healthy", ref("HealthData")),
          },
        },
      },
      "/health/ready": {
        get: {
          tags: ["Health"],
          summary: "Readiness probe",
          responses: {
            200: successResponse("Service readiness checked", ref("ReadinessData")),
            500: errorResponse("Unexpected server error"),
          },
        },
      },
      "/openapi": {
        get: {
          tags: ["Docs"],
          summary: "Return the machine-readable OpenAPI document",
          responses: {
            200: {
              description: "OpenAPI document",
              content: jsonContent(ref("OpenApiDocument")),
            },
          },
        },
      },
    },
  };
}