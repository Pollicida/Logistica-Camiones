import { PedidoPrioridad } from '../models/pedido.entity';

export interface PedidoResumenView {
    id_pedido: string;
    id_cliente: string;
    nombre_cliente: string;
    latitud: number | null;
    longitud: number | null;
    peso_total_kg: number;
    volumen_total_m3: number;
    prioridad: PedidoPrioridad;
}

export interface CentroideView {
    latitud: number;
    longitud: number;
}

export interface TotalesAsignacionView {
    cantidad_pedidos: number;
    peso_total_kg: number;
    volumen_total_m3: number;
    centroide: CentroideView | null;
}

export interface UbicacionCamionView {
    latitud: number;
    longitud: number;
    fecha_registro: string;
}

export interface ConductorSugeridoView {
    id_conductor: string;
    nombre_completo: string;
    telefono: string | null;
}

export interface CamionSugeridoView {
    id_camion: string;
    marca: string;
    modelo: string;
    placas: string;
    capacidad_carga_kg: number;
    capacidad_volumen_m3: number | null;
    capacidad_carga_disponible_kg: number;
    capacidad_volumen_disponible_m3: number | null;
    ubicacion_actual: UbicacionCamionView | null;
    distancia_a_centroide_metros: number | null;
    conductor_sugerido: ConductorSugeridoView | null;
}

export interface SugerenciaAsignacionView {
    pedidos: PedidoResumenView[];
    totales: TotalesAsignacionView;
    camiones_sugeridos: CamionSugeridoView[];
}
