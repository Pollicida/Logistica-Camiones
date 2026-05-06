import { PedidoPrioridad } from '../models/pedido.entity';

/**
 * Fila plana que representa un pedido en la cola de espera, con la información
 * mínima que el administrador necesita para decidir la asignación (cliente,
 * dirección, coordenadas y métricas del pedido).
 */
export interface PedidoColaView {
    id_pedido: string;
    id_cliente: string;
    nombre_cliente: string;
    direccion: string;
    latitud: number | null;
    longitud: number | null;
    total: number;
    peso_total_kg: number;
    volumen_total_m3: number;
    prioridad: PedidoPrioridad;
    hora_pedido: string;
    tiempo_en_cola_segundos: number;
}

/**
 * Grupo sugerido: conjunto de pedidos cercanos geográficamente que podrían
 * cargarse en el mismo camión. El orden interno conserva prioridad + FIFO.
 */
export interface GrupoColaView {
    id_grupo: number;
    cantidad_pedidos: number;
    peso_total_kg: number;
    volumen_total_m3: number;
    total_monetario: number;
    pedidos: PedidoColaView[];
}

export interface PedidoColaRaw {
    id_pedido: string;
    id_cliente: string;
    nombre_cliente: string;
    direccion: string;
    latitud: string | number | null;
    longitud: string | number | null;
    total: string | number;
    peso_total: string | number;
    volumen_total: string | number;
    prioridad: PedidoPrioridad;
    hora_pedido: Date;
}

export const ColaMapper = {
    toPedidoView(row: PedidoColaRaw, ahora: Date): PedidoColaView {
        const horaPedido = row.hora_pedido instanceof Date ? row.hora_pedido : new Date(row.hora_pedido);
        return {
            id_pedido: row.id_pedido,
            id_cliente: row.id_cliente,
            nombre_cliente: row.nombre_cliente,
            direccion: row.direccion,
            latitud: row.latitud === null ? null : Number(row.latitud),
            longitud: row.longitud === null ? null : Number(row.longitud),
            total: Number(row.total),
            peso_total_kg: Number(row.peso_total),
            volumen_total_m3: Number(row.volumen_total),
            prioridad: row.prioridad,
            hora_pedido: horaPedido.toISOString(),
            tiempo_en_cola_segundos: Math.max(0, Math.floor((ahora.getTime() - horaPedido.getTime()) / 1000))
        };
    },

    toGrupoView(id_grupo: number, pedidos: PedidoColaView[]): GrupoColaView {
        const peso = pedidos.reduce((acc, p) => acc + p.peso_total_kg, 0);
        const volumen = pedidos.reduce((acc, p) => acc + p.volumen_total_m3, 0);
        const total = pedidos.reduce((acc, p) => acc + p.total, 0);
        return {
            id_grupo,
            cantidad_pedidos: pedidos.length,
            peso_total_kg: round3(peso),
            volumen_total_m3: round4(volumen),
            total_monetario: round2(total),
            pedidos
        };
    }
};

const round2 = (n: number): number => Math.round(n * 100) / 100;
const round3 = (n: number): number => Math.round(n * 1000) / 1000;
const round4 = (n: number): number => Math.round(n * 10000) / 10000;
