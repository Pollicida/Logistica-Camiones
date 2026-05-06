import { ViajeService } from './viaje.service';
import { ViajeEntity, ViajeStatus } from '../models/viaje.entity';
import { PedidoEntity } from '../models/pedido.entity';
import { CrearViajeDTO } from '../dto/crear-viaje.dto';

/**
 * Mock de QueryRunner que despacha qr.query según el fragmento SQL,
 * y expone métodos TypeORM (getRepository/update/findOne/save) con jest.fn.
 */
interface QueryDispatcher {
    pedidos?: unknown[];
    camion?: unknown | null;
    conductor?: unknown | null;
    viajesCamionCount?: number;
    viajesConductorCount?: number;
}

interface MockQueryRunner {
    connect: jest.Mock;
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    rollbackTransaction: jest.Mock;
    release: jest.Mock;
    query: jest.Mock;
    manager: {
        getRepository: jest.Mock;
        update: jest.Mock;
        findOne: jest.Mock;
        save: jest.Mock;
    };
}

const uuid = (n: number) => `${String(n).padStart(8, '0')}-0000-0000-0000-000000000000`;

const pedidoRow = (over: Record<string, unknown> = {}) => ({
    id_pedido: uuid(1),
    id_cliente: uuid(50),
    descripcion_status: 'EN_COLA',
    prioridad: 'NORMAL',
    peso_total: 10,
    volumen_total: 0.5,
    id_region: 'NORTE',
    id_viaje: null,
    ...over
});

const camionRow = (over: Record<string, unknown> = {}) => ({
    id_camion: uuid(100),
    marca: 'Volvo',
    modelo: 'FH16',
    placas: 'ABC-001',
    capacidad_carga: 1000,
    capacidad_volumen: 50,
    activo: true,
    id_region: 'NORTE',
    ...over
});

const conductorRow = (over: Record<string, unknown> = {}) => ({
    id_conductor: uuid(200),
    nombres: 'Juan',
    apellido_paterno: 'Pérez',
    apellido_materno: 'López',
    telefono: '555-0001',
    activo: true,
    id_region: 'NORTE',
    ...over
});

const buildMockQueryRunner = (dispatch: QueryDispatcher = {}): MockQueryRunner => {
    const savedViajes: ViajeEntity[] = [];
    const viajeRepo = {
        create: jest.fn((data: Partial<ViajeEntity>) => ({ ...data } as ViajeEntity)),
        save: jest.fn(async (v: ViajeEntity) => {
            // TypeORM normalmente añade fecha_actualizacion (@UpdateDateColumn) en el save.
            const saved = { ...v, fecha_actualizacion: v.fecha_actualizacion ?? new Date() } as ViajeEntity;
            savedViajes.push(saved);
            return saved;
        })
    };

    const query = jest.fn(async (sql: string) => {
        const s = sql.toLowerCase();
        if (s.includes('from pedidos')) return dispatch.pedidos ?? [];
        if (s.includes('from camiones')) return dispatch.camion === null || dispatch.camion === undefined
            ? []
            : [dispatch.camion];
        if (s.includes('from conductores')) return dispatch.conductor === null || dispatch.conductor === undefined
            ? []
            : [dispatch.conductor];
        if (s.includes('from viajes') && s.includes('id_camion')) {
            return [{ c: dispatch.viajesCamionCount ?? 0 }];
        }
        if (s.includes('from viajes') && s.includes('id_conductor')) {
            return [{ c: dispatch.viajesConductorCount ?? 0 }];
        }
        return [];
    });

    return {
        connect: jest.fn().mockResolvedValue(undefined),
        startTransaction: jest.fn().mockResolvedValue(undefined),
        commitTransaction: jest.fn().mockResolvedValue(undefined),
        rollbackTransaction: jest.fn().mockResolvedValue(undefined),
        release: jest.fn().mockResolvedValue(undefined),
        query,
        manager: {
            getRepository: jest.fn((entity: unknown) => {
                if (entity === ViajeEntity) return viajeRepo;
                throw new Error('Repositorio no mockeado');
            }),
            update: jest.fn().mockResolvedValue({ affected: 1 }),
            findOne: jest.fn(),
            save: jest.fn(async (_entity: unknown, data: unknown) => data)
        }
    };
};

