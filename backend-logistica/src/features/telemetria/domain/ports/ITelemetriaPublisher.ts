/**
 * CAPA DE DOMINIO — Puerto de salida (driven port)
 * Define el contrato que debe cumplir cualquier adaptador de publicación en tiempo real.
 */
import { LecturaTelemetria } from '../models/LecturaTelemetria';

export interface AnomaliaPayload {
    id_anomalia: string;
    id_viaje: string | null;
    id_camion: string;
    latitud: number;
    longitud: number;
    temperatura: number;
    fecha: string;
    region: string;
}

export interface ITelemetriaPublisher {
    publicar(lectura: LecturaTelemetria): void;
    publicarAnomalia(payload: AnomaliaPayload): void;
}
