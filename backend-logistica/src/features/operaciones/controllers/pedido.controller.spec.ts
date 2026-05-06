import express, { Express, Request, Response, NextFunction } from 'express';
import request from 'supertest';

// Mockeamos la fachada de auth ANTES de importar los módulos que la consumen.
// Así evitamos depender de JWT real en tests y se mantiene aislada la capa HTTP.
jest.mock('../../auth', () => ({
    requerirRol: (_roles: string[]) => (_req: Request, _res: Response, next: NextFunction) => next()
}));

import { buildOperacionesRouter } from '../operaciones.routes';
import { PedidoController } from './pedido.controller';
import { PedidoService } from '../services/pedido.service';
import {
    CapacidadExcedidaError,
    StockInsuficienteError,
    NotFoundError,
    ForbiddenError,
    ConflictError
} from '../../../core/errors/AppError';
import { errorHandler } from '../../../core/errors/errorHandler';
import { PedidoView, PedidoResumen } from '../mappers/pedido.mapper';
import { EntregaView } from '../services/pedido.service';

type PedidoServiceStub = Pick<PedidoService, 'crearPedido' | 'confirmarEntrega' | 'listarPedidos' | 'obtenerPedido'>;

const stubService = (over: Partial<PedidoServiceStub> = {}): PedidoServiceStub => ({
    crearPedido: jest.fn(),
    confirmarEntrega: jest.fn(),
    listarPedidos: jest.fn().mockResolvedValue([]),
    obtenerPedido: jest.fn(),
    ...over
});

const buildApp = (service: Partial<PedidoService>): Express => {
    const app = express();
    app.use(express.json());
    const controller = new PedidoController(service as PedidoService);
    app.use('/api/v1/operaciones', buildOperacionesRouter(controller));
    app.use(errorHandler);
    return app;
};

const entregaFake = (): EntregaView => ({
    id_pedido: '00000001-0000-0000-0000-000000000000',
    descripcion_status: 'ENTREGADO',
    hora_entrega: '2026-04-21T12:00:00.000Z',
    id_viaje: '00000010-0000-0000-0000-000000000000',
    viaje_completado: false
});

const dtoValido = () => ({
    id_cliente: '22222222-2222-2222-2222-222222222222',
    items: [
        { id_producto: '11111111-1111-1111-1111-111111111111', cantidad: 2 }
    ]
});

const pedidoViewFake = (): PedidoView => ({
    id_pedido: 'pedido-uuid',
    id_cliente: '22222222-2222-2222-2222-222222222222',
    total: 100,
    hora_pedido: new Date('2026-04-17T12:00:00Z').toISOString(),
    descripcion_status: 'EN_COLA',
    descripcion: null,
    id_region: 'NORTE',
    prioridad: 'NORMAL',
    detalles: [{
        id_detalle: 'det-0',
        id_producto: '11111111-1111-1111-1111-111111111111',
        cantidad: 2,
        precio_unitario: 50,
        subtotal: 100
    }],
    metricas: { peso_total_kg: 4, volumen_total_m3: 0.2 }
});

