import { DataSource, Double, In } from 'typeorm';
import { randomUUID } from 'crypto';
import { AppDataSource } from '../../../core/database';
import { RuteoService, buildRuteoService } from '../../ruteo/services/ruteo.service';
import {
    NotFoundError,
    ValidationError,
    ConflictError,
    ForbiddenError,
    CapacidadExcedidaError,
    InternalError
} from '../../../core/errors/AppError';
import { CrearViajeDTO, MAX_PEDIDOS_POR_VIAJE } from '../dto/crear-viaje.dto';
import { ViajeEntity, ViajeStatus } from '../models/viaje.entity';
import { PedidoEntity, PedidoPrioridad, PedidoStatus } from '../models/pedido.entity';
import {
    ViajeMapper,
    ViajeView,
    PedidoEnViajeView,
    CamionEnViajeView,
    ConductorEnViajeView,
    nombreCompletoConductor
} from '../mappers/viaje.mapper';
import { PoolClient } from 'pg';

export interface ViajeServiceDeps {
    dataSource: DataSource;
    regionId: string;
    now?: () => Date;
    ruteoService?: RuteoService;
}

interface PedidoRow {
    id_pedido: string;
    id_cliente: string | null;
    descripcion_status: PedidoStatus;
    prioridad: PedidoPrioridad;
    peso_total: string | number;
    volumen_total: string | number;
    id_region: string | null;
    id_viaje: string | null;
}

interface CamionRow {
    id_camion: string;
    marca: string;
    modelo: string;
    placas: string;
    capacidad_carga: string | number;
    capacidad_volumen: string | number | null;
    activo: boolean;
    id_region: string | null;
}

interface ConductorRow {
    id_conductor: string;
    nombres: string;
    apellido_paterno: string;
    apellido_materno: string | null;
    telefono: string | null;
    activo: boolean;
    id_region: string | null;
}

interface DetallePedidoRow {
    id_pedido: string;
    id_producto: string;
    nombre_producto: string;
    cantidad: number;
    precio_unitario: string | number;
}

interface DetallePedidos {
    id_detalle: string;
    id_pedido: string;
    id_producto: string;
    cantidad: number;
    precio_unitario: Double;
}

type CountRow = { c: string | number };

export class ViajeService {
    private readonly dataSource: DataSource;
    private readonly regionId: string;
    private readonly now: () => Date;
    private readonly ruteoService: RuteoService | undefined;

    constructor(deps: ViajeServiceDeps) {
        this.dataSource = deps.dataSource;
        this.regionId = deps.regionId;
        this.now = deps.now ?? (() => new Date());
        this.ruteoService = deps.ruteoService;
    }