// dataSource stub: se usa tanto para createQueryRunner como para obtener()/listar()
interface MockDataSource {
    createQueryRunner: jest.Mock;
    query: jest.Mock;
    getRepository: jest.Mock;
}

const buildMockDataSource = (qr: MockQueryRunner, findOneResult: ViajeEntity | null = null): MockDataSource => ({
    createQueryRunner: jest.fn(() => qr),
    query: jest.fn().mockResolvedValue([]),
    getRepository: jest.fn(() => ({
        findOne: jest.fn().mockResolvedValue(findOneResult),
        find: jest.fn().mockResolvedValue([])
    }))
});

const dtoValido = (over: Partial<CrearViajeDTO> = {}): CrearViajeDTO => ({
    id_pedidos: [uuid(1)],
    id_camion: uuid(100),
    id_conductor: uuid(200),
    ...over
});

describe('ViajeService.crear', () => {
    describe('[Camino feliz]', () => {
        it('crea viaje en estado CARGANDO, genera numero_guia con primeros 8 chars, y pasa pedidos a ASIGNADO', async () => {
            const qr = buildMockQueryRunner({
                pedidos: [pedidoRow()],
                camion: camionRow(),
                conductor: conductorRow()
            });
            const ds = buildMockDataSource(qr);

            const service = new ViajeService({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                dataSource: ds as any,
                regionId: 'NORTE',
                now: () => new Date('2026-04-21T10:00:00Z')
            });

            const view = await service.crear(dtoValido());

            expect(qr.startTransaction).toHaveBeenCalledTimes(1);
            expect(qr.commitTransaction).toHaveBeenCalledTimes(1);
            expect(qr.rollbackTransaction).not.toHaveBeenCalled();
            expect(qr.release).toHaveBeenCalledTimes(1);

            expect(view.status).toBe('CARGANDO');
            expect(view.id_region).toBe('NORTE');
            expect(view.numero_guia).toMatch(/^VIAJE-[0-9a-f]{8}$/);
            expect(view.numero_guia!.length).toBe('VIAJE-'.length + 8);
            expect(view.pedidos).toHaveLength(1);
            expect(view.pedidos![0].descripcion_status).toBe('ASIGNADO');
            expect(view.camion!.placas).toBe('ABC-001');
            expect(view.conductor!.nombre_completo).toBe('Juan Pérez López');

            // Actualización de pedidos: estado ASIGNADO + id_viaje vinculado
            expect(qr.manager.update).toHaveBeenCalledWith(
                PedidoEntity,
                expect.objectContaining({ id_pedido: expect.anything() }),
                expect.objectContaining({ descripcion_status: 'ASIGNADO' })
            );
        });

        it('valida capacidad con totales calculados de múltiples pedidos', async () => {
            const qr = buildMockQueryRunner({
                pedidos: [
                    pedidoRow({ id_pedido: uuid(1), peso_total: 100, volumen_total: 2 }),
                    pedidoRow({ id_pedido: uuid(2), peso_total: 150, volumen_total: 3 })
                ],
                camion: camionRow({ capacidad_carga: 300, capacidad_volumen: 10 }),
                conductor: conductorRow()
            });
            const ds = buildMockDataSource(qr);

            const service = new ViajeService({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                dataSource: ds as any,
                regionId: 'NORTE'
            });

            const view = await service.crear(dtoValido({ id_pedidos: [uuid(1), uuid(2)] }));
            // 250kg <= 300kg y 5m3 <= 10m3: OK
            expect(view.status).toBe('CARGANDO');
            expect(view.pedidos).toHaveLength(2);
        });
    });

    describe('[Validación de pedidos]', () => {
        it('404 cuando un pedido no existe', async () => {
            const qr = buildMockQueryRunner({
                pedidos: [pedidoRow({ id_pedido: uuid(1) })] // faltan el 2
            });
            const ds = buildMockDataSource(qr);

            const service = new ViajeService({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                dataSource: ds as any,
                regionId: 'NORTE'
            });

            await expect(service.crear(dtoValido({ id_pedidos: [uuid(1), uuid(2)] })))
                .rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
            expect(qr.rollbackTransaction).toHaveBeenCalledTimes(1);
            expect(qr.commitTransaction).not.toHaveBeenCalled();
        });

        it('409 cuando un pedido no está en EN_COLA', async () => {
            const qr = buildMockQueryRunner({
                pedidos: [pedidoRow({ descripcion_status: 'ASIGNADO' })]
            });
            const ds = buildMockDataSource(qr);
            const service = new ViajeService({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                dataSource: ds as any,
                regionId: 'NORTE'
            });

            await expect(service.crear(dtoValido()))
                .rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT' });
        });

        it('403 cuando un pedido pertenece a otra región', async () => {
            const qr = buildMockQueryRunner({
                pedidos: [pedidoRow({ id_region: 'SUR' })]
            });
            const ds = buildMockDataSource(qr);
            const service = new ViajeService({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                dataSource: ds as any,
                regionId: 'NORTE'
            });

            await expect(service.crear(dtoValido()))
                .rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
        });
    });

    describe('[Validación de camión]', () => {
        it('404 cuando el camión no existe', async () => {
            const qr = buildMockQueryRunner({
                pedidos: [pedidoRow()],
                camion: null
            });
            const ds = buildMockDataSource(qr);
            const service = new ViajeService({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                dataSource: ds as any,
                regionId: 'NORTE'
            });

            await expect(service.crear(dtoValido()))
                .rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
        });

        it('404 cuando el camión está inactivo', async () => {
            const qr = buildMockQueryRunner({
                pedidos: [pedidoRow()],
                camion: camionRow({ activo: false })
            });
            const ds = buildMockDataSource(qr);
            const service = new ViajeService({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                dataSource: ds as any,
                regionId: 'NORTE'
            });

            await expect(service.crear(dtoValido()))
                .rejects.toMatchObject({ statusCode: 404 });
        });

        it('403 cuando el camión pertenece a otra región', async () => {
            const qr = buildMockQueryRunner({
                pedidos: [pedidoRow()],
                camion: camionRow({ id_region: 'SUR' })
            });
            const ds = buildMockDataSource(qr);
            const service = new ViajeService({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                dataSource: ds as any,
                regionId: 'NORTE'
            });

            await expect(service.crear(dtoValido()))
                .rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
        });

        it('422 cuando el peso total excede la capacidad del camión', async () => {
            const qr = buildMockQueryRunner({
                pedidos: [pedidoRow({ peso_total: 2000 })],
                camion: camionRow({ capacidad_carga: 1000 })
            });
            const ds = buildMockDataSource(qr);
            const service = new ViajeService({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                dataSource: ds as any,
                regionId: 'NORTE'
            });

            await expect(service.crear(dtoValido()))
                .rejects.toMatchObject({ statusCode: 422, code: 'CAPACIDAD_EXCEDIDA' });
        });

        it('422 cuando el volumen total excede la capacidad volumétrica', async () => {
            const qr = buildMockQueryRunner({
                pedidos: [pedidoRow({ peso_total: 10, volumen_total: 80 })],
                camion: camionRow({ capacidad_carga: 1000, capacidad_volumen: 50 })
            });
            const ds = buildMockDataSource(qr);
            const service = new ViajeService({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                dataSource: ds as any,
                regionId: 'NORTE'
            });

            await expect(service.crear(dtoValido()))
                .rejects.toMatchObject({ statusCode: 422, code: 'CAPACIDAD_EXCEDIDA' });
        });

        it('409 cuando el camión ya tiene un viaje activo', async () => {
            const qr = buildMockQueryRunner({
                pedidos: [pedidoRow()],
                camion: camionRow(),
                viajesCamionCount: 1
            });
            const ds = buildMockDataSource(qr);
            const service = new ViajeService({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                dataSource: ds as any,
                regionId: 'NORTE'
            });

            await expect(service.crear(dtoValido()))
                .rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT' });
        });

        it('acepta camión sin capacidad_volumen definida', async () => {
            const qr = buildMockQueryRunner({
                pedidos: [pedidoRow({ volumen_total: 99 })],
                camion: camionRow({ capacidad_volumen: null }),
                conductor: conductorRow()
            });
            const ds = buildMockDataSource(qr);
            const service = new ViajeService({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                dataSource: ds as any,
                regionId: 'NORTE'
            });

            const view = await service.crear(dtoValido());
            expect(view.status).toBe('CARGANDO');
            expect(view.camion!.capacidad_volumen_m3).toBeNull();
        });
    });

    describe('[Validación de conductor]', () => {
        it('404 cuando el conductor no existe', async () => {
            const qr = buildMockQueryRunner({
                pedidos: [pedidoRow()],
                camion: camionRow(),
                conductor: null
            });
            const ds = buildMockDataSource(qr);
            const service = new ViajeService({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                dataSource: ds as any,
                regionId: 'NORTE'
            });

            await expect(service.crear(dtoValido()))
                .rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
        });

        it('403 cuando el conductor pertenece a otra región', async () => {
            const qr = buildMockQueryRunner({
                pedidos: [pedidoRow()],
                camion: camionRow(),
                conductor: conductorRow({ id_region: 'SUR' })
            });
            const ds = buildMockDataSource(qr);
            const service = new ViajeService({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                dataSource: ds as any,
                regionId: 'NORTE'
            });

            await expect(service.crear(dtoValido()))
                .rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
        });

        it('409 cuando el conductor ya tiene un viaje activo', async () => {
            const qr = buildMockQueryRunner({
                pedidos: [pedidoRow()],
                camion: camionRow(),
                conductor: conductorRow(),
                viajesConductorCount: 1
            });
            const ds = buildMockDataSource(qr);
            const service = new ViajeService({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                dataSource: ds as any,
                regionId: 'NORTE'
            });

            await expect(service.crear(dtoValido()))
                .rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT' });
        });
    });
});

