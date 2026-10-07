import type { Express } from "express";
export declare function isAdminApiKeyConfigured(): boolean;
export declare function isAllowedAdminApiKey(suppliedKey: string | undefined): boolean;
export declare function registerAuthRoutes(app: Express, uploadsDirectory: string): void;
//# sourceMappingURL=authRoutes.d.ts.map