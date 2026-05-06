import { ColaService } from './cola.service';
import { PedidoColaRaw } from '../mappers/cola.mapper';

/**
 * Factory de filas crudas tal como las devolvería el SQL con ST_X/ST_Y.
 * Los números vienen como string (pg devuelve DECIMAL como string); el mapper debe normalizar.
 */
const row = (over: Partial<PedidoColaRaw> = {}): PedidoColaRaw => ({
    id_pedido: over.id_pedido ?? 'ped-1',
    id_cliente: over.id_cliente ?? 'cli-1',
    nombre_cliente: over.nombre_cliente ?? 'Almacén A',
    direccion: over.direccion ?? 'Dirección A',
    // 'in' preserva el null explícito que los tests usan para simular ubicación ausente.
    latitud: 'latitud' in over ? over.latitud! : '19.4326',
    longitud: 'longitud' in over ? over.longitud! : '-99.1332',
    total: over.total ?? '100.00',
    peso_total: over.peso_total ?? '5.000',
    volumen_total: over.volumen_total ?? '0.2000',
    prioridad: over.prioridad ?? 'NORMAL',
    hora_pedido: over.hora_pedido ?? new Date('2026-04-20T10:00:00Z')
});

const buildDataSourceMock = (rows: PedidoColaRaw[]) => ({
    query: jest.fn().mockResolvedValue(rows)
});

const AHORA = new Date('2026-04-21T10:00:00Z');

describe('ColaService.listarCola', () => {
    it('devuelve los pedidos con coordenadas numéricas y tiempo_en_cola calculado', async () => {
        const ds = buildDataSourceMock([
            row({ id_pedido: 'p1', hora_pedido: new Date('2026-04-21T09:30:00Z') })
        ]);

        const service = new ColaService({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            dataSource: ds as any,
            regionId: 'NORTE',
            now: () => AHORA
        });

        const cola = await service.listarCola();

        expect(ds.query).toHaveBeenCalledWith(
            expect.stringContaining("p.descripcion_status = 'EN_COLA'"),
            ['NORTE']
        );
        expect(cola).toHaveLength(1);
        expect(cola[0].latitud).toBeCloseTo(19.4326);
        expect(cola[0].longitud).toBeCloseTo(-99.1332);
        expect(cola[0].total).toBe(100);
        expect(cola[0].peso_total_kg).toBe(5);
        expect(cola[0].volumen_total_m3).toBe(0.2);
        // 30 minutos en cola = 1800 segundos
        expect(cola[0].tiempo_en_cola_segundos).toBe(1800);
    });

    it('maneja pedidos con ubicación nula (coordenadas null)', async () => {
        const ds = buildDataSourceMock([
            row({ id_pedido: 'p1', latitud: null, longitud: null })
        ]);

        const service = new ColaService({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            dataSource: ds as any,
            regionId: 'NORTE',
            now: () => AHORA
        });

        const cola = await service.listarCola();
        expect(cola[0].latitud).toBeNull();
        expect(cola[0].longitud).toBeNull();
    });

    it('confía en el orden SQL (prioridad ALTA + FIFO) devuelto por el motor', async () => {
        // El test asume que la BD devuelve el orden correcto; este test valida que el service
        // no altera el orden. El ORDER BY real está cubierto por el SQL inspeccionado.
        const ds = buildDataSourceMock([
            row({ id_pedido: 'alta-1', prioridad: 'ALTA', hora_pedido: new Date('2026-04-21T08:00:00Z') }),
            row({ id_pedido: 'alta-2', prioridad: 'ALTA', hora_pedido: new Date('2026-04-21T09:00:00Z') }),
            row({ id_pedido: 'norm-1', prioridad: 'NORMAL', hora_pedido: new Date('2026-04-21T07:00:00Z') }),
            row({ id_pedido: 'norm-2', prioridad: 'NORMAL', hora_pedido: new Date('2026-04-21T07:30:00Z') })
        ]);

        const service = new ColaService({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            dataSource: ds as any,
            regionId: 'NORTE',
            now: () => AHORA
        });

        const cola = await service.listarCola();
        expect(cola.map(p => p.id_pedido)).toEqual(['alta-1', 'alta-2', 'norm-1', 'norm-2']);
    });

    it('construye el SQL con el ORDER BY exigido por RF-02 (ALTA primero, luego FIFO)', async () => {
        const ds = buildDataSourceMock([]);
        const service = new ColaService({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            dataSource: ds as any,
            regionId: 'NORTE',
            now: () => AHORA
        });

        await service.listarCola();

        const sql = ds.query.mock.calls[0][0] as string;
        expect(sql).toMatch(/ORDER BY[\s\S]*prioridad[\s\S]*'ALTA'[\s\S]*hora_pedido ASC/);
    });
});

