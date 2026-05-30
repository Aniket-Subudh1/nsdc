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
      version: "0.3.0",
      description:
        "Sprint 01 foundation APIs plus Sprint 02 master-data modules for programs, sectors, schemes, courses, training-center program scoping, candidate reference data, and OpenAPI delivery.",
    },
    servers: [{ url: "/api/v1" }],
    tags: [
      { name: "Auth", description: "Authentication, session, and password reset endpoints" },
      { name: "Admin Users", description: "Scoped internal user management endpoints" },
      { name: "Masters", description: "Program, sector, scheme, course, and training-center master data endpoints" },
      { name: "Reference Data", description: "Normalized candidate dropdown and enum endpoints" },
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
            "masters:read",
            "masters:write",
            "centers:read",
            "centers:write",
            "reference-data:read",
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
        Program: {
          type: "object",
          required: ["id", "programId", "name", "code", "description", "syncToSidh", "status", "createdAt", "updatedAt"],
          properties: {
            id: { type: "string" },
            programId: { type: "string" },
            name: { type: "string" },
            code: { type: "string" },
            description: { type: "string", nullable: true },
            syncToSidh: { type: "boolean" },
            status: { type: "string", enum: ["active", "inactive"] },
            createdAt: { type: "string", nullable: true, format: "date-time" },
            updatedAt: { type: "string", nullable: true, format: "date-time" },
          },
        },
        ProgramListData: {
          type: "object",
          required: ["items", "total", "page", "pageSize"],
          properties: {
            items: { type: "array", items: ref("Program") },
            total: { type: "integer", minimum: 0 },
            page: { type: "integer", minimum: 1 },
            pageSize: { type: "integer", minimum: 1, maximum: 100 },
          },
        },
        CreateProgramRequest: {
          type: "object",
          required: ["name", "code"],
          properties: {
            name: { type: "string" },
            code: { type: "string" },
            description: { type: "string" },
            syncToSidh: { type: "boolean" },
            status: { type: "string", enum: ["active", "inactive"] },
          },
        },
        UpdateProgramRequest: {
          type: "object",
          properties: {
            name: { type: "string" },
            code: { type: "string" },
            description: { type: "string" },
            syncToSidh: { type: "boolean" },
            status: { type: "string", enum: ["active", "inactive"] },
          },
        },
        Sector: {
          type: "object",
          required: ["id", "sectorId", "name", "code", "description", "status", "createdAt", "updatedAt"],
          properties: {
            id: { type: "string" },
            sectorId: { type: "string" },
            name: { type: "string" },
            code: { type: "string" },
            description: { type: "string", nullable: true },
            status: { type: "string", enum: ["active", "inactive"] },
            createdAt: { type: "string", nullable: true, format: "date-time" },
            updatedAt: { type: "string", nullable: true, format: "date-time" },
          },
        },
        SectorListData: {
          type: "object",
          required: ["items", "total", "page", "pageSize"],
          properties: {
            items: { type: "array", items: ref("Sector") },
            total: { type: "integer", minimum: 0 },
            page: { type: "integer", minimum: 1 },
            pageSize: { type: "integer", minimum: 1, maximum: 100 },
          },
        },
        CreateSectorRequest: {
          type: "object",
          required: ["name", "code"],
          properties: {
            name: { type: "string" },
            code: { type: "string" },
            description: { type: "string" },
            status: { type: "string", enum: ["active", "inactive"] },
          },
        },
        Scheme: {
          type: "object",
          required: ["id", "schemeId", "name", "code", "description", "status", "syncEnabled", "sidhSchemeId", "fundingType", "beneficiaryType", "validFrom", "validTo", "createdAt", "updatedAt"],
          properties: {
            id: { type: "string" },
            schemeId: { type: "string" },
            name: { type: "string" },
            code: { type: "string" },
            description: { type: "string", nullable: true },
            status: { type: "string", enum: ["active", "inactive"] },
            syncEnabled: { type: "boolean" },
            sidhSchemeId: { type: "string", nullable: true },
            fundingType: { type: "string", nullable: true },
            beneficiaryType: { type: "string", nullable: true },
            validFrom: { type: "string", nullable: true, format: "date-time" },
            validTo: { type: "string", nullable: true, format: "date-time" },
            createdAt: { type: "string", nullable: true, format: "date-time" },
            updatedAt: { type: "string", nullable: true, format: "date-time" },
          },
        },
        SchemeListData: {
          type: "object",
          required: ["items", "total", "page", "pageSize"],
          properties: {
            items: { type: "array", items: ref("Scheme") },
            total: { type: "integer", minimum: 0 },
            page: { type: "integer", minimum: 1 },
            pageSize: { type: "integer", minimum: 1, maximum: 100 },
          },
        },
        CreateSchemeRequest: {
          type: "object",
          required: ["name", "code"],
          properties: {
            name: { type: "string" },
            code: { type: "string" },
            description: { type: "string" },
            status: { type: "string", enum: ["active", "inactive"] },
            syncEnabled: { type: "boolean" },
            sidhSchemeId: { type: "string" },
            fundingType: { type: "string" },
            beneficiaryType: { type: "string" },
            validFrom: { type: "string", format: "date" },
            validTo: { type: "string", format: "date" },
          },
        },
        UpdateSchemeRequest: {
          type: "object",
          properties: {
            name: { type: "string" },
            code: { type: "string" },
            description: { type: "string" },
            status: { type: "string", enum: ["active", "inactive"] },
            syncEnabled: { type: "boolean" },
            sidhSchemeId: { type: "string" },
            fundingType: { type: "string" },
            beneficiaryType: { type: "string" },
            validFrom: { type: "string", format: "date" },
            validTo: { type: "string", format: "date" },
          },
        },
        Course: {
          type: "object",
          required: ["id", "courseId", "sectorId", "programIds", "schemeIds", "courseName", "internalCourseCode", "sidhCourseId", "associatedQpOrJobRole", "nsqfLevel", "trainingHours", "gtUploadedDurationHours", "approvalStatus", "approvalDate", "validityStartDate", "validityEndDate", "minimumAge", "price", "qpCode", "jobRoleMappingType", "status", "version", "createdAt", "updatedAt"],
          properties: {
            id: { type: "string" },
            courseId: { type: "string" },
            sectorId: { type: "string" },
            programIds: { type: "array", items: { type: "string" } },
            schemeIds: { type: "array", items: { type: "string" } },
            courseName: { type: "string" },
            internalCourseCode: { type: "string" },
            sidhCourseId: { type: "string" },
            associatedQpOrJobRole: { type: "string" },
            nsqfLevel: { type: "number" },
            trainingHours: { type: "number" },
            gtUploadedDurationHours: { type: "number", nullable: true },
            approvalStatus: { type: "string", enum: ["approved", "pending", "rejected", "expired"] },
            approvalDate: { type: "string", nullable: true, format: "date-time" },
            validityStartDate: { type: "string", format: "date-time" },
            validityEndDate: { type: "string", format: "date-time" },
            minimumAge: { type: "number" },
            price: { type: "number" },
            qpCode: { type: "string" },
            jobRoleMappingType: { type: "string", enum: ["QP_NOS", "JOB_ROLE", "HYBRID"] },
            status: { type: "string", enum: ["active", "inactive"] },
            version: { type: "integer", minimum: 1 },
            createdAt: { type: "string", nullable: true, format: "date-time" },
            updatedAt: { type: "string", nullable: true, format: "date-time" },
          },
        },
        CourseListData: {
          type: "object",
          required: ["items", "total", "page", "pageSize"],
          properties: {
            items: { type: "array", items: ref("Course") },
            total: { type: "integer", minimum: 0 },
            page: { type: "integer", minimum: 1 },
            pageSize: { type: "integer", minimum: 1, maximum: 100 },
          },
        },
        CreateCourseRequest: {
          type: "object",
          required: ["sectorId", "courseName", "internalCourseCode", "sidhCourseId", "associatedQpOrJobRole", "nsqfLevel", "trainingHours", "validityStartDate", "validityEndDate", "minimumAge", "price", "qpCode", "jobRoleMappingType"],
          properties: {
            sectorId: { type: "string" },
            programIds: { type: "array", items: { type: "string" } },
            schemeIds: { type: "array", items: { type: "string" } },
            courseName: { type: "string" },
            internalCourseCode: { type: "string" },
            sidhCourseId: { type: "string" },
            associatedQpOrJobRole: { type: "string" },
            nsqfLevel: { type: "number" },
            trainingHours: { type: "number" },
            gtUploadedDurationHours: { type: "number" },
            approvalStatus: { type: "string", enum: ["approved", "pending", "rejected", "expired"] },
            approvalDate: { type: "string", format: "date" },
            validityStartDate: { type: "string", format: "date" },
            validityEndDate: { type: "string", format: "date" },
            minimumAge: { type: "number" },
            price: { type: "number" },
            qpCode: { type: "string" },
            jobRoleMappingType: { type: "string", enum: ["QP_NOS", "JOB_ROLE", "HYBRID"] },
            status: { type: "string", enum: ["active", "inactive"] },
          },
        },
        UpdateCourseRequest: {
          type: "object",
          properties: {
            sectorId: { type: "string" },
            programIds: { type: "array", items: { type: "string" } },
            schemeIds: { type: "array", items: { type: "string" } },
            courseName: { type: "string" },
            internalCourseCode: { type: "string" },
            sidhCourseId: { type: "string" },
            associatedQpOrJobRole: { type: "string" },
            nsqfLevel: { type: "number" },
            trainingHours: { type: "number" },
            gtUploadedDurationHours: { type: "number" },
            approvalStatus: { type: "string", enum: ["approved", "pending", "rejected", "expired"] },
            approvalDate: { type: "string", format: "date" },
            validityStartDate: { type: "string", format: "date" },
            validityEndDate: { type: "string", format: "date" },
            minimumAge: { type: "number" },
            price: { type: "number" },
            qpCode: { type: "string" },
            jobRoleMappingType: { type: "string", enum: ["QP_NOS", "JOB_ROLE", "HYBRID"] },
            status: { type: "string", enum: ["active", "inactive"] },
            currentVersion: { type: "integer", minimum: 1 },
          },
        },
        CourseVersion: {
          type: "object",
          required: ["courseId", "version", "changedByUserId", "changeSummary", "createdAt", "snapshot"],
          properties: {
            courseId: { type: "string" },
            version: { type: "integer", minimum: 1 },
            changedByUserId: { type: "string", nullable: true },
            changeSummary: { type: "string", nullable: true },
            createdAt: { type: "string", nullable: true, format: "date-time" },
            snapshot: { type: "object", additionalProperties: true },
          },
        },
        CandidateReferenceData: {
          type: "object",
          required: ["programs", "sectors", "schemes", "trainingCenters", "courses", "enums"],
          properties: {
            programs: { type: "array", items: ref("Program") },
            sectors: { type: "array", items: ref("Sector") },
            schemes: { type: "array", items: ref("Scheme") },
            trainingCenters: {
              type: "array",
              items: {
                type: "object",
                required: ["id", "centerId", "centerName", "centerCode"],
                properties: {
                  id: { type: "string" },
                  centerId: { type: "string" },
                  centerName: { type: "string" },
                  centerCode: { type: "string" },
                },
              },
            },
            courses: { type: "array", items: ref("Course") },
            enums: {
              type: "object",
              additionalProperties: {
                type: "array",
                items: {
                  type: "object",
                  required: ["code", "label"],
                  properties: {
                    code: { type: "string" },
                    label: { type: "string" },
                  },
                },
              },
            },
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
      "/masters/training-centers/{centerId}": {
        patch: {
          tags: ["Masters"],
          summary: "Update a training center",
          security: [{ cookieAuth: [] }],
          parameters: [{ name: "centerId", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: jsonContent(ref("CreateTrainingCenterRequest")),
          },
          responses: {
            200: successResponse("Training center updated successfully", ref("TrainingCenter")),
            400: errorResponse("Validation failed"),
            401: errorResponse("Authentication required"),
            403: errorResponse("Forbidden"),
            404: errorResponse("Training center not found"),
            409: errorResponse("Training center conflict"),
          },
        },
      },
      "/masters/programs": {
        get: {
          tags: ["Masters"],
          summary: "List programs",
          security: [{ cookieAuth: [] }],
          parameters: [{ $ref: "#/components/parameters/Page" }, { $ref: "#/components/parameters/PageSize" }],
          responses: {
            200: successResponse("Programs loaded", ref("ProgramListData")),
            401: errorResponse("Authentication required"),
            403: errorResponse("Forbidden"),
          },
        },
        post: {
          tags: ["Masters"],
          summary: "Create a program",
          security: [{ cookieAuth: [] }],
          requestBody: {
            required: true,
            content: jsonContent(ref("CreateProgramRequest")),
          },
          responses: {
            201: successResponse("Program created successfully", ref("Program")),
            400: errorResponse("Validation failed"),
            401: errorResponse("Authentication required"),
            403: errorResponse("Forbidden"),
            409: errorResponse("Program already exists"),
          },
        },
      },
      "/masters/programs/{programId}": {
        patch: {
          tags: ["Masters"],
          summary: "Update a program",
          security: [{ cookieAuth: [] }],
          parameters: [{ name: "programId", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: jsonContent(ref("UpdateProgramRequest")),
          },
          responses: {
            200: successResponse("Program updated successfully", ref("Program")),
            400: errorResponse("Validation failed"),
            401: errorResponse("Authentication required"),
            403: errorResponse("Forbidden"),
            404: errorResponse("Program not found"),
            409: errorResponse("Program already exists"),
          },
        },
      },
      "/masters/sectors": {
        get: {
          tags: ["Masters"],
          summary: "List sectors",
          security: [{ cookieAuth: [] }],
          parameters: [{ $ref: "#/components/parameters/Page" }, { $ref: "#/components/parameters/PageSize" }],
          responses: {
            200: successResponse("Sectors loaded", ref("SectorListData")),
            401: errorResponse("Authentication required"),
            403: errorResponse("Forbidden"),
          },
        },
        post: {
          tags: ["Masters"],
          summary: "Create a sector",
          security: [{ cookieAuth: [] }],
          requestBody: {
            required: true,
            content: jsonContent(ref("CreateSectorRequest")),
          },
          responses: {
            201: successResponse("Sector created successfully", ref("Sector")),
            400: errorResponse("Validation failed"),
            401: errorResponse("Authentication required"),
            403: errorResponse("Forbidden"),
            409: errorResponse("Sector already exists"),
          },
        },
      },
      "/masters/schemes": {
        get: {
          tags: ["Masters"],
          summary: "List schemes",
          security: [{ cookieAuth: [] }],
          parameters: [{ $ref: "#/components/parameters/Page" }, { $ref: "#/components/parameters/PageSize" }],
          responses: {
            200: successResponse("Schemes loaded", ref("SchemeListData")),
            401: errorResponse("Authentication required"),
            403: errorResponse("Forbidden"),
          },
        },
        post: {
          tags: ["Masters"],
          summary: "Create a scheme",
          security: [{ cookieAuth: [] }],
          requestBody: {
            required: true,
            content: jsonContent(ref("CreateSchemeRequest")),
          },
          responses: {
            201: successResponse("Scheme created successfully", ref("Scheme")),
            400: errorResponse("Validation failed"),
            401: errorResponse("Authentication required"),
            403: errorResponse("Forbidden"),
            409: errorResponse("Scheme already exists"),
          },
        },
      },
      "/masters/schemes/{schemeId}": {
        patch: {
          tags: ["Masters"],
          summary: "Update a scheme",
          security: [{ cookieAuth: [] }],
          parameters: [{ name: "schemeId", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: jsonContent(ref("UpdateSchemeRequest")),
          },
          responses: {
            200: successResponse("Scheme updated successfully", ref("Scheme")),
            400: errorResponse("Validation failed"),
            401: errorResponse("Authentication required"),
            403: errorResponse("Forbidden"),
            404: errorResponse("Scheme not found"),
          },
        },
      },
      "/masters/courses": {
        get: {
          tags: ["Masters"],
          summary: "List courses",
          security: [{ cookieAuth: [] }],
          parameters: [{ $ref: "#/components/parameters/Page" }, { $ref: "#/components/parameters/PageSize" }],
          responses: {
            200: successResponse("Courses loaded", ref("CourseListData")),
            401: errorResponse("Authentication required"),
            403: errorResponse("Forbidden"),
          },
        },
        post: {
          tags: ["Masters"],
          summary: "Create a course mapping",
          security: [{ cookieAuth: [] }],
          requestBody: {
            required: true,
            content: jsonContent(ref("CreateCourseRequest")),
          },
          responses: {
            201: successResponse("Course created successfully", ref("Course")),
            400: errorResponse("Validation failed"),
            401: errorResponse("Authentication required"),
            403: errorResponse("Forbidden"),
            409: errorResponse("Course mapping conflict"),
          },
        },
      },
      "/masters/courses/{courseId}": {
        patch: {
          tags: ["Masters"],
          summary: "Update a course mapping",
          security: [{ cookieAuth: [] }],
          parameters: [{ name: "courseId", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: jsonContent(ref("UpdateCourseRequest")),
          },
          responses: {
            200: successResponse("Course updated successfully", ref("Course")),
            400: errorResponse("Validation failed"),
            401: errorResponse("Authentication required"),
            403: errorResponse("Forbidden"),
            404: errorResponse("Course not found"),
            409: errorResponse("Course mapping conflict"),
          },
        },
      },
      "/masters/courses/{courseId}/versions": {
        get: {
          tags: ["Masters"],
          summary: "List course mapping versions",
          security: [{ cookieAuth: [] }],
          parameters: [{ name: "courseId", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            200: successResponse("Course versions loaded", { type: "array", items: ref("CourseVersion") }),
            401: errorResponse("Authentication required"),
            403: errorResponse("Forbidden"),
          },
        },
      },
      "/reference-data/candidate": {
        get: {
          tags: ["Reference Data"],
          summary: "Get candidate reference data",
          security: [{ cookieAuth: [] }],
          responses: {
            200: successResponse("Candidate reference data loaded", ref("CandidateReferenceData")),
            401: errorResponse("Authentication required"),
            403: errorResponse("Forbidden"),
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