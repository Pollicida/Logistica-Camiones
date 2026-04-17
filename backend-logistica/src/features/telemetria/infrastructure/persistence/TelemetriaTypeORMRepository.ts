/**
 * CAPA DE INFRAESTRUCTURA — Adaptador de persistencia
 * Implementa ITelemetriaRepository usando CockroachDB vía TypeORM.
 *
 * Se usan queries raw para las operaciones con columnas GEOMETRY ya que
 * TypeORM + CockroachDB requiere las funciones espaciales explícitas
 * (ST_SetSRID / ST_MakePoint) para insertar correctamente.
 */
import { AppDataSource } from '../../../../core/database';
import { ITelemetriaRepository } from '../../domain/ports/ITelemetriaRepository';
import { LecturaTelemetria } from '../../domain/models/LecturaTelemetria';

export class TelemetriaTypeORMRepository implements ITelemetriaRepository {

    async guardarLectura(lectura: LecturaTelemetria, id_viaje: string | null): Promise<void> {
        // ST_MakePoint(longitud, latitud) — el orden es lon, lat (estándar WGS84)
        // ST_SetSRID asigna el sistema de referencia EPSG:4326
        await AppDataSource.query(
            `INSERT INTO telemetria_camiones
                (id_camion, id_viaje, ubicacion_actual, temperatura_caja, velocidad_kmh, fecha_registro)
             VALUES
                ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326), $5, NULL, $6)`,
            [
                lectura.id_camion,
                id_viaje,         // null si no hay viaje activo, la BD acepta NULL aquí
                lectura.longitud,
                lectura.latitud,
                lectura.temperatura,
                lectura.fecha,
            ]
        );
    }

    async buscarViajeActivoPorCamion(id_camion: string): Promise<string | null> {
        // Comunicación intra-BD: consulta la tabla Viajes directamente.
        // Para comunicación entre módulos en memoria, ver FlotillaFacade en index.ts.
        const rows: Array<{ id_viaje: string }> = await AppDataSource.query(
            `SELECT id_viaje FROM viajes
             WHERE id_camion = $1
               AND status = 'EN_CURSO'
             LIMIT 1`,
            [id_camion]
        );
        return rows[0]?.id_viaje ?? null;
    }
}