describe('ViajeService.iniciar', () => {
    const viajeEn = (status: ViajeStatus): ViajeEntity => ({
        id_viaje: uuid(1),
        id_conductor: uuid(200),
        id_camion: uuid(100),
        id_ruta: null,
        numero_guia: `VIAJE-${uuid(1).substring(0, 8)}`,
        hora_salida: null,
        hora_llegada: null,
        status,
        id_region: 'NORTE',
        fecha_actualizacion: new Date()
    });

    it('transiciona CARGANDO → EN_CAMINO, registra hora_salida y pone pedidos en EN_RUTA', async () => {
        const qr = buildMockQueryRunner();
        const viajeFinal = viajeEn('EN_CAMINO');
        viajeFinal.hora_salida = new Date('2026-04-21T10:00:00Z');
        qr.manager.findOne.mockResolvedValue(viajeEn('CARGANDO'));

        const ds = buildMockDataSource(qr, viajeFinal);
        const service = new ViajeService({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            dataSource: ds as any,
            regionId: 'NORTE',
            now: () => new Date('2026-04-21T10:00:00Z')
        });

        const view = await service.iniciar(uuid(1));

        expect(view.status).toBe('EN_CAMINO');
        expect(view.hora_salida).toBe('2026-04-21T10:00:00.000Z');
        expect(qr.manager.update).toHaveBeenCalledWith(
            PedidoEntity,
            { id_viaje: uuid(1) },
            { descripcion_status: 'EN_RUTA' }
        );
        expect(qr.commitTransaction).toHaveBeenCalledTimes(1);
    });

    it('404 cuando el viaje no existe', async () => {
        const qr = buildMockQueryRunner();
        qr.manager.findOne.mockResolvedValue(null);
        const ds = buildMockDataSource(qr);

        const service = new ViajeService({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            dataSource: ds as any,
            regionId: 'NORTE'
        });

        await expect(service.iniciar(uuid(1)))
            .rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
        expect(qr.rollbackTransaction).toHaveBeenCalledTimes(1);
    });

    it('409 cuando el viaje no está en CARGANDO', async () => {
        const qr = buildMockQueryRunner();
        qr.manager.findOne.mockResolvedValue(viajeEn('EN_CAMINO'));
        const ds = buildMockDataSource(qr);

        const service = new ViajeService({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            dataSource: ds as any,
            regionId: 'NORTE'
        });

        await expect(service.iniciar(uuid(1)))
            .rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT' });
    });
});

