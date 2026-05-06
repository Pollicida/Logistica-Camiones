import express, { Express, Request, Response, NextFunction } from 'express';
import request from 'supertest';

jest.mock('../../auth', () => ({
    requerirRol: (_roles: string[]) => (_req: Request, _res: Response, next: NextFunction) => next()
}));

import { buildOperacionesRouter } from '../operaciones.routes';
import { PedidoController } from './pedido.controller';
import { ColaController } from './cola.controller';
import { AsignacionController } from './asignacion.controller';
import { PedidoService } from '../services/pedido.service';
import { ColaService } from '../services/cola.service';
import { AsignacionService } from '../services/asignacion.service';
import {
    NotFoundError,
    ConflictError,
    ForbiddenError
} from '../../../core/errors/AppError';
import { errorHandler } from '../../../core/errors/errorHandler';
import { SugerenciaAsignacionView } from '../mappers/asignacion.mapper';

const pedidoStub: Pick<PedidoService, 'crearPedido'> = { crearPedido: jest.fn() };
const colaStub: Pick<ColaService, 'listarCola' | 'listarGruposSugeridos'> = {
    listarCola: jest.fn(),
    listarGruposSugeridos: jest.fn()
};

const buildApp = (service: Pick<AsignacionService, 'sugerir'>): Express => {
    const app = express();
    app.use(express.json());
    const pedidoController = new PedidoController(pedidoStub as PedidoService);
    const colaController = new ColaController(colaStub as ColaService);
    const asignacionController = new AsignacionController(service as AsignacionService);
    app.use(
        '/api/v1/operaciones',
        buildOperacionesRouter(pedidoController, colaController, asignacionController)
    );
    app.use(errorHandler);
    return app;
};

const uuid = (n: number) => `${String(n).padStart(8, '0')}-0000-0000-0000-000000000000`;

const sugerenciaFake = (): SugerenciaAsignacionView => ({
    pedidos: [{
        id_pedido: uuid(1),
        id_cliente: uuid(101),
        nombre_cliente: 'Almacén A',
        latitud: 19.4326,
        longitud: -99.1332,
        peso_total_kg: 5,
        volumen_total_m3: 0.2,
        prioridad: 'NORMAL'
    }],
    totales: {
        cantidad_pedidos: 1,
        peso_total_kg: 5,
        volumen_total_m3: 0.2,
        centroide: { latitud: 19.4326, longitud: -99.1332 }
    },
    camiones_sugeridos: [{
        id_camion: uuid(201),
        marca: 'Kenworth',
        modelo: 'T680',
        placas: 'ABC-123',
        capacidad_carga_kg: 1000,
        capacidad_volumen_m3: 20,
        capacidad_carga_disponible_kg: 995,
        capacidad_volumen_disponible_m3: 19.8,
        ubicacion_actual: {
            latitud: 19.44,
            longitud: -99.13,
            fecha_registro: '2026-04-21T09:00:00.000Z'
        },
        distancia_a_centroide_metros: 850,
        conductor_sugerido: {
            id_conductor: uuid(301),
            nombre_completo: 'Juan Pérez',
            telefono: '5551234567'
        }
    }]
});

