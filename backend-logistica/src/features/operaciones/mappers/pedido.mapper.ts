import { PedidoEntity } from '../models/pedido.entity';
import { DetallePedidoEntity } from '../models/detalle-pedido.entity';

export interface DetallePedidoView {
    id_detalle: string;
    id_producto: string;
    cantidad: number;
    precio_unitario: number;
    subtotal: number;
}

export interface PedidoView {
    id_pedido: string;
    id_cliente: string | null;
    total: number;
    hora_pedido: string;
    descripcion_status: string;
    descripcion: string | null;
    id_region: string | null;
    detalles: DetallePedidoView[];
    metricas: {
        peso_total_kg: number;
        volumen_total_m3: number;
    };
}

export const PedidoMapper = {
    toView(
        pedido: PedidoEntity,
        detalles: DetallePedidoEntity[],
        metricas: { peso_total_kg: number; volumen_total_m3: number }
    ): PedidoView {
        return {
            id_pedido: pedido.id_pedido,
            id_cliente: pedido.id_cliente,
            total: Number(pedido.total),
            hora_pedido: pedido.hora_pedido.toISOString(),
            descripcion_status: pedido.descripcion_status,
            descripcion: pedido.descripcion,
            id_region: pedido.id_region,
            detalles: detalles.map(d => ({
                id_detalle: d.id_detalle,
                id_producto: d.id_producto,
                cantidad: d.cantidad,
                precio_unitario: Number(d.precio_unitario),
                subtotal: Number(d.precio_unitario) * d.cantidad
            })),
            metricas: {
                peso_total_kg: metricas.peso_total_kg,
                volumen_total_m3: metricas.volumen_total_m3
            }
        };
    }
};
