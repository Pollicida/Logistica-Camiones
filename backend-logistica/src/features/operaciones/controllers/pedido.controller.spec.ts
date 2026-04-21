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
    NotFoundError
} from '../../../core/errors/AppError';
import { errorHandler } from '../../../core/errors/errorHandler';
import { PedidoView } from '../mappers/pedido.mapper';

const buildApp = (service: Pick<PedidoService, 'crearPedido'>): Express => {
    const app = express();
    app.use(express.json());
    const controller = new PedidoController(service as PedidoService);
    app.use('/api/v1/operaciones', buildOperacionesRouter(controller));
    app.use(errorHandler);
    return app;
};

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
    descripcion_status: 'CREADO',
    descripcion: null,
    id_region: 'NORTE',
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
            const service = { crearPedido: jest.fn().mockResolvedValue(pedidoViewFake()) };
            const app = buildApp(service);

            const res = await request(app)
                .post('/api/v1/operaciones/pedidos')
                .send(dtoValido());

            expect(res.status).toBe(201);
            expect(res.body.id_pedido).toBe('pedido-uuid');
            expect(res.body.metricas.peso_total_kg).toBe(4);
            expect(service.crearPedido).toHaveBeenCalledTimes(1);
        });
    });

    describe('[Regla 1 - Stock]', () => {
        it('retorna 400 con code STOCK_INSUFICIENTE', async () => {
            const service = {
                crearPedido: jest.fn().mockRejectedValue(
                    new StockInsuficienteError('Stock insuficiente para el producto Caja', {
                        stock_disponible: 1, requerido: 3
                    })
                )
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
            const service = {
                crearPedido: jest.fn().mockRejectedValue(
                    new CapacidadExcedidaError('El peso del pedido excede la capacidad', {
                        peso_total_kg: 1500, capacidad_carga_kg: 1000
                    })
                )
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
            const service = {
                crearPedido: jest.fn().mockRejectedValue(
                    new NotFoundError('Producto X no existe')
                )
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
            const service = { crearPedido: jest.fn() };
            const app = buildApp(service);

            const res = await request(app)
                .post('/api/v1/operaciones/pedidos')
                .send({ id_cliente: '22222222-2222-2222-2222-222222222222', items: [] });

            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
            expect(service.crearPedido).not.toHaveBeenCalled();
        });

        it('retorna 400 cuando id_cliente no es UUID', async () => {
            const service = { crearPedido: jest.fn() };
            const app = buildApp(service);

            const res = await request(app)
                .post('/api/v1/operaciones/pedidos')
                .send({ id_cliente: 'no-es-uuid', items: [{ id_producto: '11111111-1111-1111-1111-111111111111', cantidad: 1 }] });

            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
        });

        it('retorna 400 cuando cantidad no es un entero positivo', async () => {
            const service = { crearPedido: jest.fn() };
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
    });
});
