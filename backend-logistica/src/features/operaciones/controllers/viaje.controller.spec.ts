import express, { Express, Request, Response, NextFunction } from 'express';
import request from 'supertest';

jest.mock('../../auth', () => ({
    requerirRol: (_roles: string[]) => (_req: Request, _res: Response, next: NextFunction) => next()
}));

import { buildOperacionesRouter } from '../operaciones.routes';
import { PedidoController } from './pedido.controller';
import { ColaController } from './cola.controller';
import { AsignacionController } from './asignacion.controller';
import { ViajeController } from './viaje.controller';
import { PedidoService } from '../services/pedido.service';
import { ColaService } from '../services/cola.service';
import { AsignacionService } from '../services/asignacion.service';
import { ViajeService } from '../services/viaje.service';
import {
    NotFoundError,
    ConflictError,
    ForbiddenError,
    CapacidadExcedidaError
} from '../../../core/errors/AppError';
import { errorHandler } from '../../../core/errors/errorHandler';
import { ViajeView, PedidoEnViajeView } from '../mappers/viaje.mapper';

const pedidoStub: Pick<PedidoService, 'crearPedido'> = { crearPedido: jest.fn() };
const colaStub: Pick<ColaService, 'listarCola' | 'listarGruposSugeridos'> = {
    listarCola: jest.fn(),
    listarGruposSugeridos: jest.fn()
};
const asignacionStub: Pick<AsignacionService, 'sugerir'> = { sugerir: jest.fn() };

const uuid = (n: number) => `${String(n).padStart(8, '0')}-0000-0000-0000-000000000000`;

type ViajeServiceStub = Pick<ViajeService, 'crear' | 'listar' | 'obtener' | 'iniciar' | 'completar' | 'listarPedidosViaje'>;

const buildApp = (service: ViajeServiceStub): Express => {
    const app = express();
    app.use(express.json());
    app.use(
        '/api/v1/operaciones',
        buildOperacionesRouter(
            new PedidoController(pedidoStub as PedidoService),
            new ColaController(colaStub as ColaService),
            new AsignacionController(asignacionStub as AsignacionService),
            new ViajeController(service as ViajeService)
        )
    );
    app.use(errorHandler);
    return app;
};

const viajeFake = (over: Partial<ViajeView> = {}): ViajeView => ({
    id_viaje: uuid(1),
    numero_guia: `VIAJE-${uuid(1).substring(0, 8)}`,
    status: 'CARGANDO',
    id_camion: uuid(100),
    id_conductor: uuid(200),
    id_ruta: null,
    hora_salida: null,
    hora_llegada: null,
    id_region: 'NORTE',
    fecha_actualizacion: '2026-04-21T10:00:00.000Z',
    ...over
});

const bodyValido = () => ({
    id_pedidos: [uuid(1)],
    id_camion: uuid(100),
    id_conductor: uuid(200)
});

