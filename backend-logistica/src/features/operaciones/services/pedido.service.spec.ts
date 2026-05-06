import { PedidoService, FlotillaFacadeLike } from './pedido.service';
import { CrearPedidoDTO } from '../dto/crear-pedido.dto';
import { ProductoEntity } from '../models/producto.entity';
import { PedidoEntity } from '../models/pedido.entity';
import { ViajeEntity } from '../models/viaje.entity';
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

const buildDataSourceMock = (qr: MockQueryRunner, repoData?: {
    pedidos?: PedidoEntity[];
    detalles?: unknown[];
}) => ({
    createQueryRunner: jest.fn(() => qr),
    getRepository: jest.fn((entity: unknown) => {
        if (entity === PedidoEntity) {
            return {
                findOne: jest.fn().mockResolvedValue(repoData?.pedidos?.[0] ?? null),
                find: jest.fn().mockResolvedValue(repoData?.pedidos ?? [])
            };
        }
        if (entity === DetallePedidoEntity) {
            return {
                find: jest.fn().mockResolvedValue(repoData?.detalles ?? [])
            };
        }
        return {};
    })
});

const buildFlotillaMockOK = (
    overrides: Partial<FlotillaFacadeLike> = {}
): FlotillaFacadeLike => ({
    obtenerCapacidadMaximaCamion: jest.fn().mockResolvedValue({ capacidad_carga: 1000, capacidad_volumen: 20 }),
    validarClienteParaRegion: jest.fn().mockResolvedValue({ estado: 'OK' }),
    ...overrides
});

const dtoValido = (over: Partial<CrearPedidoDTO> = {}): CrearPedidoDTO => ({
    id_cliente: '22222222-2222-2222-2222-222222222222',
    items: [
        { id_producto: '11111111-1111-1111-1111-111111111111', cantidad: 3 }
    ],
    ...over
});

