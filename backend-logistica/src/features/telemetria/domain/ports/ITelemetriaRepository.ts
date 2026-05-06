/**
 * CAPA DE DOMINIO — Puerto de salida (driven port)
 * Define el contrato que debe cumplir cualquier adaptador de persistencia.
 */
import { LecturaTelemetria } from '../models/LecturaTelemetria';

export interface ITelemetriaRepository {
    guardarLectura(lectura: LecturaTelemetria, id_viaje: string | null): Promise<void>;
    buscarViajeActivoPorCamion(id_camion: string): Promise<string | null>;
    registrarAnomalia(lectura: LecturaTelemetria, id_viaje: string | null): Promise<string>;
}
