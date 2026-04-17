/**
 * CAPA DE DOMINIO — Puerto de salida (driven port)
 * Define el contrato que debe cumplir cualquier adaptador de persistencia.
 */
import { LecturaTelemetria } from '../models/LecturaTelemetria';

export interface ITelemetriaRepository {
    /**
     * Persiste una lectura de telemetría en la base de datos.
     * @param lectura - El objeto de valor del dominio
     * @param id_viaje - El viaje activo del camión (null si no hay viaje en curso)
     */
    guardarLectura(lectura: LecturaTelemetria, id_viaje: string | null): Promise<void>;

    /**
     * Consulta el ID del viaje activo ('EN_CURSO') para un camión dado.
     * @returns el id_viaje o null si el camión no tiene viaje activo
     */
    buscarViajeActivoPorCamion(id_camion: string): Promise<string | null>;
}