    /**
     * RF-04: crea un viaje a partir de un grupo de pedidos EN_COLA y un par camión+conductor
     * disponibles. Transaccional: bloquea pedidos/camión/conductor para serializar concurrencia
     * y evitar que dos administradores asignen el mismo recurso al mismo tiempo.
     */
    async crear(dto: CrearViajeDTO): Promise<ViajeView> {
        const qr = this.dataSource.createQueryRunner();
        await qr.connect();
        await qr.startTransaction();
        try {
            // 1. Pedidos: lock + metadata
            const pedidos = await this.consultarPedidosLocked(qr, dto.id_pedidos);
            this.validarPedidos(dto.id_pedidos, pedidos);
            const pesoTotal = round3(pedidos.reduce((acc, p) => acc + Number(p.peso_total), 0));
            const volumenTotal = round4(pedidos.reduce((acc, p) => acc + Number(p.volumen_total), 0));

            // 2. Camión: lock + verificar disponibilidad y capacidad
            const camionCrudo = await this.consultarCamionLocked(qr, dto.id_camion);
            const camion = await this.validarCamion(qr, camionCrudo, dto.id_camion, pesoTotal, volumenTotal);

            // 3. Conductor: lock + verificar disponibilidad
            const conductorCrudo = await this.consultarConductorLocked(qr, dto.id_conductor);
            const conductor = await this.validarConductor(qr, conductorCrudo, dto.id_conductor);

            // 4. Persistir viaje. El UUID se pregenera en proceso para poder calcular numero_guia
            //    en un solo INSERT (VIAJE-{primeros 8 del id}).
            const id_viaje = randomUUID();
            const numero_guia = `VIAJE-${id_viaje.substring(0, 8)}`;
            const viajeRepo = qr.manager.getRepository(ViajeEntity);
            const viaje = viajeRepo.create({
                id_viaje,
                id_conductor: dto.id_conductor,
                id_camion: dto.id_camion,
                id_ruta: null,
                numero_guia,
                hora_salida: null,
                hora_llegada: null,
                status: 'CARGANDO',
                id_region: this.regionId
            });
            const viajeGuardado = await viajeRepo.save(viaje);

            // 5. Pedidos → ASIGNADO + id_viaje
            await qr.manager.update(
                PedidoEntity,
                { id_pedido: In(dto.id_pedidos) },
                { descripcion_status: 'ASIGNADO', id_viaje: viajeGuardado.id_viaje }
            );

            await qr.commitTransaction();

            // RF-05: cálculo de ruta fuera de la transacción (falla silenciosa si Google Maps no está disponible).
            if (this.ruteoService) {
                const id_ruta = await this.ruteoService.calcularYAsignarRuta({
                    id_viaje: viajeGuardado.id_viaje,
                    id_region: this.regionId,
                    id_camion: dto.id_camion,
                    id_pedidos: dto.id_pedidos
                }).catch((err: unknown) => {
                    console.error('[ViajeService] Ruteo falló — viaje creado sin ruta:', err);
                    return null;
                });
                viajeGuardado.id_ruta = id_ruta ?? null;
            }

            // 6. Obtener detalles de productos para la vista
            const detallesRows = await qr.query(
                `SELECT dp.id_pedido, dp.id_producto, p.nombre_producto, dp.cantidad, dp.precio_unitario
                 FROM detalle_pedidos dp
                 JOIN productos p ON dp.id_producto = p.id_producto
                 WHERE dp.id_pedido = ANY($1::uuid[])`,
                [dto.id_pedidos]
            ) as DetallePedidoRow[];

            return ViajeMapper.toView(viajeGuardado, {
                pedidos: pedidos.map(p => toPedidoEnViaje(
                    p,
                    'ASIGNADO',
                    detallesRows.filter(d => d.id_pedido === p.id_pedido)
                )),
                camion: toCamionView(camion),
                conductor: toConductorView(conductor)
            });
        } catch (error) {
            await qr.rollbackTransaction();
            if (error instanceof Error && (error as { isOperational?: boolean }).isOperational) {
                throw error;
            }
            throw new InternalError(
                'Error creando viaje',
                error instanceof Error ? { cause: error.message } : undefined
            );
        } finally {
            await qr.release();
        }
    }

    /**
     * Transición CARGANDO → EN_CAMINO. Registra hora_salida y pasa todos los pedidos del viaje a EN_RUTA.
     */
    async iniciar(id_viaje: string): Promise<ViajeView> {
        const qr = this.dataSource.createQueryRunner();
        await qr.connect();
        await qr.startTransaction();
        try {
            const viaje = await qr.manager.findOne(ViajeEntity, {
                where: { id_viaje },
                lock: { mode: 'pessimistic_write' }
            });
            if (!viaje) {
                throw new NotFoundError(`Viaje ${id_viaje} no existe`);
            }
            if (viaje.status !== 'CARGANDO') {
                throw new ConflictError(
                    `El viaje ${id_viaje} no puede iniciarse desde estado ${viaje.status}`,
                    { id_viaje, estado_actual: viaje.status, estado_requerido: 'CARGANDO' }
                );
            }

            viaje.status = 'EN_CAMINO';
            viaje.hora_salida = this.now();
            const viajeActualizado = await qr.manager.save(ViajeEntity, viaje);

            await qr.manager.update(
                PedidoEntity,
                { id_viaje },
                { descripcion_status: 'EN_RUTA' }
            );

            await qr.commitTransaction();
            return this.obtener(viajeActualizado.id_viaje);
        } catch (error) {
            await qr.rollbackTransaction();
            if (error instanceof Error && (error as { isOperational?: boolean }).isOperational) {
                throw error;
            }
            throw new InternalError(
                'Error iniciando viaje',
                error instanceof Error ? { cause: error.message } : undefined
            );
        } finally {
            await qr.release();
        }
    }

