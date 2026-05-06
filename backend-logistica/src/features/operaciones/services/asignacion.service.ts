import { DataSource } from 'typeorm';
import { AppDataSource } from '../../../core/database';
import {
    FlotillaFacade,
    CamionDisponible,
    ConductorDisponible,
    UbicacionCamion
} from '../../flotilla';
import {
    NotFoundError,
    ValidationError,
    ConflictError,
    ForbiddenError
} from '../../../core/errors/AppError';
import { SugerirAsignacionDTO, MAX_PEDIDOS_POR_ASIGNACION } from '../dto/sugerir-asignacion.dto';
import {
    CamionSugeridoView,
    CentroideView,
    PedidoResumenView,
    SugerenciaAsignacionView
} from '../mappers/asignacion.mapper';
import { PedidoPrioridad } from '../models/pedido.entity';

export interface FlotillaAsignacionLike {
    listarCamionesDisponiblesParaAsignacion(
        id_region: string,
        pesoRequeridoKg: number,
        volumenRequeridoM3: number
    ): Promise<CamionDisponible[]>;
    listarConductoresDisponibles(id_region: string): Promise<ConductorDisponible[]>;
    obtenerUltimaUbicacionCamion(id_camion: string): Promise<UbicacionCamion | null>;
}

export interface AsignacionServiceDeps {
    dataSource: DataSource;
    flotilla: FlotillaAsignacionLike;
    regionId: string;
}

interface PedidoRow {
    id_pedido: string;
    id_cliente: string;
    nombre_cliente: string;
    latitud: string | number | null;
    longitud: string | number | null;
    peso_total: string | number;
    volumen_total: string | number;
    prioridad: PedidoPrioridad;
    descripcion_status: string;
    id_region: string | null;
}

export class AsignacionService {
    private readonly dataSource: DataSource;
    private readonly flotilla: FlotillaAsignacionLike;
    private readonly regionId: string;

    constructor(deps: AsignacionServiceDeps) {
        this.dataSource = deps.dataSource;
        this.flotilla = deps.flotilla;
        this.regionId = deps.regionId;
    }

    /**
     * RF-03: Sugiere camiones para un grupo de pedidos de la cola.
     * No persiste nada: solo calcula y devuelve opciones para que el administrador confirme.
     */
    async sugerir(dto: SugerirAsignacionDTO): Promise<SugerenciaAsignacionView> {
        // 1. Validar pedidos existen, todos EN_COLA, todos en misma región = región del servidor
        const pedidos = await this.consultarPedidos(dto.id_pedidos);
        this.validarPedidos(dto.id_pedidos, pedidos);

        // 2. Totales y centroide (promedio de coordenadas disponibles)
        const pesoTotal = round3(pedidos.reduce((acc, p) => acc + Number(p.peso_total), 0));
        const volumenTotal = round4(pedidos.reduce((acc, p) => acc + Number(p.volumen_total), 0));
        const centroide = this.calcularCentroide(pedidos);

        // 3. Buscar camiones disponibles con capacidad suficiente
        const camiones = await this.flotilla.listarCamionesDisponiblesParaAsignacion(
            this.regionId,
            pesoTotal,
            volumenTotal
        );

        // 4. Enriquecer con ubicación actual + distancia al centroide
        const camionesConUbicacion = await Promise.all(camiones.map(async (c) => {
            const ubicacion = await this.flotilla.obtenerUltimaUbicacionCamion(c.id_camion);
            const distancia = (ubicacion && centroide)
                ? Math.round(distanciaMetros(centroide.latitud, centroide.longitud, ubicacion.latitud, ubicacion.longitud))
                : null;
            return { camion: c, ubicacion, distancia };
        }));

        // 5. Ordenar: primero con distancia conocida (ASC), luego los sin ubicación
        camionesConUbicacion.sort((a, b) => {
            if (a.distancia === null && b.distancia === null) return 0;
            if (a.distancia === null) return 1;
            if (b.distancia === null) return -1;
            return a.distancia - b.distancia;
        });

        // 6. Emparejar con conductores disponibles (1-a-1 en orden de camión sugerido)
        const conductores = await this.flotilla.listarConductoresDisponibles(this.regionId);
        const camionesSugeridos: CamionSugeridoView[] = camionesConUbicacion.map((item, idx) => {
            const conductor = conductores[idx] ?? null;
            return this.toCamionSugerido(item.camion, item.ubicacion, item.distancia, conductor, pesoTotal, volumenTotal);
        });

        return {
            pedidos: pedidos.map(toPedidoResumen),
            totales: {
                cantidad_pedidos: pedidos.length,
                peso_total_kg: pesoTotal,
                volumen_total_m3: volumenTotal,
                centroide
            },
            camiones_sugeridos: camionesSugeridos
        };
    }

