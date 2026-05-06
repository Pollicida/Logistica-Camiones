import { AsignacionService, FlotillaAsignacionLike } from './asignacion.service';
import { CamionDisponible, ConductorDisponible, UbicacionCamion } from '../../flotilla';
import { PedidoPrioridad } from '../models/pedido.entity';

interface PedidoRowMock {
    id_pedido: string;
    id_cliente: string;
    nombre_cliente: string;
    latitud: string | number | null;
    longitud: string | number | null;
    peso_total: string | number;
    volumen_total: string | number;
    prioridad: PedidoPrioridad;
    descripcion_status: string;
    id_region: string | null;
}

const pedidoRow = (over: Partial<PedidoRowMock> = {}): PedidoRowMock => ({
    id_pedido: over.id_pedido ?? 'ped-1',
    id_cliente: over.id_cliente ?? 'cli-1',
    nombre_cliente: over.nombre_cliente ?? 'Almacén A',
    latitud: 'latitud' in over ? (over.latitud as string | number | null) : 19.4326,
    longitud: 'longitud' in over ? (over.longitud as string | number | null) : -99.1332,
    peso_total: over.peso_total ?? 10,
    volumen_total: over.volumen_total ?? 0.5,
    prioridad: over.prioridad ?? 'NORMAL',
    descripcion_status: over.descripcion_status ?? 'EN_COLA',
    id_region: over.id_region ?? 'NORTE'
});

const camionMock = (over: Partial<CamionDisponible> = {}): CamionDisponible => ({
    id_camion: over.id_camion ?? 'cam-1',
    marca: over.marca ?? 'Volvo',
    modelo: over.modelo ?? 'FH16',
    placas: over.placas ?? 'ABC-001',
    capacidad_carga: over.capacidad_carga ?? 1000,
    capacidad_volumen: 'capacidad_volumen' in over ? (over.capacidad_volumen as number | null) : 50
});

const conductorMock = (over: Partial<ConductorDisponible> = {}): ConductorDisponible => ({
    id_conductor: over.id_conductor ?? 'con-1',
    nombres: over.nombres ?? 'Juan',
    apellido_paterno: over.apellido_paterno ?? 'Pérez',
    apellido_materno: 'apellido_materno' in over ? (over.apellido_materno as string | null) : 'López',
    telefono: 'telefono' in over ? (over.telefono as string | null) : '555-0001'
});

const buildDataSourceMock = (rows: PedidoRowMock[]) => ({
    query: jest.fn().mockResolvedValue(rows)
});

const buildFlotillaMock = (over: Partial<FlotillaAsignacionLike> = {}): FlotillaAsignacionLike => ({
    listarCamionesDisponiblesParaAsignacion: jest.fn().mockResolvedValue([]),
    listarConductoresDisponibles: jest.fn().mockResolvedValue([]),
    obtenerUltimaUbicacionCamion: jest.fn().mockResolvedValue(null),
    ...over
});