    /**
     * Transición EN_CAMINO/EN_ENTREGA → COMPLETADO. Marca hora_llegada y cada pedido aún
     * no entregado como ENTREGADO con su hora_entrega correspondiente.
     */
    async completar(id_viaje: string): Promise<ViajeView> {
        const qr = this.dataSource.createQueryRunner();
        await qr.connect();
        await qr.startTransaction();
        try {
            const viaje = await qr.manager.findOne(ViajeEntity, {
                where: { id_viaje },
                lock: { mode: 'pessimistic_write' }
            });
            if (!viaje) {
                throw new NotFoundError(`Viaje ${id_viaje} no existe`);
            }
            if (viaje.status !== 'EN_CAMINO' && viaje.status !== 'EN_ENTREGA') {
                throw new ConflictError(
                    `El viaje ${id_viaje} no puede completarse desde estado ${viaje.status}`,
                    { id_viaje, estado_actual: viaje.status, estados_permitidos: ['EN_CAMINO', 'EN_ENTREGA'] }
                );
            }

            const ahora = this.now();
            viaje.status = 'COMPLETADO';
            viaje.hora_llegada = ahora;
            const viajeActualizado = await qr.manager.save(ViajeEntity, viaje);

            // Solo los pedidos que aún no están ENTREGADO (admin podría haber confirmado alguno antes vía RF-06).
            await qr.manager.update(
                PedidoEntity,
                { id_viaje, descripcion_status: In(['ASIGNADO', 'EN_RUTA']) },
                { descripcion_status: 'ENTREGADO', hora_entrega: ahora }
            );

            await qr.commitTransaction();
            return this.obtener(viajeActualizado.id_viaje);
        } catch (error) {
            await qr.rollbackTransaction();
            if (error instanceof Error && (error as { isOperational?: boolean }).isOperational) {
                throw error;
            }
            throw new InternalError(
                'Error completando viaje',
                error instanceof Error ? { cause: error.message } : undefined
            );
        } finally {
            await qr.release();
        }
    }

    async obtener(id_viaje: string): Promise<ViajeView> {
        const viaje = await this.dataSource.getRepository(ViajeEntity).findOne({ where: { id_viaje } });
        if (!viaje) {
            throw new NotFoundError(`Viaje ${id_viaje} no existe`);
        }
        const extras = await this.cargarExtras(viaje);
        return ViajeMapper.toView(viaje, extras);
    }

    async listarPedidosViaje(id_viaje: string): Promise<PedidoEnViajeView[]> {
        const viaje = await this.dataSource.getRepository(ViajeEntity).findOne({ where: { id_viaje } });
        if (!viaje) throw new NotFoundError(`Viaje ${id_viaje} no existe`);

        const [pedidoRows, detallesRows] = await Promise.all([
            this.dataSource.query(
                `SELECT id_pedido, id_cliente, descripcion_status, prioridad, peso_total, volumen_total, id_region, id_viaje
                 FROM pedidos WHERE id_viaje = $1 ORDER BY descripcion_status, prioridad DESC`,
                [id_viaje]
            ) as Promise<PedidoRow[]>,
            this.dataSource.query(
                `SELECT dp.id_pedido, dp.id_producto, p.nombre_producto, dp.cantidad, dp.precio_unitario
                 FROM detalle_pedidos dp
                 JOIN productos p ON dp.id_producto = p.id_producto
                 WHERE dp.id_pedido IN (SELECT id_pedido FROM pedidos WHERE id_viaje = $1)`,
                [id_viaje]
            ) as Promise<DetallePedidoRow[]>
        ]);

        return pedidoRows.map(p => toPedidoEnViaje(
            p,
            p.descripcion_status,
            detallesRows.filter(d => d.id_pedido === p.id_pedido)
        ));
    }

    async listar(filtros: { status?: ViajeStatus } = {}): Promise<ViajeView[]> {
        const repo = this.dataSource.getRepository(ViajeEntity);
        const where = filtros.status ? { status: filtros.status, id_region: this.regionId } : { id_region: this.regionId };
        const viajes = await repo.find({ where, order: { fecha_actualizacion: 'DESC' } });
        // Evitamos N+1 y no enriquecemos con camión/conductor en listado (endpoint de detalle lo hace).
        return viajes.map(v => ViajeMapper.toView(v));
    }

    // ---------- Helpers privados ----------

    private async consultarPedidosLocked(qr: { query: (sql: string, params?: unknown[]) => Promise<unknown[]> }, ids: string[]): Promise<PedidoRow[]> {
        const sql = `
            SELECT id_pedido, id_cliente, descripcion_status, prioridad,
                   peso_total, volumen_total, id_region, id_viaje
            FROM pedidos
            WHERE id_pedido = ANY($1::uuid[])
            FOR UPDATE
        `;
        const rows = await qr.query(sql, [ids]);
        return rows as PedidoRow[];
    }