describe('POST /api/v1/operaciones/viajes', () => {
    describe('[Camino feliz]', () => {
        it('retorna 201 con el viaje creado', async () => {
            const service: ViajeServiceStub = {
                crear: jest.fn().mockResolvedValue(viajeFake()),
                listar: jest.fn(),
                obtener: jest.fn(),
                iniciar: jest.fn(),
                completar: jest.fn()
            };
            const app = buildApp(service);

            const res = await request(app)
                .post('/api/v1/operaciones/viajes')
                .send(bodyValido());

            expect(res.status).toBe(201);
            expect(res.body.status).toBe('CARGANDO');
            expect(res.body.numero_guia).toMatch(/^VIAJE-/);
            expect(service.crear).toHaveBeenCalledWith(bodyValido());
        });
    });

    describe('[Validación de DTO]', () => {
        it('retorna 400 cuando falta id_camion', async () => {
            const service: ViajeServiceStub = {
                crear: jest.fn(), listar: jest.fn(), obtener: jest.fn(), iniciar: jest.fn(), completar: jest.fn()
            };
            const app = buildApp(service);
            const { id_camion: _ignorado, ...body } = bodyValido();

            const res = await request(app)
                .post('/api/v1/operaciones/viajes')
                .send(body);

            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
            expect(service.crear).not.toHaveBeenCalled();
        });

        it('retorna 400 cuando id_conductor no es UUID', async () => {
            const service: ViajeServiceStub = {
                crear: jest.fn(), listar: jest.fn(), obtener: jest.fn(), iniciar: jest.fn(), completar: jest.fn()
            };
            const app = buildApp(service);

            const res = await request(app)
                .post('/api/v1/operaciones/viajes')
                .send({ ...bodyValido(), id_conductor: 'abc' });

            expect(res.status).toBe(400);
            expect(service.crear).not.toHaveBeenCalled();
        });

        it('retorna 400 cuando id_pedidos excede 9', async () => {
            const service: ViajeServiceStub = {
                crear: jest.fn(), listar: jest.fn(), obtener: jest.fn(), iniciar: jest.fn(), completar: jest.fn()
            };
            const app = buildApp(service);
            const ids = Array.from({ length: 10 }, (_, i) => uuid(i + 1));

            const res = await request(app)
                .post('/api/v1/operaciones/viajes')
                .send({ ...bodyValido(), id_pedidos: ids });

            expect(res.status).toBe(400);
        });
    });

    describe('[Propagación de errores del servicio]', () => {
        it('retorna 404 cuando algún pedido no existe', async () => {
            const service: ViajeServiceStub = {
                crear: jest.fn().mockRejectedValue(
                    new NotFoundError('Pedidos no encontrados: ' + uuid(9), { ids_no_encontrados: [uuid(9)] })
                ),
                listar: jest.fn(), obtener: jest.fn(), iniciar: jest.fn(), completar: jest.fn()
            };
            const app = buildApp(service);

            const res = await request(app)
                .post('/api/v1/operaciones/viajes')
                .send(bodyValido());

            expect(res.status).toBe(404);
            expect(res.body.error.code).toBe('NOT_FOUND');
        });

        it('retorna 409 cuando el camión ya tiene viaje activo', async () => {
            const service: ViajeServiceStub = {
                crear: jest.fn().mockRejectedValue(
                    new ConflictError('El camión ya tiene un viaje activo', { id_camion: uuid(100) })
                ),
                listar: jest.fn(), obtener: jest.fn(), iniciar: jest.fn(), completar: jest.fn()
            };
            const app = buildApp(service);

            const res = await request(app)
                .post('/api/v1/operaciones/viajes')
                .send(bodyValido());

            expect(res.status).toBe(409);
            expect(res.body.error.code).toBe('CONFLICT');
        });

        it('retorna 422 cuando la capacidad del camión no alcanza', async () => {
            const service: ViajeServiceStub = {
                crear: jest.fn().mockRejectedValue(
                    new CapacidadExcedidaError('Peso excede capacidad', { peso_total_kg: 2000 })
                ),
                listar: jest.fn(), obtener: jest.fn(), iniciar: jest.fn(), completar: jest.fn()
            };
            const app = buildApp(service);

            const res = await request(app)
                .post('/api/v1/operaciones/viajes')
                .send(bodyValido());

            expect(res.status).toBe(422);
            expect(res.body.error.code).toBe('CAPACIDAD_EXCEDIDA');
        });

        it('retorna 403 cuando un pedido pertenece a otra región', async () => {
            const service: ViajeServiceStub = {
                crear: jest.fn().mockRejectedValue(new ForbiddenError('Otro region')),
                listar: jest.fn(), obtener: jest.fn(), iniciar: jest.fn(), completar: jest.fn()
            };
            const app = buildApp(service);

            const res = await request(app)
                .post('/api/v1/operaciones/viajes')
                .send(bodyValido());

            expect(res.status).toBe(403);
        });
    });
});