describe('POST /api/v1/operaciones/asignacion/sugerir', () => {
    describe('[Camino feliz]', () => {
        it('retorna 200 con la sugerencia cuando el servicio responde correctamente', async () => {
            const service = { sugerir: jest.fn().mockResolvedValue(sugerenciaFake()) };
            const app = buildApp(service);

            const res = await request(app)
                .post('/api/v1/operaciones/asignacion/sugerir')
                .send({ id_pedidos: [uuid(1)] });

            expect(res.status).toBe(200);
            expect(res.body.pedidos).toHaveLength(1);
            expect(res.body.totales.cantidad_pedidos).toBe(1);
            expect(res.body.camiones_sugeridos).toHaveLength(1);
            expect(res.body.camiones_sugeridos[0].distancia_a_centroide_metros).toBe(850);
            expect(service.sugerir).toHaveBeenCalledWith({ id_pedidos: [uuid(1)] });
        });

        it('acepta hasta 9 pedidos y los pasa tal cual al servicio', async () => {
            const service = { sugerir: jest.fn().mockResolvedValue(sugerenciaFake()) };
            const app = buildApp(service);
            const ids = Array.from({ length: 9 }, (_, i) => uuid(i + 1));

            const res = await request(app)
                .post('/api/v1/operaciones/asignacion/sugerir')
                .send({ id_pedidos: ids });

            expect(res.status).toBe(200);
            expect(service.sugerir).toHaveBeenCalledWith({ id_pedidos: ids });
        });
    });

    describe('[Validación de DTO]', () => {
        it('retorna 400 cuando id_pedidos está vacío', async () => {
            const service = { sugerir: jest.fn() };
            const app = buildApp(service);

            const res = await request(app)
                .post('/api/v1/operaciones/asignacion/sugerir')
                .send({ id_pedidos: [] });

            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
            expect(service.sugerir).not.toHaveBeenCalled();
        });

        it('retorna 400 cuando id_pedidos excede 9 elementos', async () => {
            const service = { sugerir: jest.fn() };
            const app = buildApp(service);
            const ids = Array.from({ length: 10 }, (_, i) => uuid(i + 1));

            const res = await request(app)
                .post('/api/v1/operaciones/asignacion/sugerir')
                .send({ id_pedidos: ids });

            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
            expect(service.sugerir).not.toHaveBeenCalled();
        });

        it('retorna 400 cuando algún id no es UUID válido', async () => {
            const service = { sugerir: jest.fn() };
            const app = buildApp(service);

            const res = await request(app)
                .post('/api/v1/operaciones/asignacion/sugerir')
                .send({ id_pedidos: ['no-es-uuid'] });

            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
            expect(service.sugerir).not.toHaveBeenCalled();
        });

        it('retorna 400 cuando hay duplicados', async () => {
            const service = { sugerir: jest.fn() };
            const app = buildApp(service);

            const res = await request(app)
                .post('/api/v1/operaciones/asignacion/sugerir')
                .send({ id_pedidos: [uuid(1), uuid(1)] });

            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
            expect(service.sugerir).not.toHaveBeenCalled();
        });

        it('retorna 400 cuando falta id_pedidos en el body', async () => {
            const service = { sugerir: jest.fn() };
            const app = buildApp(service);

            const res = await request(app)
                .post('/api/v1/operaciones/asignacion/sugerir')
                .send({});

            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
            expect(service.sugerir).not.toHaveBeenCalled();
        });
    });

    describe('[Propagación de errores del servicio]', () => {
        it('retorna 404 cuando algún pedido no existe', async () => {
            const service = {
                sugerir: jest.fn().mockRejectedValue(
                    new NotFoundError(`Pedidos no encontrados: ${uuid(1)}`, {
                        ids_no_encontrados: [uuid(1)]
                    })
                )
            };
            const app = buildApp(service);

            const res = await request(app)
                .post('/api/v1/operaciones/asignacion/sugerir')
                .send({ id_pedidos: [uuid(1)] });

            expect(res.status).toBe(404);
            expect(res.body.error.code).toBe('NOT_FOUND');
            expect(res.body.error.details.ids_no_encontrados).toEqual([uuid(1)]);
        });

        it('retorna 409 cuando algún pedido no está en estado EN_COLA', async () => {
            const service = {
                sugerir: jest.fn().mockRejectedValue(
                    new ConflictError(
                        `El pedido ${uuid(1)} no está en estado EN_COLA (estado actual: ASIGNADO)`,
                        { id_pedido: uuid(1), estado_actual: 'ASIGNADO' }
                    )
                )
            };
            const app = buildApp(service);

            const res = await request(app)
                .post('/api/v1/operaciones/asignacion/sugerir')
                .send({ id_pedidos: [uuid(1)] });

            expect(res.status).toBe(409);
            expect(res.body.error.code).toBe('CONFLICT');
            expect(res.body.error.details.estado_actual).toBe('ASIGNADO');
        });

        it('retorna 403 cuando algún pedido pertenece a otra región', async () => {
            const service = {
                sugerir: jest.fn().mockRejectedValue(
                    new ForbiddenError(
                        `El pedido ${uuid(1)} pertenece a la región CENTRO, no a NORTE`
                    )
                )
            };
            const app = buildApp(service);

            const res = await request(app)
                .post('/api/v1/operaciones/asignacion/sugerir')
                .send({ id_pedidos: [uuid(1)] });

            expect(res.status).toBe(403);
            expect(res.body.error.code).toBe('FORBIDDEN');
        });
    });
});
