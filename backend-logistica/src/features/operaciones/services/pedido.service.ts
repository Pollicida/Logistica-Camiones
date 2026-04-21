import { DataSource } from 'typeorm';
import { AppDataSource } from '../../../core/database';
import { FlotillaFacade, CapacidadCamionResumen } from '../../flotilla';
import {
    CapacidadExcedidaError,
    NotFoundError,
    StockInsuficienteError,
    InternalError
} from '../../../core/errors/AppError';
import { CrearPedidoDTO } from '../dto/crear-pedido.dto';
import { PedidoEntity } from '../models/pedido.entity';
import { DetallePedidoEntity } from '../models/detalle-pedido.entity';
import { ProductoEntity } from '../models/producto.entity';
import { PedidoMapper, PedidoView } from '../mappers/pedido.mapper';

export interface FlotillaFacadeLike {
    obtenerCapacidadMaximaCamion(id_region: string): Promise<CapacidadCamionResumen | null>;
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

    async crearPedido(dto: CrearPedidoDTO): Promise<PedidoView> {
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

            const pedidoRepo = queryRunner.manager.getRepository(PedidoEntity);
            const pedido = pedidoRepo.create({
                id_cliente: dto.id_cliente,
                total: total_pedido,
                hora_pedido: this.now(),
                descripcion_status: 'CREADO',
                hora_entrega: null,
                descripcion: dto.descripcion ?? null,
                id_viaje: null,
                id_region: this.regionId
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
