import { DataSource } from 'typeorm';
import { AppDataSource } from '../../../core/database';
import { FlotillaFacade, CapacidadCamionResumen } from '../../flotilla';
import {
    CapacidadExcedidaError,
    NotFoundError,
    StockInsuficienteError,
    ForbiddenError,
    ConflictError,
    InternalError
} from '../../../core/errors/AppError';
import { CrearPedidoDTO } from '../dto/crear-pedido.dto';
import { PedidoEntity } from '../models/pedido.entity';
import { DetallePedidoEntity } from '../models/detalle-pedido.entity';
import { ProductoEntity } from '../models/producto.entity';
import { ViajeEntity } from '../models/viaje.entity';
import { PedidoMapper, PedidoView, PedidoResumen } from '../mappers/pedido.mapper';

export interface EntregaView {
    id_pedido: string;
    descripcion_status: 'ENTREGADO';
    hora_entrega: string;
    id_viaje: string;
    viaje_completado: boolean;
}

export type ValidacionClienteRegion =
    | { estado: 'OK' }
    | { estado: 'NO_ENCONTRADO' }
    | { estado: 'REGION_INCORRECTA'; id_region_cliente: string | null };

export interface FlotillaFacadeLike {
    obtenerCapacidadMaximaCamion(id_region: string): Promise<CapacidadCamionResumen | null>;
    validarClienteParaRegion(id_cliente: string, id_region: string): Promise<ValidacionClienteRegion>;
}

export interface PedidoServiceDeps {
    dataSource: DataSource;
    flotilla: FlotillaFacadeLike;
    regionId: string;
    now?: () => Date;
}

interface ItemCalculado {
    id_producto: string;
    cantidad: number;
    precio_unitario: number;
    peso_subtotal: number;
    volumen_subtotal: number;
    total_subtotal: number;
}

export class PedidoService {
    private readonly dataSource: DataSource;
    private readonly flotilla: FlotillaFacadeLike;
    private readonly regionId: string;
    private readonly now: () => Date;

    constructor(deps: PedidoServiceDeps) {
        this.dataSource = deps.dataSource;
        this.flotilla = deps.flotilla;
        this.regionId = deps.regionId;
        this.now = deps.now ?? (() => new Date());
    }

    async listarPedidos(filtros: { status?: string } = {}): Promise<PedidoResumen[]> {
        const repo = this.dataSource.getRepository(PedidoEntity);
        const where: Record<string, unknown> = { id_region: this.regionId };
        if (filtros.status) where['descripcion_status'] = filtros.status;
        const pedidos = await repo.find({ where, order: { hora_pedido: 'DESC' } });
        return pedidos.map(p => PedidoMapper.toResumen(p));
    }

    async obtenerPedido(id_pedido: string): Promise<PedidoView> {
        const pedido = await this.dataSource.getRepository(PedidoEntity).findOne({ where: { id_pedido } });
        if (!pedido) throw new NotFoundError(`Pedido ${id_pedido} no existe`);
        const detalles = await this.dataSource.getRepository(DetallePedidoEntity).find({ where: { id_pedido } });
        return PedidoMapper.toView(pedido, detalles, {
            peso_total_kg: Number(pedido.peso_total),
            volumen_total_m3: Number(pedido.volumen_total)
        });
    }

