import { ViajeEntity, ViajeStatus } from '../models/viaje.entity';
import { PedidoPrioridad, PedidoStatus } from '../models/pedido.entity';

export interface DetallePedidoEnViajeView {
    id_producto: string;
    nombre_producto: string;
    cantidad: number;
    precio_unitario: number;
}

export interface PedidoEnViajeView {
    id_pedido: string;
    id_cliente: string | null;
    descripcion_status: PedidoStatus;
    prioridad: PedidoPrioridad;
    peso_total_kg: number;
    volumen_total_m3: number;
    detalles?: DetallePedidoEnViajeView[];
}

export interface CamionEnViajeView {
    id_camion: string;
    marca: string;
    modelo: string;
    placas: string;
    capacidad_carga_kg: number;
    capacidad_volumen_m3: number | null;
}

export interface ConductorEnViajeView {
    id_conductor: string;
    nombre_completo: string;
    telefono: string | null;
}

export interface ViajeView {
    id_viaje: string;
    numero_guia: string | null;
    status: ViajeStatus;
    id_camion: string;
    id_conductor: string | null;
    id_ruta: string | null;
    hora_salida: string | null;
    hora_llegada: string | null;
    id_region: string | null;
    fecha_actualizacion: string;
    pedidos?: PedidoEnViajeView[];
    camion?: CamionEnViajeView;
    conductor?: ConductorEnViajeView;
}

export interface ViajeMapperExtras {
    pedidos?: PedidoEnViajeView[];
    camion?: CamionEnViajeView;
    conductor?: ConductorEnViajeView;
}

export const ViajeMapper = {
    toView(viaje: ViajeEntity, extras: ViajeMapperExtras = {}): ViajeView {
        const view: ViajeView = {
            id_viaje: viaje.id_viaje,
            numero_guia: viaje.numero_guia,
            status: viaje.status,
            id_camion: viaje.id_camion,
            id_conductor: viaje.id_conductor,
            id_ruta: viaje.id_ruta,
            hora_salida: viaje.hora_salida ? viaje.hora_salida.toISOString() : null,
            hora_llegada: viaje.hora_llegada ? viaje.hora_llegada.toISOString() : null,
            id_region: viaje.id_region,
            fecha_actualizacion: viaje.fecha_actualizacion.toISOString()
        };
        if (extras.pedidos) view.pedidos = extras.pedidos;
        if (extras.camion) view.camion = extras.camion;
        if (extras.conductor) view.conductor = extras.conductor;
        return view;
    }
};

export const nombreCompletoConductor = (
    nombres: string,
    apellidoPaterno: string,
    apellidoMaterno: string | null
): string => {
    const apellidos = apellidoMaterno ? `${apellidoPaterno} ${apellidoMaterno}` : apellidoPaterno;
    return `${nombres} ${apellidos}`.trim();
};
