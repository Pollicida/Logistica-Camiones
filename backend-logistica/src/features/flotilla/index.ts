import { AppDataSource } from '../../core/database';
import { CamionEntity } from './models/camion.entity';
import { ConductorEntity } from './models/conductor.entity';
import { ClienteEntity } from './models/cliente.entity';
import { ProveedorEntity } from './models/proveedor.entity';

// 1. Exportamos las rutas para que Express las monte en el servidor principal
export { flotillaRouter } from './flotilla.routeS';

/**
 * Tipo expuesto por la fachada para describir el techo físico de la flota regional.
 * carga en kg; volumen en m³ (puede ser null si no se captura).
 */
export interface CapacidadCamionResumen {
    capacidad_carga: number;
    capacidad_volumen: number | null;
}

/**
 * Camión disponible para un viaje (activo, sin viaje en curso y con capacidad suficiente).
 * Retornado por listarCamionesDisponiblesParaAsignacion, consumido por Operaciones (RF-03).
 */
export interface CamionDisponible {
    id_camion: string;
    marca: string;
    modelo: string;
    placas: string;
    capacidad_carga: number;
    capacidad_volumen: number | null;
}

export interface ConductorDisponible {
    id_conductor: string;
    nombres: string;
    apellido_paterno: string;
    apellido_materno: string | null;
    telefono: string | null;
}

export interface UbicacionCamion {
    latitud: number;
    longitud: number;
    fecha_registro: Date;
}

/**
 * 2. API INTERNA (Fachada)
 * Proporciona métodos de solo lectura para que otros módulos (como Operaciones o Ruteo)
 * puedan validar datos sin romper la encapsulación.
 */