describe('POST /api/v1/operaciones/pedidos', () => {
    describe('[Camino feliz]', () => {
        it('retorna 201 con el PedidoView cuando el servicio procesa el pedido', async () => {
            const service: PedidoServiceStub = { crearPedido: jest.fn().mockResolvedValue(pedidoViewFake()), confirmarEntrega: jest.fn() };
            const app = buildApp(service);

            const res = await request(app)
                .post('/api/v1/operaciones/pedidos')
                .send(dtoValido());

            expect(res.status).toBe(201);
            expect(res.body.id_pedido).toBe('pedido-uuid');
            expect(res.body.descripcion_status).toBe('EN_COLA');
            expect(res.body.prioridad).toBe('NORMAL');
            expect(res.body.metricas.peso_total_kg).toBe(4);
            expect(service.crearPedido).toHaveBeenCalledTimes(1);
        });

        it('pasa la prioridad ALTA al servicio cuando viene en el body', async () => {
            const vista: PedidoView = { ...pedidoViewFake(), prioridad: 'ALTA' };
            const service = { crearPedido: jest.fn().mockResolvedValue(vista) };
            const app = buildApp(service);

            const res = await request(app)
                .post('/api/v1/operaciones/pedidos')
                .send({ ...dtoValido(), prioridad: 'ALTA' });

            expect(res.status).toBe(201);
            expect(res.body.prioridad).toBe('ALTA');
            expect(service.crearPedido).toHaveBeenCalledWith(
                expect.objectContaining({ prioridad: 'ALTA' })
            );
        });
    });

    describe('[Regla 0 - Cliente]', () => {
        it('retorna 404 con code NOT_FOUND cuando el cliente no existe', async () => {
            const service: PedidoServiceStub = {
                crearPedido: jest.fn().mockRejectedValue(
                    new NotFoundError('Cliente 22222222-2222-2222-2222-222222222222 no existe o está inactivo')
                ),
                confirmarEntrega: jest.fn()
            };
            const app = buildApp(service);

            const res = await request(app)
                .post('/api/v1/operaciones/pedidos')
                .send(dtoValido());

            expect(res.status).toBe(404);
            expect(res.body.error.code).toBe('NOT_FOUND');
        });

        it('retorna 403 con code FORBIDDEN cuando el cliente pertenece a otra región', async () => {
            const service: PedidoServiceStub = {
                crearPedido: jest.fn().mockRejectedValue(
                    new ForbiddenError('El cliente no pertenece a la región NORTE atendida por este servidor')
                ),
                confirmarEntrega: jest.fn()
            };
            const app = buildApp(service);

            const res = await request(app)
                .post('/api/v1/operaciones/pedidos')
                .send(dtoValido());

            expect(res.status).toBe(403);
            expect(res.body.error.code).toBe('FORBIDDEN');
        });
    });

    describe('[Regla 1 - Stock]', () => {
        it('retorna 400 con code STOCK_INSUFICIENTE', async () => {
            const service: PedidoServiceStub = {
                crearPedido: jest.fn().mockRejectedValue(
                    new StockInsuficienteError('Stock insuficiente para el producto Caja', {
                        stock_disponible: 1, requerido: 3
                    })
                ),
                confirmarEntrega: jest.fn()
            };
            const app = buildApp(service);

            const res = await request(app)
                .post('/api/v1/operaciones/pedidos')
                .send(dtoValido());

            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('STOCK_INSUFICIENTE');
            expect(res.body.error.details.requerido).toBe(3);
        });
    });

    describe('[Regla 2 - Física]', () => {
        it('retorna 422 con code CAPACIDAD_EXCEDIDA cuando el peso supera la flota regional', async () => {
            const service: PedidoServiceStub = {
                crearPedido: jest.fn().mockRejectedValue(
                    new CapacidadExcedidaError('El peso del pedido excede la capacidad', {
                        peso_total_kg: 1500, capacidad_carga_kg: 1000
                    })
                ),
                confirmarEntrega: jest.fn()
            };
            const app = buildApp(service);

            const res = await request(app)
                .post('/api/v1/operaciones/pedidos')
                .send(dtoValido());

            expect(res.status).toBe(422);
            expect(res.body.error.code).toBe('CAPACIDAD_EXCEDIDA');
            expect(res.body.error.details.peso_total_kg).toBe(1500);
        });
    });

    describe('[Producto inexistente]', () => {
        it('retorna 404 con code NOT_FOUND', async () => {
            const service: PedidoServiceStub = {
                crearPedido: jest.fn().mockRejectedValue(new NotFoundError('Producto X no existe')),
                confirmarEntrega: jest.fn()
            };
            const app = buildApp(service);

            const res = await request(app)
                .post('/api/v1/operaciones/pedidos')
                .send(dtoValido());

            expect(res.status).toBe(404);
            expect(res.body.error.code).toBe('NOT_FOUND');
        });
    });

    describe('[Validación de DTO]', () => {
        it('retorna 400 cuando items está vacío', async () => {
            const service: PedidoServiceStub = { crearPedido: jest.fn(), confirmarEntrega: jest.fn() };
            const app = buildApp(service);

            const res = await request(app)
                .post('/api/v1/operaciones/pedidos')
                .send({ id_cliente: '22222222-2222-2222-2222-222222222222', items: [] });

            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
            expect(service.crearPedido).not.toHaveBeenCalled();
        });

        it('retorna 400 cuando id_cliente no es UUID', async () => {
            const service: PedidoServiceStub = { crearPedido: jest.fn(), confirmarEntrega: jest.fn() };
            const app = buildApp(service);

            const res = await request(app)
                .post('/api/v1/operaciones/pedidos')
                .send({ id_cliente: 'no-es-uuid', items: [{ id_producto: '11111111-1111-1111-1111-111111111111', cantidad: 1 }] });

            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
        });

        it('retorna 400 cuando cantidad no es un entero positivo', async () => {
            const service: PedidoServiceStub = { crearPedido: jest.fn(), confirmarEntrega: jest.fn() };
            const app = buildApp(service);

            const res = await request(app)
                .post('/api/v1/operaciones/pedidos')
                .send({
                    id_cliente: '22222222-2222-2222-2222-222222222222',
                    items: [{ id_producto: '11111111-1111-1111-1111-111111111111', cantidad: 0 }]
                });

            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
        });

        it('retorna 400 cuando prioridad tiene un valor no permitido', async () => {
            const service: PedidoServiceStub = { crearPedido: jest.fn(), confirmarEntrega: jest.fn() };
            const app = buildApp(service);

            const res = await request(app)
                .post('/api/v1/operaciones/pedidos')
                .send({ ...dtoValido(), prioridad: 'URGENTE' });

            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
            expect(service.crearPedido).not.toHaveBeenCalled();
        });
    });
});