describe('PedidoService.crearPedido', () => {
    describe('[Camino feliz]', () => {
        it('procesa el pedido, hace commit y devuelve el PedidoView con métricas, estado EN_COLA y prioridad NORMAL por defecto', async () => {
            const qr = buildMockQueryRunner();
            qr.manager.findOne.mockResolvedValue(productoMock({ peso_kg: 2, volumen_m3: 0.1, stock: 10, precio_unitario: 50 }));

            const flotilla = buildFlotillaMockOK();

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
            expect(flotilla.validarClienteParaRegion).toHaveBeenCalledWith(
                '22222222-2222-2222-2222-222222222222',
                'NORTE'
            );
            expect(flotilla.obtenerCapacidadMaximaCamion).toHaveBeenCalledWith('NORTE');
            expect(view.total).toBe(150);
            expect(view.metricas.peso_total_kg).toBe(6);
            expect(view.metricas.volumen_total_m3).toBe(0.3);
            expect(view.descripcion_status).toBe('EN_COLA');
            expect(view.prioridad).toBe('NORMAL');
            expect(view.detalles).toHaveLength(1);
        });

        it('persiste prioridad ALTA cuando se especifica en el DTO', async () => {
            const qr = buildMockQueryRunner();
            qr.manager.findOne.mockResolvedValue(productoMock());

            const flotilla = buildFlotillaMockOK();
            const service = new PedidoService({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                dataSource: buildDataSourceMock(qr) as any,
                flotilla,
                regionId: 'NORTE'
            });

            const view = await service.crearPedido(dtoValido({ prioridad: 'ALTA' }));

            expect(view.prioridad).toBe('ALTA');
        });

        it('persiste peso_total y volumen_total calculados en la entidad Pedido', async () => {
            const qr = buildMockQueryRunner();
            qr.manager.findOne.mockResolvedValue(productoMock({ peso_kg: 2.5, volumen_m3: 0.2, stock: 50 }));

            const flotilla = buildFlotillaMockOK();
            const service = new PedidoService({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                dataSource: buildDataSourceMock(qr) as any,
                flotilla,
                regionId: 'NORTE'
            });

            await service.crearPedido(dtoValido());

            const pedidoRepo = qr.manager.getRepository(PedidoEntity);
            // 3 unidades × 2.5 kg = 7.5 ; 3 × 0.2 = 0.6
            expect(pedidoRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    peso_total: 7.5,
                    volumen_total: 0.6,
                    descripcion_status: 'EN_COLA',
                    prioridad: 'NORMAL'
                })
            );
        });
    });

    describe('[Regla 0 - Cliente]', () => {
        it('retorna 404 cuando el cliente no existe o está inactivo (sin abrir transacción)', async () => {
            const qr = buildMockQueryRunner();
            const flotilla = buildFlotillaMockOK({
                validarClienteParaRegion: jest.fn().mockResolvedValue({ estado: 'NO_ENCONTRADO' })
            });

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

            // El servicio debe fallar rápido: no abre transacción ni consulta productos.
            expect(qr.startTransaction).not.toHaveBeenCalled();
            expect(qr.manager.findOne).not.toHaveBeenCalled();
            expect(flotilla.obtenerCapacidadMaximaCamion).not.toHaveBeenCalled();
        });

        it('retorna 403 cuando el cliente pertenece a otra región', async () => {
            const qr = buildMockQueryRunner();
            const flotilla = buildFlotillaMockOK({
                validarClienteParaRegion: jest.fn().mockResolvedValue({
                    estado: 'REGION_INCORRECTA',
                    id_region_cliente: 'SUR'
                })
            });

            const service = new PedidoService({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                dataSource: buildDataSourceMock(qr) as any,
                flotilla,
                regionId: 'NORTE'
            });

            await expect(service.crearPedido(dtoValido())).rejects.toMatchObject({
                statusCode: 403,
                code: 'FORBIDDEN'
            });

            expect(qr.startTransaction).not.toHaveBeenCalled();
            expect(flotilla.obtenerCapacidadMaximaCamion).not.toHaveBeenCalled();
        });
    });

    describe('[Regla 1 - Stock insuficiente]', () => {
        it('aborta la transacción con rollback cuando un producto no tiene stock', async () => {
            const qr = buildMockQueryRunner();
            qr.manager.findOne.mockResolvedValue(productoMock({ stock: 1 }));

            const flotilla = buildFlotillaMockOK();

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

            const flotilla = buildFlotillaMockOK({
                obtenerCapacidadMaximaCamion: jest.fn().mockResolvedValue({ capacidad_carga: 1000, capacidad_volumen: 50 })
            });

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

        it('aborta con 422 cuando el volumen total excede la capacidad volumétrica de la flota', async () => {
            const qr = buildMockQueryRunner();
            qr.manager.findOne.mockResolvedValue(productoMock({ peso_kg: 1, volumen_m3: 20, stock: 10 }));

            const flotilla = buildFlotillaMockOK({
                obtenerCapacidadMaximaCamion: jest.fn().mockResolvedValue({ capacidad_carga: 1000, capacidad_volumen: 50 })
            });

            const service = new PedidoService({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                dataSource: buildDataSourceMock(qr) as any,
                flotilla,
                regionId: 'NORTE'
            });

            // 3 unidades * 20 m3 = 60 m3 > 50 m3
            await expect(service.crearPedido(dtoValido())).rejects.toMatchObject({
                statusCode: 422,
                code: 'CAPACIDAD_EXCEDIDA'
            });
            expect(qr.rollbackTransaction).toHaveBeenCalledTimes(1);
        });

        it('aborta con 422 cuando no hay camiones activos en la región', async () => {
            const qr = buildMockQueryRunner();
            qr.manager.findOne.mockResolvedValue(productoMock());

            const flotilla = buildFlotillaMockOK({
                obtenerCapacidadMaximaCamion: jest.fn().mockResolvedValue(null)
            });

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

            const flotilla = buildFlotillaMockOK();

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

    describe('[Descuento de stock]', () => {
        it('descuenta la cantidad pedida del stock de cada producto dentro de la transacción', async () => {
            const qr = buildMockQueryRunner();
            const producto = productoMock({ stock: 10 });
            qr.manager.findOne.mockResolvedValue(producto);

            const flotilla = buildFlotillaMockOK();
            const service = new PedidoService({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                dataSource: buildDataSourceMock(qr) as any,
                flotilla,
                regionId: 'NORTE'
            });

            await service.crearPedido(dtoValido());

            // stock inicial 10 - cantidad 3 = 7
            expect(producto.stock).toBe(7);
            expect(qr.manager.save).toHaveBeenCalledWith(
                ProductoEntity,
                expect.objectContaining({ stock: 7 })
            );
        });
    });
});

const uuid = (n: number) => `${String(n).padStart(8, '0')}-0000-0000-0000-000000000000`;

const pedidoEntityFake = (over: Partial<PedidoEntity> = {}): PedidoEntity => ({
    id_pedido: uuid(1),
    id_cliente: uuid(50),
    total: 100,
    hora_pedido: new Date('2026-04-21T09:00:00Z'),
    descripcion_status: 'EN_COLA',
    hora_entrega: null,
    descripcion: null,
    id_viaje: null,
    id_region: 'NORTE',
    prioridad: 'NORMAL',
    peso_total: 5,
    volumen_total: 0.2,
    fecha_actualizacion: new Date(),
    ...over
} as PedidoEntity);

describe('PedidoService.listarPedidos', () => {
    const buildService = (pedidos: PedidoEntity[]) => {
        const qr = { connect: jest.fn(), startTransaction: jest.fn(), manager: {} } as unknown as MockQueryRunner;
        const ds = buildDataSourceMock(qr, { pedidos });
        return new PedidoService({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            dataSource: ds as any,
            flotilla: {} as FlotillaFacadeLike,
            regionId: 'NORTE'
        });
    };

    it('retorna lista de PedidoResumen sin filtro', async () => {
        const service = buildService([pedidoEntityFake(), pedidoEntityFake({ id_pedido: uuid(2) })]);
        const result = await service.listarPedidos();
        expect(result).toHaveLength(2);
        expect(result[0]).not.toHaveProperty('detalles');
        expect(result[0].peso_total_kg).toBe(5);
    });

    it('retorna array vacío cuando no hay pedidos', async () => {
        const service = buildService([]);
        const result = await service.listarPedidos();
        expect(result).toEqual([]);
    });
});

describe('PedidoService.obtenerPedido', () => {
    it('retorna PedidoView con detalles cuando el pedido existe', async () => {
        const pedido = pedidoEntityFake();
        const qr = { connect: jest.fn(), startTransaction: jest.fn(), manager: {} } as unknown as MockQueryRunner;
        const ds = buildDataSourceMock(qr, { pedidos: [pedido], detalles: [] });
        const service = new PedidoService({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            dataSource: ds as any,
            flotilla: {} as FlotillaFacadeLike,
            regionId: 'NORTE'
        });

        const result = await service.obtenerPedido(uuid(1));
        expect(result.id_pedido).toBe(uuid(1));
        expect(result.detalles).toBeDefined();
    });

    it('404 cuando el pedido no existe', async () => {
        const qr = { connect: jest.fn(), startTransaction: jest.fn(), manager: {} } as unknown as MockQueryRunner;
        const ds = buildDataSourceMock(qr, { pedidos: [] });
        const service = new PedidoService({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            dataSource: ds as any,
            flotilla: {} as FlotillaFacadeLike,
            regionId: 'NORTE'
        });

        await expect(service.obtenerPedido(uuid(99)))
            .rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
    });
});

const buildEntregaQr = (over: {
    pedido?: Record<string, unknown> | null;
    viaje?: Record<string, unknown> | null;
    pendientes?: number;
}) => {
    const pedidoRow = over.pedido !== undefined ? over.pedido : {
        id_pedido: uuid(1), descripcion_status: 'EN_RUTA', id_viaje: uuid(10)
    };
    const viajeRow = over.viaje !== undefined ? over.viaje : { status: 'EN_CAMINO' };
    const pendientes = over.pendientes ?? 0;

    const qr = {
        connect: jest.fn().mockResolvedValue(undefined),
        startTransaction: jest.fn().mockResolvedValue(undefined),
        commitTransaction: jest.fn().mockResolvedValue(undefined),
        rollbackTransaction: jest.fn().mockResolvedValue(undefined),
        release: jest.fn().mockResolvedValue(undefined),
        query: jest.fn().mockImplementation((sql: string) => {
            if (sql.includes('FROM pedidos') && sql.includes('FOR UPDATE')) {
                return Promise.resolve(pedidoRow ? [pedidoRow] : []);
            }
            if (sql.includes('FROM viajes') && sql.includes('FOR UPDATE')) {
                return Promise.resolve(viajeRow ? [viajeRow] : []);
            }
            if (sql.includes('COUNT')) {
                return Promise.resolve([{ c: pendientes }]);
            }
            return Promise.resolve([]);
        }),
        manager: { update: jest.fn().mockResolvedValue({ affected: 1 }) }
    };
    return qr;
};

describe('PedidoService.confirmarEntrega', () => {
    const AHORA = new Date('2026-04-21T12:00:00Z');

    const buildService = (qr: ReturnType<typeof buildEntregaQr>) => {
        const ds = { createQueryRunner: jest.fn().mockReturnValue(qr) };
        return new PedidoService({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            dataSource: ds as any,
            flotilla: {} as FlotillaFacadeLike,
            regionId: 'NORTE',
            now: () => AHORA
        });
    };

    describe('[Camino feliz]', () => {
        it('retorna ENTREGADO con hora_entrega y viaje_completado=false cuando quedan pendientes', async () => {
            const qr = buildEntregaQr({ pendientes: 1 });
            const result = await buildService(qr).confirmarEntrega(uuid(1));

            expect(result.descripcion_status).toBe('ENTREGADO');
            expect(result.hora_entrega).toBe(AHORA.toISOString());
            expect(result.id_viaje).toBe(uuid(10));
            expect(result.viaje_completado).toBe(false);
            expect(qr.commitTransaction).toHaveBeenCalledTimes(1);

            // Solo actualiza el pedido, no el viaje
            expect(qr.manager.update).toHaveBeenCalledTimes(1);
            expect(qr.manager.update).toHaveBeenCalledWith(
                PedidoEntity, { id_pedido: uuid(1) },
                expect.objectContaining({ descripcion_status: 'ENTREGADO' })
            );
        });

        it('marca el viaje como COMPLETADO y viaje_completado=true cuando era el último pedido', async () => {
            const qr = buildEntregaQr({ pendientes: 0 });
            const result = await buildService(qr).confirmarEntrega(uuid(1));

            expect(result.viaje_completado).toBe(true);
            expect(qr.manager.update).toHaveBeenCalledTimes(2);
            expect(qr.manager.update).toHaveBeenCalledWith(
                ViajeEntity, { id_viaje: uuid(10) },
                expect.objectContaining({ status: 'COMPLETADO', hora_llegada: AHORA })
            );
        });

        it('acepta viaje en estado EN_ENTREGA además de EN_CAMINO', async () => {
            const qr = buildEntregaQr({ viaje: { status: 'EN_ENTREGA' } });
            const result = await buildService(qr).confirmarEntrega(uuid(1));

            expect(result.descripcion_status).toBe('ENTREGADO');
            expect(qr.rollbackTransaction).not.toHaveBeenCalled();
        });
    });

    describe('[Validaciones]', () => {
        it('404 cuando el pedido no existe', async () => {
            const qr = buildEntregaQr({ pedido: null });
            await expect(buildService(qr).confirmarEntrega(uuid(1)))
                .rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
            expect(qr.rollbackTransaction).toHaveBeenCalledTimes(1);
        });

        it('409 cuando el pedido no está en EN_RUTA', async () => {
            const qr = buildEntregaQr({
                pedido: { id_pedido: uuid(1), descripcion_status: 'ASIGNADO', id_viaje: uuid(10) }
            });
            await expect(buildService(qr).confirmarEntrega(uuid(1)))
                .rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT' });
        });

        it('409 cuando el viaje no está en EN_CAMINO ni EN_ENTREGA', async () => {
            const qr = buildEntregaQr({ viaje: { status: 'CARGANDO' } });
            await expect(buildService(qr).confirmarEntrega(uuid(1)))
                .rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT' });
        });

        it('409 cuando el pedido no tiene viaje asignado', async () => {
            const qr = buildEntregaQr({
                pedido: { id_pedido: uuid(1), descripcion_status: 'EN_RUTA', id_viaje: null }
            });
            await expect(buildService(qr).confirmarEntrega(uuid(1)))
                .rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT' });
        });
    });
});