describe('GET /api/v1/operaciones/viajes', () => {
    it('200 lista todos los viajes sin filtro', async () => {
        const service: ViajeServiceStub = {
            crear: jest.fn(),
            listar: jest.fn().mockResolvedValue([viajeFake(), viajeFake({ id_viaje: uuid(2), status: 'EN_CAMINO' })]),
            obtener: jest.fn(), iniciar: jest.fn(), completar: jest.fn()
        };
        const app = buildApp(service);

        const res = await request(app).get('/api/v1/operaciones/viajes');

        expect(res.status).toBe(200);
        expect(res.body.viajes).toHaveLength(2);
        expect(service.listar).toHaveBeenCalledWith({});
    });

    it('200 pasa filtro status al servicio', async () => {
        const service: ViajeServiceStub = {
            crear: jest.fn(),
            listar: jest.fn().mockResolvedValue([]),
            obtener: jest.fn(), iniciar: jest.fn(), completar: jest.fn()
        };
        const app = buildApp(service);

        await request(app).get('/api/v1/operaciones/viajes?status=CARGANDO');

        expect(service.listar).toHaveBeenCalledWith({ status: 'CARGANDO' });
    });

    it('400 cuando status no es válido', async () => {
        const service: ViajeServiceStub = {
            crear: jest.fn(), listar: jest.fn(),
            obtener: jest.fn(), iniciar: jest.fn(), completar: jest.fn()
        };
        const app = buildApp(service);

        const res = await request(app).get('/api/v1/operaciones/viajes?status=FOO');

        expect(res.status).toBe(400);
        expect(service.listar).not.toHaveBeenCalled();
    });
});

describe('GET /api/v1/operaciones/viajes/:id', () => {
    it('200 devuelve el viaje', async () => {
        const service: ViajeServiceStub = {
            crear: jest.fn(), listar: jest.fn(),
            obtener: jest.fn().mockResolvedValue(viajeFake()),
            iniciar: jest.fn(), completar: jest.fn()
        };
        const app = buildApp(service);

        const res = await request(app).get(`/api/v1/operaciones/viajes/${uuid(1)}`);

        expect(res.status).toBe(200);
        expect(res.body.id_viaje).toBe(uuid(1));
        expect(service.obtener).toHaveBeenCalledWith(uuid(1));
    });

    it('400 cuando :id no es UUID', async () => {
        const service: ViajeServiceStub = {
            crear: jest.fn(), listar: jest.fn(),
            obtener: jest.fn(),
            iniciar: jest.fn(), completar: jest.fn()
        };
        const app = buildApp(service);

        const res = await request(app).get('/api/v1/operaciones/viajes/no-es-uuid');

        expect(res.status).toBe(400);
        expect(service.obtener).not.toHaveBeenCalled();
    });

    it('404 cuando el servicio lanza NotFoundError', async () => {
        const service: ViajeServiceStub = {
            crear: jest.fn(), listar: jest.fn(),
            obtener: jest.fn().mockRejectedValue(new NotFoundError('Viaje no existe')),
            iniciar: jest.fn(), completar: jest.fn()
        };
        const app = buildApp(service);

        const res = await request(app).get(`/api/v1/operaciones/viajes/${uuid(99)}`);

        expect(res.status).toBe(404);
    });
});

describe('PATCH /api/v1/operaciones/viajes/:id/iniciar', () => {
    it('200 transiciona a EN_CAMINO', async () => {
        const service: ViajeServiceStub = {
            crear: jest.fn(), listar: jest.fn(), obtener: jest.fn(),
            iniciar: jest.fn().mockResolvedValue(viajeFake({ status: 'EN_CAMINO', hora_salida: '2026-04-21T10:00:00.000Z' })),
            completar: jest.fn()
        };
        const app = buildApp(service);

        const res = await request(app).patch(`/api/v1/operaciones/viajes/${uuid(1)}/iniciar`);

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('EN_CAMINO');
        expect(res.body.hora_salida).toBeTruthy();
        expect(service.iniciar).toHaveBeenCalledWith(uuid(1));
    });

    it('409 cuando el viaje no está en CARGANDO', async () => {
        const service: ViajeServiceStub = {
            crear: jest.fn(), listar: jest.fn(), obtener: jest.fn(),
            iniciar: jest.fn().mockRejectedValue(
                new ConflictError('Estado incorrecto', { estado_actual: 'EN_CAMINO' })
            ),
            completar: jest.fn()
        };
        const app = buildApp(service);

        const res = await request(app).patch(`/api/v1/operaciones/viajes/${uuid(1)}/iniciar`);

        expect(res.status).toBe(409);
    });
});

