import { Router, Express } from 'express';
import { ApiVersionRegistry } from './version-registry';
import { openapiV1 } from './v1/openapi.v1';
import { operacionesRouter } from '../../features/operaciones';

/**
 * Router de la v1: aquí se montan los sub-módulos que ya están versionados.
 * Futuras versiones (v2, v3) crean su propio router y su propia spec sin tocar ésta.
 */
const v1Router = Router();
v1Router.use('/operaciones', operacionesRouter);

ApiVersionRegistry.register({
    version: 'v1',
    router: v1Router,
    spec: openapiV1
});

export const registerApiVersions = (app: Express): void => {
    ApiVersionRegistry.mount(app, '/api');
};

/**
 * Monta la UI de Swagger (opcional: requiere swagger-ui-express).
 * Si el paquete no está instalado, devolvemos false silenciosamente.
 */
export const bootstrapSwaggerUI = async (app: Express): Promise<boolean> => {
    try {
        const swaggerUi = await import('swagger-ui-express');
        for (const version of ApiVersionRegistry.listVersions()) {
            const spec = ApiVersionRegistry.getSpec(version);
            if (!spec) continue;
            app.use(
                `/api/${version}/docs`,
                swaggerUi.serve,
                swaggerUi.setup(spec, { customSiteTitle: `Logística API ${version}` })
            );
        }
        return true;
    } catch {
        return false;
    }
};

export { ApiVersionRegistry };
