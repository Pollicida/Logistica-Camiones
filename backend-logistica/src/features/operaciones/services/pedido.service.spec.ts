import { PedidoService, FlotillaFacadeLike } from './pedido.service';
import { CrearPedidoDTO } from '../dto/crear-pedido.dto';
import { ProductoEntity } from '../models/producto.entity';
import { PedidoEntity } from '../models/pedido.entity';
import { DetallePedidoEntity } from '../models/detalle-pedido.entity';

/**
 * Helpers para simular el DataSource/QueryRunner de TypeORM.
 * Mantenemos la firma mínima que usa el servicio.
 */
interface MockQueryRunner {
    connect: jest.Mock;
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    rollbackTransaction: jest.Mock;
    release: jest.Mock;
    manager: {
        findOne: jest.Mock;
        save: jest.Mock;
        getRepository: jest.Mock;
    };
}

const productoMock = (over: Partial<ProductoEntity> = {}): ProductoEntity => ({
    id_producto: over.id_producto ?? '11111111-1111-1111-1111-111111111111',
    nombre_producto: over.nombre_producto ?? 'Caja genérica',
    stock: over.stock ?? 100,
    precio_unitario: over.precio_unitario ?? 50,
    peso_kg: over.peso_kg ?? 2,
    volumen_m3: over.volumen_m3 ?? 0.1,
    temperatura_minima: 0,
    temperatura_maxima: 25,
    id_proveedor: null,
    activo: true,
    id_region: 'NORTE',
    fecha_actualizacion: new Date()
} as ProductoEntity);

const buildMockQueryRunner = (): MockQueryRunner => {
    const createdDetalles: DetallePedidoEntity[] = [];
    const pedidoRepo = {
        create: jest.fn((data: Partial<PedidoEntity>) => ({
            id_pedido: 'pedido-generado-uuid',
            ...data
        } as PedidoEntity)),
        save: jest.fn(async (p: PedidoEntity) => p)
    };
    const detalleRepo = {
        create: jest.fn((data: Partial<DetallePedidoEntity>) => {
            const det = { id_detalle: `det-${createdDetalles.length}`, ...data } as DetallePedidoEntity;
            createdDetalles.push(det);
            return det;
        }),
        save: jest.fn(async (list: DetallePedidoEntity[]) => list)
    };
    return {
        connect: jest.fn().mockResolvedValue(undefined),
        startTransaction: jest.fn().mockResolvedValue(undefined),
        commitTransaction: jest.fn().mockResolvedValue(undefined),
        rollbackTransaction: jest.fn().mockResolvedValue(undefined),
        release: jest.fn().mockResolvedValue(undefined),
        manager: {
            findOne: jest.fn(),
            save: jest.fn(async (_entity: unknown, data: unknown) => data),
            getRepository: jest.fn((entity: unknown) => {
                if (entity === PedidoEntity) return pedidoRepo;
                if (entity === DetallePedidoEntity) return detalleRepo;
                throw new Error('Repositorio no mockeado');
            })
        }
    };
};

const buildDataSourceMock = (qr: MockQueryRunner) => ({
    createQueryRunner: jest.fn(() => qr)
});

const dtoValido = (): CrearPedidoDTO => ({
    id_cliente: '22222222-2222-2222-2222-222222222222',
    items: [
        { id_producto: '11111111-1111-1111-1111-111111111111', cantidad: 3 }
    ]
});