export const FlotillaFacade = {

    // --- Lógica para Camiones ---
    obtenerCapacidadCamion: async (id_camion: string): Promise<number | null> => {
        const repo = AppDataSource.getRepository(CamionEntity);
        const camion = await repo.findOne({ where: { id_camion, activo: true } });
        return camion ? Number(camion.capacidad_carga) : null;
    },

    /**
     * Devuelve el techo físico de la flota regional (consumido por Operaciones -> Regla 2).
     * Estrategia: el camión con mayor capacidad_carga entre los activos de la región representa
     * el máximo que la región puede mover en un solo viaje. El volumen asociado acompaña al mismo
     * registro para mantener consistencia (no se mezclan capacidades de camiones distintos).
     */
    obtenerCapacidadMaximaCamion: async (id_region: string): Promise<CapacidadCamionResumen | null> => {
        const repo = AppDataSource.getRepository(CamionEntity);
        const camion = await repo
            .createQueryBuilder('c')
            .where('c.activo = :activo', { activo: true })
            .andWhere('c.id_region = :id_region', { id_region })
            .orderBy('c.capacidad_carga', 'DESC')
            .limit(1)
            .getOne();
        if (!camion) return null;
        return {
            capacidad_carga: Number(camion.capacidad_carga),
            capacidad_volumen: camion.capacidad_volumen === null ? null : Number(camion.capacidad_volumen)
        };
    },

    // --- Lógica para Conductores ---
    verificarConductorActivo: async (id_conductor: string): Promise<boolean> => {
        const repo = AppDataSource.getRepository(ConductorEntity);
        const conductor = await repo.findOne({ where: { id_conductor, activo: true } });
        return conductor !== null;
    },

    // --- Lógica para Clientes (Vital para el módulo de Operaciones) ---
    obtenerUbicacionCliente: async (id_cliente: string): Promise<string | null> => {
        const repo = AppDataSource.getRepository(ClienteEntity);
        const cliente = await repo.findOne({
            select: ['ubicacion'], // Solo pedimos la columna espacial
            where: { id_cliente, activo: true }
        });
        return cliente ? cliente.ubicacion : null;
    },

    /**
     * Valida que un cliente exista, esté activo y pertenezca a la región indicada.
     * Consumido por Operaciones al crear un pedido (aislamiento multi-región).
     * Retorna el estado específico para que el servicio decida qué error emitir (404 vs 403).
     */
    validarClienteParaRegion: async (
        id_cliente: string,
        id_region: string
    ): Promise<{ estado: 'OK' } | { estado: 'NO_ENCONTRADO' } | { estado: 'REGION_INCORRECTA'; id_region_cliente: string | null }> => {
        const repo = AppDataSource.getRepository(ClienteEntity);
        const cliente = await repo.findOne({
            select: ['id_cliente', 'activo', 'id_region'],
            where: { id_cliente, activo: true }
        });
        if (!cliente) return { estado: 'NO_ENCONTRADO' };
        if (cliente.id_region !== id_region) {
            return { estado: 'REGION_INCORRECTA', id_region_cliente: cliente.id_region };
        }
        return { estado: 'OK' };
    },

    // --- Lógica para Proveedores ---
    verificarProveedorActivo: async (id_proveedor: string): Promise<boolean> => {
        const repo = AppDataSource.getRepository(ProveedorEntity);
        const proveedor = await repo.findOne({ where: { id_proveedor, activo: true } });
        return proveedor !== null;
    },

    /**
     * Devuelve camiones activos de la región con capacidad suficiente (peso y volumen)
     * y SIN un viaje en curso. Consumido por Operaciones al sugerir asignación (RF-03).
     * Estados finales del viaje: COMPLETADO, CANCELADO. Cualquier otro se considera "activo".
     */
    listarCamionesDisponiblesParaAsignacion: async (
        id_region: string,
        pesoRequeridoKg: number,
        volumenRequeridoM3: number
    ): Promise<CamionDisponible[]> => {
        const sql = `
            SELECT c.id_camion, c.marca, c.modelo, c.placas,
                   c.capacidad_carga, c.capacidad_volumen
            FROM camiones c
            WHERE c.activo = TRUE
              AND c.id_region = $1
              AND c.capacidad_carga >= $2
              AND (c.capacidad_volumen IS NULL OR c.capacidad_volumen >= $3)
              AND NOT EXISTS (
                  SELECT 1 FROM viajes v
                  WHERE v.id_camion = c.id_camion
                    AND v.status NOT IN ('COMPLETADO', 'CANCELADO')
              )
            ORDER BY c.capacidad_carga ASC
        `;
        const rows: Array<{
            id_camion: string;
            marca: string;
            modelo: string;
            placas: string;
            capacidad_carga: string | number;
            capacidad_volumen: string | number | null;
        }> = await AppDataSource.query(sql, [id_region, pesoRequeridoKg, volumenRequeridoM3]);
        return rows.map(r => ({
            id_camion: r.id_camion,
            marca: r.marca,
            modelo: r.modelo,
            placas: r.placas,
            capacidad_carga: Number(r.capacidad_carga),
            capacidad_volumen: r.capacidad_volumen === null ? null : Number(r.capacidad_volumen)
        }));
    },

    /**
     * Conductores activos de la región que no están en un viaje en curso.
     */
    listarConductoresDisponibles: async (id_region: string): Promise<ConductorDisponible[]> => {
        const sql = `
            SELECT co.id_conductor, co.nombres, co.apellido_paterno, co.apellido_materno, co.telefono
            FROM conductores co
            WHERE co.activo = TRUE
              AND co.id_region = $1
              AND NOT EXISTS (
                  SELECT 1 FROM viajes v
                  WHERE v.id_conductor = co.id_conductor
                    AND v.status NOT IN ('COMPLETADO', 'CANCELADO')
              )
            ORDER BY co.fecha_ingreso ASC
        `;
        const rows: ConductorDisponible[] = await AppDataSource.query(sql, [id_region]);
        return rows;
    },

    /**
     * Última lectura de telemetría del camión (ubicación actual aproximada).
     * Devuelve null si el camión nunca reportó telemetría.
     */
    obtenerUltimaUbicacionCamion: async (id_camion: string): Promise<UbicacionCamion | null> => {
        const sql = `
            SELECT ST_Y(ubicacion_actual::geometry) AS latitud,
                   ST_X(ubicacion_actual::geometry) AS longitud,
                   fecha_registro
            FROM telemetria_camiones
            WHERE id_camion = $1
            ORDER BY fecha_registro DESC
            LIMIT 1
        `;
        const rows: Array<{ latitud: string | number; longitud: string | number; fecha_registro: Date | string }>
            = await AppDataSource.query(sql, [id_camion]);
        const r = rows[0];
        if (!r) return null;
        return {
            latitud: Number(r.latitud),
            longitud: Number(r.longitud),
            fecha_registro: r.fecha_registro instanceof Date ? r.fecha_registro : new Date(r.fecha_registro)
        };
    },

    // --- Lógica de Negocio Cruzada ---
    validarEntidadesParaViaje: async (id_camion: string, id_conductor: string): Promise<{ valido: boolean, error?: string }> => {
        const [camionRepo, condRepo] = [
            AppDataSource.getRepository(CamionEntity),
            AppDataSource.getRepository(ConductorEntity)
        ];

        const camion = await camionRepo.findOne({ where: { id_camion, activo: true } });
        if (!camion) return { valido: false, error: 'El camión no existe o no está activo' };

        const conductor = await condRepo.findOne({ where: { id_conductor, activo: true } });
        if (!conductor) return { valido: false, error: 'El conductor no existe o no está activo' };

        return { valido: true };
    }
};