describe('PATCH /api/v1/operaciones/viajes/:id/completar', () => {
    it('200 transiciona a COMPLETADO', async () => {
        const service: ViajeServiceStub = {
            crear: jest.fn(), listar: jest.fn(), obtener: jest.fn(),
            iniciar: jest.fn(),
            completar: jest.fn().mockResolvedValue(
                viajeFake({ status: 'COMPLETADO', hora_llegada: '2026-04-21T12:00:00.000Z' })
            )
        };
        const app = buildApp(service);

        const res = await request(app).patch(`/api/v1/operaciones/viajes/${uuid(1)}/completar`);

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('COMPLETADO');
        expect(res.body.hora_llegada).toBeTruthy();
    });

    it('409 cuando el viaje no está en EN_CAMINO ni EN_ENTREGA', async () => {
        const service: ViajeServiceStub = {
            crear: jest.fn(), listar: jest.fn(), obtener: jest.fn(),
            iniciar: jest.fn(), listarPedidosViaje: jest.fn(),
            completar: jest.fn().mockRejectedValue(
                new ConflictError('Estado incorrecto', { estado_actual: 'CARGANDO' })
            )
        };
        const app = buildApp(service);

        const res = await request(app).patch(`/api/v1/operaciones/viajes/${uuid(1)}/completar`);

        expect(res.status).toBe(409);
    });
});

describe('GET /api/v1/operaciones/viajes/:id/pedidos', () => {
    const pedidoFake = (over: Partial<PedidoEnViajeView> = {}): PedidoEnViajeView => ({
        id_pedido: uuid(1),
        id_cliente: uuid(50),
        descripcion_status: 'EN_RUTA',
        prioridad: 'NORMAL',
        peso_total_kg: 5,
        volumen_total_m3: 0.2,
        ...over
    });

    it('200 retorna los pedidos del viaje', async () => {
        const service: ViajeServiceStub = {
            crear: jest.fn(), listar: jest.fn(), obtener: jest.fn(),
            iniciar: jest.fn(), completar: jest.fn(),
            listarPedidosViaje: jest.fn().mockResolvedValue([pedidoFake(), pedidoFake({ id_pedido: uuid(2) })])
        };
        const app = buildApp(service);

        const res = await request(app).get(`/api/v1/operaciones/viajes/${uuid(1)}/pedidos`);

        expect(res.status).toBe(200);
        expect(res.body.id_viaje).toBe(uuid(1));
        expect(res.body.total).toBe(2);
        expect(res.body.pedidos).toHaveLength(2);
        expect(service.listarPedidosViaje).toHaveBeenCalledWith(uuid(1));
    });

    it('400 cuando :id no es UUID', async () => {
        const service: ViajeServiceStub = {
            crear: jest.fn(), listar: jest.fn(), obtener: jest.fn(),
            iniciar: jest.fn(), completar: jest.fn(), listarPedidosViaje: jest.fn()
        };
        const app = buildApp(service);

        const res = await request(app).get('/api/v1/operaciones/viajes/no-es-uuid/pedidos');

        expect(res.status).toBe(400);
        expect(service.listarPedidosViaje).not.toHaveBeenCalled();
    });

    it('404 cuando el viaje no existe', async () => {
        const service: ViajeServiceStub = {
            crear: jest.fn(), listar: jest.fn(), obtener: jest.fn(),
            iniciar: jest.fn(), completar: jest.fn(),
            listarPedidosViaje: jest.fn().mockRejectedValue(new NotFoundError('Viaje no existe'))
        };
        const app = buildApp(service);

        const res = await request(app).get(`/api/v1/operaciones/viajes/${uuid(99)}/pedidos`);

        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('NOT_FOUND');
    });
});