    private validarPedidos(ids: string[], pedidos: PedidoRow[]): void {
        if (ids.length > MAX_PEDIDOS_POR_VIAJE) {
            // Red de seguridad: el DTO ya validó pero defensa en profundidad.
            throw new ValidationError(`Máximo ${MAX_PEDIDOS_POR_VIAJE} pedidos por viaje`);
        }
        if (pedidos.length !== ids.length) {
            const encontrados = new Set(pedidos.map(p => p.id_pedido));
            const faltantes = ids.filter(id => !encontrados.has(id));
            throw new NotFoundError(
                `Pedidos no encontrados: ${faltantes.join(', ')}`,
                { ids_no_encontrados: faltantes }
            );
        }
        for (const p of pedidos) {
            if (p.descripcion_status !== 'EN_COLA') {
                throw new ConflictError(
                    `El pedido ${p.id_pedido} no está en estado EN_COLA (estado actual: ${p.descripcion_status})`,
                    { id_pedido: p.id_pedido, estado_actual: p.descripcion_status }
                );
            }
            if (p.id_region !== this.regionId) {
                throw new ForbiddenError(
                    `El pedido ${p.id_pedido} pertenece a la región ${p.id_region}, no a ${this.regionId}`
                );
            }
        }
    }

    private async consultarCamionLocked(qr: { query: (sql: string, params?: unknown[]) => Promise<unknown[]> }, id_camion: string): Promise<CamionRow | null> {
        const sql = `
            SELECT id_camion, marca, modelo, placas, capacidad_carga, capacidad_volumen, activo, id_region
            FROM camiones
            WHERE id_camion = $1
            FOR UPDATE
        `;
        const rows = await qr.query(sql, [id_camion]);
        return (rows[0] as CamionRow | undefined) ?? null;
    }

    private async validarCamion(
        qr: { query: (sql: string, params?: unknown[]) => Promise<unknown[]> },
        camion: CamionRow | null,
        id_camion: string,
        pesoTotal: number,
        volumenTotal: number
    ): Promise<CamionRow> {
        if (!camion || !camion.activo) {
            throw new NotFoundError(`Camión ${id_camion} no existe o está inactivo`);
        }
        if (camion.id_region !== this.regionId) {
            throw new ForbiddenError(
                `El camión ${id_camion} pertenece a la región ${camion.id_region}, no a ${this.regionId}`
            );
        }

        const capacidadCarga = Number(camion.capacidad_carga);
        const capacidadVolumen = camion.capacidad_volumen === null ? null : Number(camion.capacidad_volumen);
        if (pesoTotal > capacidadCarga) {
            throw new CapacidadExcedidaError(
                'El peso total de los pedidos excede la capacidad del camión',
                { peso_total_kg: pesoTotal, capacidad_carga_kg: capacidadCarga, id_camion }
            );
        }
        if (capacidadVolumen !== null && volumenTotal > capacidadVolumen) {
            throw new CapacidadExcedidaError(
                'El volumen total de los pedidos excede la capacidad del camión',
                { volumen_total_m3: volumenTotal, capacidad_volumen_m3: capacidadVolumen, id_camion }
            );
        }

        const countRows = await qr.query(
            `SELECT COUNT(*)::int AS c FROM viajes
             WHERE id_camion = $1 AND status NOT IN ('COMPLETADO', 'CANCELADO')`,
            [id_camion]
        );
        const count = Number((countRows[0] as CountRow | undefined)?.c ?? 0);
        if (count > 0) {
            throw new ConflictError(
                `El camión ${id_camion} ya tiene un viaje activo`,
                { id_camion }
            );
        }
        return camion;
    }

    private async consultarConductorLocked(qr: { query: (sql: string, params?: unknown[]) => Promise<unknown[]> }, id_conductor: string): Promise<ConductorRow | null> {
        const sql = `
            SELECT id_conductor, nombres, apellido_paterno, apellido_materno, telefono, activo, id_region
            FROM conductores
            WHERE id_conductor = $1
            FOR UPDATE
        `;
        const rows = await qr.query(sql, [id_conductor]);
        return (rows[0] as ConductorRow | undefined) ?? null;
    }