    private async consultarPedidos(ids: string[]): Promise<PedidoRow[]> {
        // Usamos SQL crudo para hacer JOIN con clientes y extraer coordenadas con ST_X/ST_Y.
        // $1::uuid[] permite pasar el array completo a IN() de forma segura.
        const sql = `
            SELECT
                p.id_pedido,
                p.id_cliente,
                c.nombre_cliente,
                CASE WHEN c.ubicacion IS NULL THEN NULL ELSE ST_Y(c.ubicacion::geometry) END AS latitud,
                CASE WHEN c.ubicacion IS NULL THEN NULL ELSE ST_X(c.ubicacion::geometry) END AS longitud,
                p.peso_total,
                p.volumen_total,
                p.prioridad,
                p.descripcion_status,
                p.id_region
            FROM pedidos p
            INNER JOIN clientes c ON c.id_cliente = p.id_cliente
            WHERE p.id_pedido = ANY($1::uuid[])
        `;
        const rows: unknown[] = await this.dataSource.query(sql, [ids]);
        return rows as PedidoRow[];
    }

    private validarPedidos(ids: string[], pedidos: PedidoRow[]): void {
        if (ids.length > MAX_PEDIDOS_POR_ASIGNACION) {
            // Red de seguridad: el DTO ya validó pero defensa en profundidad.
            throw new ValidationError(`Máximo ${MAX_PEDIDOS_POR_ASIGNACION} pedidos por asignación`);
        }
        if (pedidos.length !== ids.length) {
            const encontrados = new Set(pedidos.map(p => p.id_pedido));
            const faltantes = ids.filter(id => !encontrados.has(id));
            throw new NotFoundError(
                `Pedidos no encontrados: ${faltantes.join(', ')}`,
                { ids_no_encontrados: faltantes }
            );
        }

        for (const p of pedidos) {
            if (p.descripcion_status !== 'EN_COLA') {
                throw new ConflictError(
                    `El pedido ${p.id_pedido} no está en estado EN_COLA (estado actual: ${p.descripcion_status})`,
                    { id_pedido: p.id_pedido, estado_actual: p.descripcion_status }
                );
            }
            if (p.id_region !== this.regionId) {
                throw new ForbiddenError(
                    `El pedido ${p.id_pedido} pertenece a la región ${p.id_region}, no a ${this.regionId}`
                );
            }
        }
    }

    private calcularCentroide(pedidos: PedidoRow[]): CentroideView | null {
        const conCoords = pedidos.filter(p => p.latitud !== null && p.longitud !== null);
        if (conCoords.length === 0) return null;
        const sumLat = conCoords.reduce((acc, p) => acc + Number(p.latitud), 0);
        const sumLng = conCoords.reduce((acc, p) => acc + Number(p.longitud), 0);
        return {
            latitud: round6(sumLat / conCoords.length),
            longitud: round6(sumLng / conCoords.length)
        };
    }

    private toCamionSugerido(
        camion: CamionDisponible,
        ubicacion: UbicacionCamion | null,
        distancia: number | null,
        conductor: ConductorDisponible | null,
        pesoUsadoKg: number,
        volumenUsadoM3: number
    ): CamionSugeridoView {
        return {
            id_camion: camion.id_camion,
            marca: camion.marca,
            modelo: camion.modelo,
            placas: camion.placas,
            capacidad_carga_kg: camion.capacidad_carga,
            capacidad_volumen_m3: camion.capacidad_volumen,
            capacidad_carga_disponible_kg: round3(camion.capacidad_carga - pesoUsadoKg),
            capacidad_volumen_disponible_m3: camion.capacidad_volumen === null
                ? null
                : round4(camion.capacidad_volumen - volumenUsadoM3),
            ubicacion_actual: ubicacion === null
                ? null
                : {
                    latitud: ubicacion.latitud,
                    longitud: ubicacion.longitud,
                    fecha_registro: ubicacion.fecha_registro.toISOString()
                },
            distancia_a_centroide_metros: distancia,
            conductor_sugerido: conductor === null ? null : {
                id_conductor: conductor.id_conductor,
                nombre_completo: `${conductor.nombres} ${conductor.apellido_paterno}${conductor.apellido_materno ? ' ' + conductor.apellido_materno : ''}`.trim(),
                telefono: conductor.telefono
            }
        };
    }
}

const toPedidoResumen = (p: PedidoRow): PedidoResumenView => ({
    id_pedido: p.id_pedido,
    id_cliente: p.id_cliente,
    nombre_cliente: p.nombre_cliente,
    latitud: p.latitud === null ? null : Number(p.latitud),
    longitud: p.longitud === null ? null : Number(p.longitud),
    peso_total_kg: Number(p.peso_total),
    volumen_total_m3: Number(p.volumen_total),
    prioridad: p.prioridad
});

const round3 = (n: number): number => Math.round(n * 1000) / 1000;
const round4 = (n: number): number => Math.round(n * 10000) / 10000;
const round6 = (n: number): number => Math.round(n * 1_000_000) / 1_000_000;

const distanciaMetros = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371000;
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

export const buildAsignacionService = (): AsignacionService => {
    return new AsignacionService({
        dataSource: AppDataSource,
        flotilla: FlotillaFacade,
        regionId: process.env.REGION_ID || 'LOCAL'
    });
};
