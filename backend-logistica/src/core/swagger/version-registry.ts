import { Router, Express, Request, Response } from 'express';

/**
 * Tipo mínimo del documento OpenAPI. Usamos Record para mantener flexibilidad
 * sin traer la dependencia pesada de @types/openapi.
 */
export type OpenApiDocument = Record<string, unknown>;

interface VersionedApi {
    version: string;
    router: Router;
    spec: OpenApiDocument;
}

class ApiVersionRegistryImpl {
    private readonly versions = new Map<string, VersionedApi>();

    register(api: VersionedApi): void {
        this.versions.set(api.version, api);
    }

    listVersions(): string[] {
        return [...this.versions.keys()];
    }

    getSpec(version: string): OpenApiDocument | undefined {
        return this.versions.get(version)?.spec;
    }

    /**
     * Monta cada versión en /api/{version}/... y expone la spec bajo /api/{version}/docs.json.
     * La UI de Swagger se monta aparte desde bootstrapSwaggerUI (opcional).
     */
    mount(app: Express, basePath = '/api'): void {
        for (const api of this.versions.values()) {
            app.use(`${basePath}/${api.version}`, api.router);
            app.get(`${basePath}/${api.version}/docs.json`, (_req: Request, res: Response) => {
                res.json(api.spec);
            });
        }

        app.get(`${basePath}/versions`, (_req, res) => {
            res.json({ versions: this.listVersions() });
        });
    }
}

export const ApiVersionRegistry = new ApiVersionRegistryImpl();