    private async validarConductor(
        qr: { query: (sql: string, params?: unknown[]) => Promise<unknown[]> },
        conductor: ConductorRow | null,
        id_conductor: string
    ): Promise<ConductorRow> {
        if (!conductor || !conductor.activo) {
            throw new NotFoundError(`Conductor ${id_conductor} no existe o está inactivo`);
        }
        if (conductor.id_region !== this.regionId) {
            throw new ForbiddenError(
                `El conductor ${id_conductor} pertenece a la región ${conductor.id_region}, no a ${this.regionId}`
            );
        }
        const countRows = await qr.query(
            `SELECT COUNT(*)::int AS c FROM viajes
             WHERE id_conductor = $1 AND status NOT IN ('COMPLETADO', 'CANCELADO')`,
            [id_conductor]
        );
        const count = Number((countRows[0] as CountRow | undefined)?.c ?? 0);
        if (count > 0) {
            throw new ConflictError(
                `El conductor ${id_conductor} ya tiene un viaje activo`,
                { id_conductor }
            );
        }
        return conductor;
    }

    private async cargarExtras(viaje: ViajeEntity) {
        const [pedidos, camionRows, conductorRows, detallesRows] = await Promise.all([
            this.dataSource.query(
                `SELECT id_pedido, id_cliente, descripcion_status, prioridad, peso_total, volumen_total, id_region, id_viaje
                 FROM pedidos WHERE id_viaje = $1`,
                [viaje.id_viaje]
            ) as Promise<PedidoRow[]>,
            this.dataSource.query(
                `SELECT id_camion, marca, modelo, placas, capacidad_carga, capacidad_volumen, activo, id_region
                 FROM camiones WHERE id_camion = $1`,
                [viaje.id_camion]
            ) as Promise<CamionRow[]>,
            viaje.id_conductor
                ? this.dataSource.query(
                    `SELECT id_conductor, nombres, apellido_paterno, apellido_materno, telefono, activo, id_region
                     FROM conductores WHERE id_conductor = $1`,
                    [viaje.id_conductor]
                ) as Promise<ConductorRow[]>
                : Promise.resolve([] as ConductorRow[]),
            this.dataSource.query(
                `SELECT dp.id_pedido, dp.id_producto, p.nombre_producto, dp.cantidad, dp.precio_unitario
                 FROM detalle_pedidos dp
                 JOIN productos p ON dp.id_producto = p.id_producto
                 WHERE dp.id_pedido IN (SELECT id_pedido FROM pedidos WHERE id_viaje = $1)`,
                [viaje.id_viaje]
            ) as Promise<DetallePedidoRow[]>
        ]);

        const camion = camionRows[0];
        const conductor = conductorRows[0];
        return {
            pedidos: pedidos.map(p => toPedidoEnViaje(
                p,
                p.descripcion_status,
                detallesRows.filter(d => d.id_pedido === p.id_pedido)
            )),
            ...(camion ? { camion: toCamionView(camion) } : {}),
            ...(conductor ? { conductor: toConductorView(conductor) } : {})
        };
    }

}

// ---------- Conversión Row → View ----------

const toPedidoEnViaje = (
    p: PedidoRow,
    estado: PedidoStatus,
    detalles: DetallePedidoRow[] = []
): PedidoEnViajeView => ({
    id_pedido: p.id_pedido,
    id_cliente: p.id_cliente,
    descripcion_status: estado,
    prioridad: p.prioridad,
    peso_total_kg: Number(p.peso_total),
    volumen_total_m3: Number(p.volumen_total),
    detalles: detalles.map(d => ({
        id_producto: d.id_producto,
        nombre_producto: d.nombre_producto,
        cantidad: d.cantidad,
        precio_unitario: Number(d.precio_unitario)
    }))
});

const toCamionView = (c: CamionRow): CamionEnViajeView => ({
    id_camion: c.id_camion,
    marca: c.marca,
    modelo: c.modelo,
    placas: c.placas,
    capacidad_carga_kg: Number(c.capacidad_carga),
    capacidad_volumen_m3: c.capacidad_volumen === null ? null : Number(c.capacidad_volumen)
});

const toConductorView = (c: ConductorRow): ConductorEnViajeView => ({
    id_conductor: c.id_conductor,
    nombre_completo: nombreCompletoConductor(c.nombres, c.apellido_paterno, c.apellido_materno),
    telefono: c.telefono
});

const round3 = (n: number): number => Math.round(n * 1000) / 1000;
const round4 = (n: number): number => Math.round(n * 10000) / 10000;

export const buildViajeService = (): ViajeService => {
    return new ViajeService({
        dataSource: AppDataSource,
        regionId: process.env.REGION_ID || 'LOCAL',
        ruteoService: buildRuteoService()
    });
};