describe('PedidoService.crearPedido', () => {
    describe('[Camino feliz]', () => {
        it('procesa el pedido, hace commit y devuelve el PedidoView con métricas', async () => {
            const qr = buildMockQueryRunner();
            qr.manager.findOne.mockResolvedValue(productoMock({ peso_kg: 2, volumen_m3: 0.1, stock: 10, precio_unitario: 50 }));

            const flotilla: FlotillaFacadeLike = {
                obtenerCapacidadMaximaCamion: jest.fn().mockResolvedValue({ capacidad_carga: 1000, capacidad_volumen: 20 })
            };

            const service = new PedidoService({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                dataSource: buildDataSourceMock(qr) as any,
                flotilla,
                regionId: 'NORTE',
                now: () => new Date('2026-04-17T12:00:00Z')
            });

            const view = await service.crearPedido(dtoValido());

            expect(qr.startTransaction).toHaveBeenCalledTimes(1);
            expect(qr.commitTransaction).toHaveBeenCalledTimes(1);
            expect(qr.rollbackTransaction).not.toHaveBeenCalled();
            expect(qr.release).toHaveBeenCalledTimes(1);
            expect(qr.manager.findOne).toHaveBeenCalledWith(
                ProductoEntity,
                expect.objectContaining({ lock: { mode: 'pessimistic_write' } })
            );
            expect(flotilla.obtenerCapacidadMaximaCamion).toHaveBeenCalledWith('NORTE');
            expect(view.total).toBe(150);
            expect(view.metricas.peso_total_kg).toBe(6);
            expect(view.metricas.volumen_total_m3).toBe(0.3);
            expect(view.detalles).toHaveLength(1);
        });
    });

    describe('[Regla 1 - Stock insuficiente]', () => {
        it('aborta la transacción con rollback cuando un producto no tiene stock', async () => {
            const qr = buildMockQueryRunner();
            qr.manager.findOne.mockResolvedValue(productoMock({ stock: 1 }));

            const flotilla: FlotillaFacadeLike = {
                obtenerCapacidadMaximaCamion: jest.fn()
            };

            const service = new PedidoService({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                dataSource: buildDataSourceMock(qr) as any,
                flotilla,
                regionId: 'NORTE'
            });

            await expect(service.crearPedido(dtoValido())).rejects.toMatchObject({
                statusCode: 400,
                code: 'STOCK_INSUFICIENTE'
            });

            expect(qr.rollbackTransaction).toHaveBeenCalledTimes(1);
            expect(qr.commitTransaction).not.toHaveBeenCalled();
            expect(qr.release).toHaveBeenCalledTimes(1);
            expect(flotilla.obtenerCapacidadMaximaCamion).not.toHaveBeenCalled();
        });
    });

    describe('[Regla 2 - Capacidad física]', () => {
        it('aborta con 422 cuando el peso total excede la capacidad de la flota regional', async () => {
            const qr = buildMockQueryRunner();
            qr.manager.findOne.mockResolvedValue(productoMock({ peso_kg: 500, stock: 10 }));

            const flotilla: FlotillaFacadeLike = {
                obtenerCapacidadMaximaCamion: jest.fn().mockResolvedValue({ capacidad_carga: 1000, capacidad_volumen: 50 })
            };

            const service = new PedidoService({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                dataSource: buildDataSourceMock(qr) as any,
                flotilla,
                regionId: 'NORTE'
            });

            // 3 unidades * 500 kg = 1500 kg > 1000 kg
            await expect(service.crearPedido(dtoValido())).rejects.toMatchObject({
                statusCode: 422,
                code: 'CAPACIDAD_EXCEDIDA'
            });

            expect(qr.rollbackTransaction).toHaveBeenCalledTimes(1);
            expect(qr.commitTransaction).not.toHaveBeenCalled();
        });

        it('aborta con 422 cuando no hay camiones activos en la región', async () => {
            const qr = buildMockQueryRunner();
            qr.manager.findOne.mockResolvedValue(productoMock());

            const flotilla: FlotillaFacadeLike = {
                obtenerCapacidadMaximaCamion: jest.fn().mockResolvedValue(null)
            };

            const service = new PedidoService({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                dataSource: buildDataSourceMock(qr) as any,
                flotilla,
                regionId: 'SUR'
            });

            await expect(service.crearPedido(dtoValido())).rejects.toMatchObject({
                statusCode: 422,
                code: 'CAPACIDAD_EXCEDIDA'
            });
            expect(qr.rollbackTransaction).toHaveBeenCalledTimes(1);
        });
    });

    describe('[Producto no encontrado]', () => {
        it('retorna 404 si un id_producto no existe', async () => {
            const qr = buildMockQueryRunner();
            qr.manager.findOne.mockResolvedValue(null);

            const flotilla: FlotillaFacadeLike = {
                obtenerCapacidadMaximaCamion: jest.fn()
            };

            const service = new PedidoService({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                dataSource: buildDataSourceMock(qr) as any,
                flotilla,
                regionId: 'NORTE'
            });

            await expect(service.crearPedido(dtoValido())).rejects.toMatchObject({
                statusCode: 404,
                code: 'NOT_FOUND'
            });

            expect(qr.rollbackTransaction).toHaveBeenCalledTimes(1);
        });
    });
});
