import express, { Express, Request, Response, NextFunction } from 'express';
import request from 'supertest';

jest.mock('../../auth', () => ({
    requerirRol: (_roles: string[]) => (_req: Request, _res: Response, next: NextFunction) => next()
}));

import { buildOperacionesRouter } from '../operaciones.routes';
import { PedidoController } from './pedido.controller';
import { ColaController } from './cola.controller';
import { ColaService } from '../services/cola.service';
import { PedidoService } from '../services/pedido.service';
import { errorHandler } from '../../../core/errors/errorHandler';
import { GrupoColaView, PedidoColaView } from '../mappers/cola.mapper';

const pedidoStub: Pick<PedidoService, 'crearPedido'> = { crearPedido: jest.fn() };

const buildApp = (service: Pick<ColaService, 'listarCola' | 'listarGruposSugeridos'>): Express => {
    const app = express();
    app.use(express.json());
    const pedidoController = new PedidoController(pedidoStub as PedidoService);
    const colaController = new ColaController(service as ColaService);
    app.use('/api/v1/operaciones', buildOperacionesRouter(pedidoController, colaController));
    app.use(errorHandler);
    return app;
};

const pedidoColaFake = (over: Partial<PedidoColaView> = {}): PedidoColaView => ({
    id_pedido: over.id_pedido ?? 'p1',
    id_cliente: over.id_cliente ?? 'c1',
    nombre_cliente: over.nombre_cliente ?? 'Almacén A',
    direccion: over.direccion ?? 'Dir A',
    latitud: over.latitud ?? 19.4326,
    longitud: over.longitud ?? -99.1332,
    total: over.total ?? 100,
    peso_total_kg: over.peso_total_kg ?? 5,
    volumen_total_m3: over.volumen_total_m3 ?? 0.2,
    prioridad: over.prioridad ?? 'NORMAL',
    hora_pedido: over.hora_pedido ?? '2026-04-21T09:00:00.000Z',
    tiempo_en_cola_segundos: over.tiempo_en_cola_segundos ?? 3600
});

describe('GET /api/v1/operaciones/cola', () => {
    it('retorna 200 con el total y el arreglo de pedidos', async () => {
        const service = {
            listarCola: jest.fn().mockResolvedValue([pedidoColaFake(), pedidoColaFake({ id_pedido: 'p2' })]),
            listarGruposSugeridos: jest.fn()
        };
        const app = buildApp(service);

        const res = await request(app).get('/api/v1/operaciones/cola');

        expect(res.status).toBe(200);
        expect(res.body.total).toBe(2);
        expect(res.body.pedidos).toHaveLength(2);
        expect(res.body.pedidos[0].id_pedido).toBe('p1');
    });

    it('retorna total=0 y pedidos vacío cuando no hay pedidos en cola', async () => {
        const service = {
            listarCola: jest.fn().mockResolvedValue([]),
            listarGruposSugeridos: jest.fn()
        };
        const app = buildApp(service);

        const res = await request(app).get('/api/v1/operaciones/cola');

        expect(res.status).toBe(200);
        expect(res.body.total).toBe(0);
        expect(res.body.pedidos).toEqual([]);
    });
});

describe('GET /api/v1/operaciones/cola/grupos', () => {
    const grupoFake = (over: Partial<GrupoColaView> = {}): GrupoColaView => ({
        id_grupo: over.id_grupo ?? 1,
        cantidad_pedidos: over.cantidad_pedidos ?? 2,
        peso_total_kg: over.peso_total_kg ?? 10,
        volumen_total_m3: over.volumen_total_m3 ?? 0.4,
        total_monetario: over.total_monetario ?? 200,
        pedidos: over.pedidos ?? [pedidoColaFake(), pedidoColaFake({ id_pedido: 'p2' })]
    });

    it('retorna 200 con grupos sugeridos', async () => {
        const service = {
            listarCola: jest.fn(),
            listarGruposSugeridos: jest.fn().mockResolvedValue([grupoFake()])
        };
        const app = buildApp(service);

        const res = await request(app).get('/api/v1/operaciones/cola/grupos');

        expect(res.status).toBe(200);
        expect(res.body.total_grupos).toBe(1);
        expect(res.body.radio_metros).toBe(5000);
        expect(res.body.max_por_grupo).toBe(9);
        expect(res.body.grupos[0].cantidad_pedidos).toBe(2);
        expect(service.listarGruposSugeridos).toHaveBeenCalledWith({});
    });

    it('propaga query params radio_metros y max_por_grupo al servicio', async () => {
        const service = {
            listarCola: jest.fn(),
            listarGruposSugeridos: jest.fn().mockResolvedValue([])
        };
        const app = buildApp(service);

        const res = await request(app)
            .get('/api/v1/operaciones/cola/grupos')
            .query({ radio_metros: '2000', max_por_grupo: '5' });

        expect(res.status).toBe(200);
        expect(res.body.radio_metros).toBe(2000);
        expect(res.body.max_por_grupo).toBe(5);
        expect(service.listarGruposSugeridos).toHaveBeenCalledWith({
            radioMetros: 2000,
            maxPedidosPorGrupo: 5
        });
    });

    it('retorna 400 cuando radio_metros no es un entero positivo', async () => {
        const service = {
            listarCola: jest.fn(),
            listarGruposSugeridos: jest.fn()
        };
        const app = buildApp(service);

        const res = await request(app)
            .get('/api/v1/operaciones/cola/grupos')
            .query({ radio_metros: '-10' });

        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
        expect(service.listarGruposSugeridos).not.toHaveBeenCalled();
    });

    it('retorna 400 cuando max_por_grupo excede el límite (9)', async () => {
        const service = {
            listarCola: jest.fn(),
            listarGruposSugeridos: jest.fn()
        };
        const app = buildApp(service);

        const res = await request(app)
            .get('/api/v1/operaciones/cola/grupos')
            .query({ max_por_grupo: '15' });

        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
        expect(service.listarGruposSugeridos).not.toHaveBeenCalled();
    });

    it('retorna 400 cuando max_por_grupo no es numérico', async () => {
        const service = {
            listarCola: jest.fn(),
            listarGruposSugeridos: jest.fn()
        };
        const app = buildApp(service);

        const res = await request(app)
            .get('/api/v1/operaciones/cola/grupos')
            .query({ max_por_grupo: 'abc' });

        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
});