describe('AsignacionService.sugerir', () => {
    describe('[Camino feliz]', () => {
        it('devuelve totales, centroide y camiones ordenados por distancia al centroide', async () => {
            const ds = buildDataSourceMock([
                pedidoRow({ id_pedido: 'p1', latitud: 19.4326, longitud: -99.1332, peso_total: 10, volumen_total: 0.5 }),
                pedidoRow({ id_pedido: 'p2', latitud: 19.4350, longitud: -99.1350, peso_total: 5, volumen_total: 0.2 })
            ]);

            const camionCerca: UbicacionCamion = { latitud: 19.4338, longitud: -99.1341, fecha_registro: new Date('2026-04-21T09:00:00Z') };
            const camionLejos: UbicacionCamion = { latitud: 19.6000, longitud: -99.1332, fecha_registro: new Date('2026-04-21T09:00:00Z') };

            const flotilla = buildFlotillaMock({
                listarCamionesDisponiblesParaAsignacion: jest.fn().mockResolvedValue([
                    camionMock({ id_camion: 'cam-lejos' }),
                    camionMock({ id_camion: 'cam-cerca' })
                ]),
                listarConductoresDisponibles: jest.fn().mockResolvedValue([
                    conductorMock({ id_conductor: 'con-1' }),
                    conductorMock({ id_conductor: 'con-2', nombres: 'Ana', apellido_paterno: 'Ruiz', apellido_materno: null })
                ]),
                obtenerUltimaUbicacionCamion: jest.fn().mockImplementation((id: string) =>
                    id === 'cam-cerca' ? Promise.resolve(camionCerca) : Promise.resolve(camionLejos)
                )
            });

            const service = new AsignacionService({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                dataSource: ds as any,
                flotilla,
                regionId: 'NORTE'
            });

            const result = await service.sugerir({ id_pedidos: ['p1', 'p2'] });

            expect(result.totales.cantidad_pedidos).toBe(2);
            expect(result.totales.peso_total_kg).toBe(15);
            expect(result.totales.volumen_total_m3).toBe(0.7);
            expect(result.totales.centroide).not.toBeNull();
            expect(result.totales.centroide!.latitud).toBeCloseTo(19.4338, 3);

            expect(flotilla.listarCamionesDisponiblesParaAsignacion)
                .toHaveBeenCalledWith('NORTE', 15, 0.7);

            // Ordenados por distancia (cam-cerca primero)
            expect(result.camiones_sugeridos).toHaveLength(2);
            expect(result.camiones_sugeridos[0].id_camion).toBe('cam-cerca');
            expect(result.camiones_sugeridos[1].id_camion).toBe('cam-lejos');
            expect(result.camiones_sugeridos[0].distancia_a_centroide_metros).not.toBeNull();
            expect(result.camiones_sugeridos[0].distancia_a_centroide_metros!).toBeLessThan(
                result.camiones_sugeridos[1].distancia_a_centroide_metros!
            );

            // Capacidad disponible calculada (camion 1000kg - 15kg = 985)
            expect(result.camiones_sugeridos[0].capacidad_carga_disponible_kg).toBe(985);
            expect(result.camiones_sugeridos[0].capacidad_volumen_disponible_m3).toBeCloseTo(49.3, 1);

            // Conductor 1-a-1
            expect(result.camiones_sugeridos[0].conductor_sugerido!.id_conductor).toBe('con-1');
            expect(result.camiones_sugeridos[0].conductor_sugerido!.nombre_completo).toBe('Juan Pérez López');
            expect(result.camiones_sugeridos[1].conductor_sugerido!.id_conductor).toBe('con-2');
            expect(result.camiones_sugeridos[1].conductor_sugerido!.nombre_completo).toBe('Ana Ruiz');
        });

        it('empareja conductor=null cuando hay más camiones que conductores', async () => {
            const ds = buildDataSourceMock([pedidoRow()]);
            const flotilla = buildFlotillaMock({
                listarCamionesDisponiblesParaAsignacion: jest.fn().mockResolvedValue([
                    camionMock({ id_camion: 'c1' }),
                    camionMock({ id_camion: 'c2' })
                ]),
                listarConductoresDisponibles: jest.fn().mockResolvedValue([conductorMock()]),
                obtenerUltimaUbicacionCamion: jest.fn().mockResolvedValue(null)
            });

            const service = new AsignacionService({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                dataSource: ds as any,
                flotilla,
                regionId: 'NORTE'
            });

            const result = await service.sugerir({ id_pedidos: ['ped-1'] });
            expect(result.camiones_sugeridos[0].conductor_sugerido).not.toBeNull();
            expect(result.camiones_sugeridos[1].conductor_sugerido).toBeNull();
        });

        it('retorna camiones_sugeridos vacío sin error cuando no hay camiones disponibles', async () => {
            const ds = buildDataSourceMock([pedidoRow()]);
            const flotilla = buildFlotillaMock();

            const service = new AsignacionService({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                dataSource: ds as any,
                flotilla,
                regionId: 'NORTE'
            });

            const result = await service.sugerir({ id_pedidos: ['ped-1'] });
            expect(result.camiones_sugeridos).toEqual([]);
            expect(result.pedidos).toHaveLength(1);
        });

        it('camiones sin ubicación reportada van al final del orden', async () => {
            const ds = buildDataSourceMock([pedidoRow()]);
            const flotilla = buildFlotillaMock({
                listarCamionesDisponiblesParaAsignacion: jest.fn().mockResolvedValue([
                    camionMock({ id_camion: 'sin-ubi' }),
                    camionMock({ id_camion: 'con-ubi' })
                ]),
                obtenerUltimaUbicacionCamion: jest.fn().mockImplementation((id: string) =>
                    id === 'con-ubi'
                        ? Promise.resolve({ latitud: 19.4326, longitud: -99.1332, fecha_registro: new Date() })
                        : Promise.resolve(null)
                )
            });

            const service = new AsignacionService({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                dataSource: ds as any,
                flotilla,
                regionId: 'NORTE'
            });

            const result = await service.sugerir({ id_pedidos: ['ped-1'] });
            expect(result.camiones_sugeridos[0].id_camion).toBe('con-ubi');
            expect(result.camiones_sugeridos[1].id_camion).toBe('sin-ubi');
            expect(result.camiones_sugeridos[1].distancia_a_centroide_metros).toBeNull();
        });

        it('centroide es null cuando ningún pedido tiene coordenadas', async () => {
            const ds = buildDataSourceMock([
                pedidoRow({ latitud: null, longitud: null })
            ]);
            const flotilla = buildFlotillaMock({
                listarCamionesDisponiblesParaAsignacion: jest.fn().mockResolvedValue([camionMock()]),
                obtenerUltimaUbicacionCamion: jest.fn().mockResolvedValue({
                    latitud: 19.4326, longitud: -99.1332, fecha_registro: new Date()
                })
            });

            const service = new AsignacionService({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                dataSource: ds as any,
                flotilla,
                regionId: 'NORTE'
            });

            const result = await service.sugerir({ id_pedidos: ['ped-1'] });
            expect(result.totales.centroide).toBeNull();
            // Sin centroide no se puede calcular distancia
            expect(result.camiones_sugeridos[0].distancia_a_centroide_metros).toBeNull();
        });
    });

    describe('[Validaciones]', () => {
        it('retorna 404 cuando alguno de los pedidos no existe', async () => {
            const ds = buildDataSourceMock([pedidoRow({ id_pedido: 'p1' })]);
            const flotilla = buildFlotillaMock();

            const service = new AsignacionService({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                dataSource: ds as any,
                flotilla,
                regionId: 'NORTE'
            });

            await expect(service.sugerir({ id_pedidos: ['p1', 'p2-falta'] })).rejects.toMatchObject({
                statusCode: 404,
                code: 'NOT_FOUND'
            });
        });

        it('retorna 409 cuando un pedido no está en EN_COLA', async () => {
            const ds = buildDataSourceMock([
                pedidoRow({ id_pedido: 'p1', descripcion_status: 'ASIGNADO' })
            ]);
            const flotilla = buildFlotillaMock();

            const service = new AsignacionService({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                dataSource: ds as any,
                flotilla,
                regionId: 'NORTE'
            });

            await expect(service.sugerir({ id_pedidos: ['p1'] })).rejects.toMatchObject({
                statusCode: 409,
                code: 'CONFLICT'
            });
        });

        it('retorna 403 cuando un pedido pertenece a otra región', async () => {
            const ds = buildDataSourceMock([
                pedidoRow({ id_pedido: 'p1', id_region: 'SUR' })
            ]);
            const flotilla = buildFlotillaMock();

            const service = new AsignacionService({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                dataSource: ds as any,
                flotilla,
                regionId: 'NORTE'
            });

            await expect(service.sugerir({ id_pedidos: ['p1'] })).rejects.toMatchObject({
                statusCode: 403,
                code: 'FORBIDDEN'
            });
        });

        it('red de seguridad: rechaza si llegan más de 9 ids (por si el DTO no validó)', async () => {
            const ids = Array.from({ length: 10 }, (_, i) => `p${i}`);
            const ds = buildDataSourceMock(ids.map(id => pedidoRow({ id_pedido: id })));
            const flotilla = buildFlotillaMock();

            const service = new AsignacionService({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                dataSource: ds as any,
                flotilla,
                regionId: 'NORTE'
            });

            await expect(service.sugerir({ id_pedidos: ids })).rejects.toMatchObject({
                statusCode: 400,
                code: 'VALIDATION_ERROR'
            });
        });
    });

    describe('[Capacidad de la flota]', () => {
        it('pasa peso y volumen total al consultar camiones', async () => {
            const ds = buildDataSourceMock([
                pedidoRow({ peso_total: 100, volumen_total: 2 }),
                pedidoRow({ id_pedido: 'p2', id_cliente: 'c2', peso_total: 150, volumen_total: 3 })
            ]);
            const flotilla = buildFlotillaMock();

            const service = new AsignacionService({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                dataSource: ds as any,
                flotilla,
                regionId: 'NORTE'
            });

            await service.sugerir({ id_pedidos: ['ped-1', 'p2'] });

            expect(flotilla.listarCamionesDisponiblesParaAsignacion)
                .toHaveBeenCalledWith('NORTE', 250, 5);
        });

        it('capacidad_volumen_disponible es null cuando el camión no tiene volumen máximo', async () => {
            const ds = buildDataSourceMock([pedidoRow()]);
            const flotilla = buildFlotillaMock({
                listarCamionesDisponiblesParaAsignacion: jest.fn().mockResolvedValue([
                    camionMock({ capacidad_volumen: null })
                ])
            });

            const service = new AsignacionService({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                dataSource: ds as any,
                flotilla,
                regionId: 'NORTE'
            });

            const result = await service.sugerir({ id_pedidos: ['ped-1'] });
            expect(result.camiones_sugeridos[0].capacidad_volumen_disponible_m3).toBeNull();
        });
    });
});