describe('ViajeService.completar', () => {
    const viajeEn = (status: ViajeStatus): ViajeEntity => ({
        id_viaje: uuid(1),
        id_conductor: uuid(200),
        id_camion: uuid(100),
        id_ruta: null,
        numero_guia: `VIAJE-${uuid(1).substring(0, 8)}`,
        hora_salida: new Date('2026-04-21T09:00:00Z'),
        hora_llegada: null,
        status,
        id_region: 'NORTE',
        fecha_actualizacion: new Date()
    });

    it('transiciona EN_CAMINO → COMPLETADO, marca pedidos pendientes como ENTREGADO', async () => {
        const qr = buildMockQueryRunner();
        qr.manager.findOne.mockResolvedValue(viajeEn('EN_CAMINO'));
        const viajeFinal = viajeEn('COMPLETADO');
        viajeFinal.hora_llegada = new Date('2026-04-21T12:00:00Z');
        const ds = buildMockDataSource(qr, viajeFinal);

        const service = new ViajeService({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            dataSource: ds as any,
            regionId: 'NORTE',
            now: () => new Date('2026-04-21T12:00:00Z')
        });

        const view = await service.completar(uuid(1));

        expect(view.status).toBe('COMPLETADO');
        expect(view.hora_llegada).toBe('2026-04-21T12:00:00.000Z');
        const updateCall = qr.manager.update.mock.calls[0];
        expect(updateCall[0]).toBe(PedidoEntity);
        expect(updateCall[1]).toMatchObject({ id_viaje: uuid(1) });
        expect(updateCall[2]).toMatchObject({
            descripcion_status: 'ENTREGADO',
            hora_entrega: expect.any(Date)
        });
    });

    it('permite completar desde EN_ENTREGA', async () => {
        const qr = buildMockQueryRunner();
        qr.manager.findOne.mockResolvedValue(viajeEn('EN_ENTREGA'));
        const ds = buildMockDataSource(qr, viajeEn('COMPLETADO'));

        const service = new ViajeService({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            dataSource: ds as any,
            regionId: 'NORTE'
        });

        const view = await service.completar(uuid(1));
        expect(view.status).toBe('COMPLETADO');
    });

    it('409 cuando el viaje está en CARGANDO (aún no inició)', async () => {
        const qr = buildMockQueryRunner();
        qr.manager.findOne.mockResolvedValue(viajeEn('CARGANDO'));
        const ds = buildMockDataSource(qr);

        const service = new ViajeService({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            dataSource: ds as any,
            regionId: 'NORTE'
        });

        await expect(service.completar(uuid(1)))
            .rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT' });
    });

    it('404 cuando el viaje no existe', async () => {
        const qr = buildMockQueryRunner();
        qr.manager.findOne.mockResolvedValue(null);
        const ds = buildMockDataSource(qr);

        const service = new ViajeService({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            dataSource: ds as any,
            regionId: 'NORTE'
        });

        await expect(service.completar(uuid(1)))
            .rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
    });
});

describe('ViajeService.obtener', () => {
    it('404 cuando el viaje no existe', async () => {
        const qr = buildMockQueryRunner();
        const ds = buildMockDataSource(qr, null);

        const service = new ViajeService({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            dataSource: ds as any,
            regionId: 'NORTE'
        });

        await expect(service.obtener(uuid(1)))
            .rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
    });
});