const uuid = (n: number) => `${String(n).padStart(8, '0')}-0000-0000-0000-000000000000`;

describe('PATCH /api/v1/operaciones/pedidos/:id/entregar', () => {
    it('200 retorna EntregaView cuando el servicio confirma la entrega', async () => {
        const service: PedidoServiceStub = {
            crearPedido: jest.fn(),
            confirmarEntrega: jest.fn().mockResolvedValue(entregaFake())
        };
        const app = buildApp(service);

        const res = await request(app).patch(`/api/v1/operaciones/pedidos/${uuid(1)}/entregar`);

        expect(res.status).toBe(200);
        expect(res.body.descripcion_status).toBe('ENTREGADO');
        expect(res.body.hora_entrega).toBeTruthy();
        expect(typeof res.body.viaje_completado).toBe('boolean');
        expect(service.confirmarEntrega).toHaveBeenCalledWith(uuid(1));
    });

    it('200 con viaje_completado=true cuando era el último pedido', async () => {
        const service: PedidoServiceStub = {
            crearPedido: jest.fn(),
            confirmarEntrega: jest.fn().mockResolvedValue({ ...entregaFake(), viaje_completado: true })
        };
        const app = buildApp(service);

        const res = await request(app).patch(`/api/v1/operaciones/pedidos/${uuid(1)}/entregar`);

        expect(res.status).toBe(200);
        expect(res.body.viaje_completado).toBe(true);
    });

    it('400 cuando :id no es un UUID válido', async () => {
        const service: PedidoServiceStub = { crearPedido: jest.fn(), confirmarEntrega: jest.fn() };
        const app = buildApp(service);

        const res = await request(app).patch('/api/v1/operaciones/pedidos/no-es-uuid/entregar');

        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
        expect(service.confirmarEntrega).not.toHaveBeenCalled();
    });

    it('404 cuando el pedido no existe', async () => {
        const service: PedidoServiceStub = {
            crearPedido: jest.fn(),
            confirmarEntrega: jest.fn().mockRejectedValue(new NotFoundError(`Pedido ${uuid(1)} no existe`))
        };
        const app = buildApp(service);

        const res = await request(app).patch(`/api/v1/operaciones/pedidos/${uuid(1)}/entregar`);

        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('409 cuando el pedido no está en EN_RUTA', async () => {
        const service = stubService({
            confirmarEntrega: jest.fn().mockRejectedValue(
                new ConflictError('El pedido solo puede confirmarse en estado EN_RUTA (actual: ASIGNADO)', {
                    id_pedido: uuid(1), estado_actual: 'ASIGNADO'
                })
            )
        });
        const app = buildApp(service);

        const res = await request(app).patch(`/api/v1/operaciones/pedidos/${uuid(1)}/entregar`);

        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('CONFLICT');
        expect(res.body.error.details.estado_actual).toBe('ASIGNADO');
    });
});

const resumenFake = (over: Partial<PedidoResumen> = {}): PedidoResumen => ({
    id_pedido: uuid(1),
    id_cliente: uuid(50),
    total: 100,
    hora_pedido: '2026-04-21T09:00:00.000Z',
    descripcion_status: 'EN_COLA',
    id_region: 'NORTE',
    prioridad: 'NORMAL',
    peso_total_kg: 5,
    volumen_total_m3: 0.2,
    ...over
});

describe('GET /api/v1/operaciones/pedidos', () => {
    it('200 retorna lista y total sin filtro', async () => {
        const service = stubService({
            listarPedidos: jest.fn().mockResolvedValue([resumenFake(), resumenFake({ id_pedido: uuid(2) })])
        });
        const app = buildApp(service);

        const res = await request(app).get('/api/v1/operaciones/pedidos');

        expect(res.status).toBe(200);
        expect(res.body.total).toBe(2);
        expect(res.body.pedidos).toHaveLength(2);
        expect(service.listarPedidos).toHaveBeenCalledWith({});
    });

    it('200 pasa filtro status al servicio', async () => {
        const service = stubService({ listarPedidos: jest.fn().mockResolvedValue([]) });
        const app = buildApp(service);

        await request(app).get('/api/v1/operaciones/pedidos?status=EN_COLA');

        expect(service.listarPedidos).toHaveBeenCalledWith({ status: 'EN_COLA' });
    });

    it('400 cuando status no es válido', async () => {
        const service = stubService();
        const app = buildApp(service);

        const res = await request(app).get('/api/v1/operaciones/pedidos?status=INVALIDO');

        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
        expect(service.listarPedidos).not.toHaveBeenCalled();
    });
});

describe('GET /api/v1/operaciones/pedidos/:id', () => {
    it('200 retorna el pedido completo', async () => {
        const service = stubService({
            obtenerPedido: jest.fn().mockResolvedValue(pedidoViewFake())
        });
        const app = buildApp(service);

        const res = await request(app).get(`/api/v1/operaciones/pedidos/${uuid(1)}`);

        expect(res.status).toBe(200);
        expect(res.body.id_pedido).toBe('pedido-uuid');
        expect(service.obtenerPedido).toHaveBeenCalledWith(uuid(1));
    });

    it('400 cuando :id no es UUID', async () => {
        const service = stubService();
        const app = buildApp(service);

        const res = await request(app).get('/api/v1/operaciones/pedidos/no-es-uuid');

        expect(res.status).toBe(400);
        expect(service.obtenerPedido).not.toHaveBeenCalled();
    });

    it('404 cuando el pedido no existe', async () => {
        const service = stubService({
            obtenerPedido: jest.fn().mockRejectedValue(new NotFoundError('Pedido no existe'))
        });
        const app = buildApp(service);

        const res = await request(app).get(`/api/v1/operaciones/pedidos/${uuid(99)}`);

        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('NOT_FOUND');
    });
});