describe('ColaService.listarGruposSugeridos', () => {
    it('agrupa pedidos cercanos (<5km) en un mismo grupo', async () => {
        // 3 pedidos: p1 y p2 en CDMX centro (muy cercanos), p3 a >20km
        const ds = buildDataSourceMock([
            row({ id_pedido: 'p1', latitud: '19.4326', longitud: '-99.1332' }),
            row({ id_pedido: 'p2', latitud: '19.4350', longitud: '-99.1350' }), // ~300m
            row({ id_pedido: 'p3', latitud: '19.6000', longitud: '-99.1332' })  // ~19km
        ]);

        const service = new ColaService({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            dataSource: ds as any,
            regionId: 'NORTE',
            now: () => AHORA
        });

        const grupos = await service.listarGruposSugeridos();

        expect(grupos).toHaveLength(2);
        expect(grupos[0].cantidad_pedidos).toBe(2);
        expect(grupos[0].pedidos.map(p => p.id_pedido).sort()).toEqual(['p1', 'p2']);
        expect(grupos[1].cantidad_pedidos).toBe(1);
        expect(grupos[1].pedidos[0].id_pedido).toBe('p3');
    });

    it('suma peso, volumen y total monetario por grupo', async () => {
        const ds = buildDataSourceMock([
            row({ id_pedido: 'p1', latitud: '19.4326', longitud: '-99.1332', peso_total: '3', volumen_total: '0.1', total: '100' }),
            row({ id_pedido: 'p2', latitud: '19.4350', longitud: '-99.1350', peso_total: '2', volumen_total: '0.2', total: '50' })
        ]);

        const service = new ColaService({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            dataSource: ds as any,
            regionId: 'NORTE',
            now: () => AHORA
        });

        const grupos = await service.listarGruposSugeridos();
        expect(grupos).toHaveLength(1);
        expect(grupos[0].peso_total_kg).toBe(5);
        expect(grupos[0].volumen_total_m3).toBe(0.3);
        expect(grupos[0].total_monetario).toBe(150);
    });

    it('respeta el límite de 9 pedidos por grupo aunque haya más cercanos', async () => {
        // 11 pedidos todos cercanos (mismas coordenadas). Debe dividir en dos grupos: 9 y 2
        const rows: PedidoColaRaw[] = [];
        for (let i = 0; i < 11; i++) {
            rows.push(row({
                id_pedido: `p${i}`,
                latitud: '19.4326',
                longitud: '-99.1332',
                hora_pedido: new Date(`2026-04-21T09:${String(i).padStart(2, '0')}:00Z`)
            }));
        }
        const ds = buildDataSourceMock(rows);

        const service = new ColaService({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            dataSource: ds as any,
            regionId: 'NORTE',
            now: () => AHORA
        });

        const grupos = await service.listarGruposSugeridos();
        expect(grupos).toHaveLength(2);
        expect(grupos[0].cantidad_pedidos).toBe(9);
        expect(grupos[1].cantidad_pedidos).toBe(2);
    });

    it('pedidos sin coordenadas forman su propio grupo unitario', async () => {
        const ds = buildDataSourceMock([
            row({ id_pedido: 'p1', latitud: null, longitud: null }),
            row({ id_pedido: 'p2', latitud: '19.4326', longitud: '-99.1332' })
        ]);

        const service = new ColaService({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            dataSource: ds as any,
            regionId: 'NORTE',
            now: () => AHORA
        });

        const grupos = await service.listarGruposSugeridos();
        expect(grupos).toHaveLength(2);
        expect(grupos[0].pedidos[0].id_pedido).toBe('p1');
        expect(grupos[0].cantidad_pedidos).toBe(1);
    });

    it('permite personalizar el radio (en metros) vía options', async () => {
        // Dos pedidos a ~300m; con radio de 100m no deben agruparse
        const ds = buildDataSourceMock([
            row({ id_pedido: 'p1', latitud: '19.4326', longitud: '-99.1332' }),
            row({ id_pedido: 'p2', latitud: '19.4350', longitud: '-99.1350' })
        ]);

        const service = new ColaService({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            dataSource: ds as any,
            regionId: 'NORTE',
            now: () => AHORA
        });

        const gruposChico = await service.listarGruposSugeridos({ radioMetros: 100 });
        expect(gruposChico).toHaveLength(2);

        const gruposGrande = await service.listarGruposSugeridos({ radioMetros: 5000 });
        expect(gruposGrande).toHaveLength(1);
    });

    it('permite reducir el max de pedidos por grupo', async () => {
        const rows: PedidoColaRaw[] = [];
        for (let i = 0; i < 5; i++) {
            rows.push(row({ id_pedido: `p${i}`, latitud: '19.4326', longitud: '-99.1332' }));
        }
        const ds = buildDataSourceMock(rows);

        const service = new ColaService({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            dataSource: ds as any,
            regionId: 'NORTE',
            now: () => AHORA
        });

        const grupos = await service.listarGruposSugeridos({ maxPedidosPorGrupo: 2 });
        expect(grupos).toHaveLength(3); // 2 + 2 + 1
        expect(grupos[0].cantidad_pedidos).toBe(2);
        expect(grupos[1].cantidad_pedidos).toBe(2);
        expect(grupos[2].cantidad_pedidos).toBe(1);
    });

    it('devuelve array vacío si no hay pedidos en cola', async () => {
        const ds = buildDataSourceMock([]);
        const service = new ColaService({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            dataSource: ds as any,
            regionId: 'NORTE',
            now: () => AHORA
        });
        const grupos = await service.listarGruposSugeridos();
        expect(grupos).toEqual([]);
    });
});
