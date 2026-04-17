/**
 * CAPA DE DOMINIO — Puerto de salida (driven port)
 * Define el contrato que debe cumplir cualquier adaptador de publicación en tiempo real.
 */
import { LecturaTelemetria } from '../models/LecturaTelemetria';

export interface ITelemetriaPublisher {
    /**
     * Publica una lectura de telemetría hacia los clientes conectados en tiempo real.
     */
    publicar(lectura: LecturaTelemetria): void;
}
