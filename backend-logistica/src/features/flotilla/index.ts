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

    // --- Lógica para Proveedores ---
    verificarProveedorActivo: async (id_proveedor: string): Promise<boolean> => {
        const repo = AppDataSource.getRepository(ProveedorEntity);
        const proveedor = await repo.findOne({ where: { id_proveedor, activo: true } });
        return proveedor !== null;
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