    async crearPedido(dto: CrearPedidoDTO): Promise<PedidoView> {
        // Regla 0: validar cliente (existe, activo y en la región del servidor)
        // Se hace ANTES de abrir transacción para fallar rápido sin bloquear filas.
        const clienteCheck = await this.flotilla.validarClienteParaRegion(dto.id_cliente, this.regionId);
        if (clienteCheck.estado === 'NO_ENCONTRADO') {
            throw new NotFoundError(`Cliente ${dto.id_cliente} no existe o está inactivo`);
        }
        if (clienteCheck.estado === 'REGION_INCORRECTA') {
            throw new ForbiddenError(
                `El cliente no pertenece a la región ${this.regionId} atendida por este servidor`
            );
        }

        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // Regla 1: bloqueo pesimista al consultar inventario
            const productos: ProductoEntity[] = [];
            for (const item of dto.items) {
                const producto = await queryRunner.manager.findOne(ProductoEntity, {
                    where: { id_producto: item.id_producto, activo: true },
                    lock: { mode: 'pessimistic_write' }
                });
                if (!producto) {
                    throw new NotFoundError(`Producto ${item.id_producto} no existe o está inactivo`);
                }
                if (producto.stock < item.cantidad) {
                    throw new StockInsuficienteError(
                        `Stock insuficiente para el producto ${producto.nombre_producto}`,
                        { id_producto: producto.id_producto, stock_disponible: producto.stock, requerido: item.cantidad }
                    );
                }
                productos.push(producto);
            }

            // Regla 3 (parcial): calcular totales
            const items: ItemCalculado[] = dto.items.map((item, idx) => {
                const p = productos[idx] as ProductoEntity;
                const precio = Number(p.precio_unitario);
                const peso = Number(p.peso_kg);
                const volumen = Number(p.volumen_m3);
                return {
                    id_producto: p.id_producto,
                    cantidad: item.cantidad,
                    precio_unitario: precio,
                    peso_subtotal: peso * item.cantidad,
                    volumen_subtotal: volumen * item.cantidad,
                    total_subtotal: precio * item.cantidad
                };
            });

            const peso_total = round3(items.reduce((acc, it) => acc + it.peso_subtotal, 0));
            const volumen_total = round4(items.reduce((acc, it) => acc + it.volumen_subtotal, 0));
            const total_pedido = round2(items.reduce((acc, it) => acc + it.total_subtotal, 0));

            // Regla 2: validar contra capacidad física de la flota regional
            const capacidad = await this.flotilla.obtenerCapacidadMaximaCamion(this.regionId);
            if (!capacidad) {
                throw new CapacidadExcedidaError(
                    `No hay camiones activos en la región ${this.regionId} para atender el pedido`,
                    { id_region: this.regionId }
                );
            }
            if (peso_total > capacidad.capacidad_carga) {
                throw new CapacidadExcedidaError(
                    'El peso del pedido excede la capacidad máxima de carga de la flota regional',
                    { peso_total_kg: peso_total, capacidad_carga_kg: capacidad.capacidad_carga }
                );
            }
            if (capacidad.capacidad_volumen !== null && volumen_total > capacidad.capacidad_volumen) {
                throw new CapacidadExcedidaError(
                    'El volumen del pedido excede la capacidad volumétrica de la flota regional',
                    { volumen_total_m3: volumen_total, capacidad_volumen_m3: capacidad.capacidad_volumen }
                );
            }

            // Regla 3: descontar stock, persistir pedido y detalle
            for (let i = 0; i < productos.length; i++) {
                const p = productos[i] as ProductoEntity;
                const it = items[i] as ItemCalculado;
                p.stock -= it.cantidad;
                await queryRunner.manager.save(ProductoEntity, p);
            }

            // Transición automática CREADO → EN_COLA al persistir (RF-01, RF-02).
            const pedidoRepo = queryRunner.manager.getRepository(PedidoEntity);
            const pedido = pedidoRepo.create({
                id_cliente: dto.id_cliente,
                total: total_pedido,
                hora_pedido: this.now(),
                descripcion_status: 'EN_COLA',
                hora_entrega: null,
                descripcion: dto.descripcion ?? null,
                id_viaje: null,
                id_region: this.regionId,
                prioridad: dto.prioridad ?? 'NORMAL',
                peso_total,
                volumen_total
            });
            const pedidoGuardado = await pedidoRepo.save(pedido);

            const detalleRepo = queryRunner.manager.getRepository(DetallePedidoEntity);
            const detalles = items.map(it => detalleRepo.create({
                id_pedido: pedidoGuardado.id_pedido,
                id_producto: it.id_producto,
                cantidad: it.cantidad,
                precio_unitario: it.precio_unitario
            }));
            const detallesGuardados = await detalleRepo.save(detalles);

            await queryRunner.commitTransaction();

            return PedidoMapper.toView(pedidoGuardado, detallesGuardados, {
                peso_total_kg: peso_total,
                volumen_total_m3: volumen_total
            });
        } catch (error) {
            await queryRunner.rollbackTransaction();
            if (error instanceof Error && (error as { isOperational?: boolean }).isOperational) {
                throw error;
            }
            throw new InternalError(
                'Error creando pedido',
                error instanceof Error ? { cause: error.message } : undefined
            );
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * RF-06: el administrador confirma manualmente que un pedido EN_RUTA fue entregado.
     * Si era el último pedido pendiente del viaje, cierra el viaje como COMPLETADO.
     */
    async confirmarEntrega(id_pedido: string): Promise<EntregaView> {
        const qr = this.dataSource.createQueryRunner();
        await qr.connect();
        await qr.startTransaction();
        try {
            const pedidoRows: Array<{ id_pedido: string; descripcion_status: string; id_viaje: string | null }> =
                await qr.query(
                    `SELECT id_pedido, descripcion_status, id_viaje FROM pedidos WHERE id_pedido = $1 FOR UPDATE`,
                    [id_pedido]
                );
            const pedido = pedidoRows[0];
            if (!pedido) throw new NotFoundError(`Pedido ${id_pedido} no existe`);
            if (pedido.descripcion_status !== 'EN_RUTA') {
                throw new ConflictError(
                    `El pedido solo puede confirmarse en estado EN_RUTA (actual: ${pedido.descripcion_status})`,
                    { id_pedido, estado_actual: pedido.descripcion_status }
                );
            }
            if (!pedido.id_viaje) throw new ConflictError('El pedido no tiene viaje asignado', { id_pedido });

            const viajeRows: Array<{ status: string }> = await qr.query(
                `SELECT status FROM viajes WHERE id_viaje = $1 FOR UPDATE`,
                [pedido.id_viaje]
            );
            const viaje = viajeRows[0];
            if (!viaje || !['EN_CAMINO', 'EN_ENTREGA'].includes(viaje.status)) {
                throw new ConflictError(
                    `El viaje no está en estado válido para confirmar entrega (actual: ${viaje?.status ?? 'no encontrado'})`,
                    { id_viaje: pedido.id_viaje, estado_viaje: viaje?.status ?? null }
                );
            }

            const ahora = this.now();
            await qr.manager.update(PedidoEntity, { id_pedido }, { descripcion_status: 'ENTREGADO', hora_entrega: ahora });

            const countRows: Array<{ c: string | number }> = await qr.query(
                `SELECT COUNT(*)::int AS c FROM pedidos WHERE id_viaje = $1 AND descripcion_status != 'ENTREGADO'`,
                [pedido.id_viaje]
            );
            const pendientes = Number(countRows[0]?.c ?? 1);
            let viaje_completado = false;
            if (pendientes === 0) {
                await qr.manager.update(ViajeEntity, { id_viaje: pedido.id_viaje }, { status: 'COMPLETADO', hora_llegada: ahora });
                viaje_completado = true;
            }

            await qr.commitTransaction();
            return { id_pedido, descripcion_status: 'ENTREGADO', hora_entrega: ahora.toISOString(), id_viaje: pedido.id_viaje, viaje_completado };
        } catch (error) {
            await qr.rollbackTransaction();
            if (error instanceof Error && (error as { isOperational?: boolean }).isOperational) throw error;
            throw new InternalError('Error confirmando entrega', error instanceof Error ? { cause: error.message } : undefined);
        } finally {
            await qr.release();
        }
    }
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const round3 = (n: number): number => Math.round(n * 1000) / 1000;
const round4 = (n: number): number => Math.round(n * 10000) / 10000;

/**
 * Fábrica por defecto que inyecta las dependencias reales.
 * Los tests pueden construir PedidoService directamente con mocks.
 */
export const buildPedidoService = (): PedidoService => {
    return new PedidoService({
        dataSource: AppDataSource,
        flotilla: FlotillaFacade,
        regionId: process.env.REGION_ID || 'LOCAL'
    });
};
