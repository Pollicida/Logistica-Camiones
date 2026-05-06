import { DataSource } from 'typeorm';
import { AppDataSource } from '../../../core/database';
import {
    ColaMapper,
    GrupoColaView,
    PedidoColaRaw,
    PedidoColaView
} from '../mappers/cola.mapper';

/**
 * Radio por defecto (metros) para considerar dos pedidos "cercanos" al agrupar.
 * Basado en el documento de requisitos (5 km). Configurable por petición.
 */
export const RADIO_PROXIMIDAD_METROS_DEFAULT = 5000;

/**
 * Máximo de pedidos por grupo sugerido: límite físico por viaje definido en RF-04.
 * Evita sugerir agrupaciones que después no podrían asignarse a un único camión.
 */
export const MAX_PEDIDOS_POR_GRUPO = 9;

export interface ColaServiceDeps {
    dataSource: DataSource;
    regionId: string;
    now?: () => Date;
}

export interface ListarGruposOptions {
    radioMetros?: number;
    maxPedidosPorGrupo?: number;
}

/**
 * Servicio responsable de RF-02: consulta de la cola de pedidos (EN_COLA)
 * y sugerencia de agrupaciones por proximidad.
 * Aislado del servicio de creación porque tiene preocupaciones distintas
 * (solo lectura, queries espaciales) y distinto contrato hacia el controlador.
 */
export class ColaService {
    private readonly dataSource: DataSource;
    private readonly regionId: string;
    private readonly now: () => Date;

    constructor(deps: ColaServiceDeps) {
        this.dataSource = deps.dataSource;
        this.regionId = deps.regionId;
        this.now = deps.now ?? (() => new Date());
    }

    /**
     * Lista los pedidos EN_COLA de la región del servidor ordenados así:
     *  - Prioridad ALTA antes que NORMAL
     *  - Dentro del mismo nivel de prioridad, FIFO por hora_pedido ASC
     */
    async listarCola(): Promise<PedidoColaView[]> {
        const rows = await this.consultarPedidosEnCola();
        const ahora = this.now();
        return rows.map(r => ColaMapper.toPedidoView(r, ahora));
    }

    /**
     * Devuelve grupos sugeridos de pedidos cercanos geográficamente.
     * Estrategia greedy: el primer pedido no agrupado (respetando el orden de cola)
     * actúa como semilla; se le añaden los pedidos cuya ubicación esté dentro del
     * radio configurado, hasta agotar la capacidad del grupo (9 pedidos).
     */
    async listarGruposSugeridos(options: ListarGruposOptions = {}): Promise<GrupoColaView[]> {
        const radioMetros = options.radioMetros ?? RADIO_PROXIMIDAD_METROS_DEFAULT;
        const maxPorGrupo = options.maxPedidosPorGrupo ?? MAX_PEDIDOS_POR_GRUPO;

        const rows = await this.consultarPedidosEnCola();
        const ahora = this.now();
        const pedidos = rows.map(r => ColaMapper.toPedidoView(r, ahora));

        const grupos: GrupoColaView[] = [];
        const asignados = new Set<string>();

        for (const semilla of pedidos) {
            if (asignados.has(semilla.id_pedido)) continue;

            const grupo: PedidoColaView[] = [semilla];
            asignados.add(semilla.id_pedido);

            // Los pedidos sin coordenadas no pueden participar en agrupamiento espacial.
            if (semilla.latitud !== null && semilla.longitud !== null) {
                for (const candidato of pedidos) {
                    if (grupo.length >= maxPorGrupo) break;
                    if (asignados.has(candidato.id_pedido)) continue;
                    if (candidato.latitud === null || candidato.longitud === null) continue;
                    const distancia = distanciaMetros(
                        semilla.latitud, semilla.longitud,
                        candidato.latitud, candidato.longitud
                    );
                    if (distancia <= radioMetros) {
                        grupo.push(candidato);
                        asignados.add(candidato.id_pedido);
                    }
                }
            }

            grupos.push(ColaMapper.toGrupoView(grupos.length + 1, grupo));
        }

        return grupos;
    }

    private async consultarPedidosEnCola(): Promise<PedidoColaRaw[]> {
        // SQL crudo porque TypeORM no expone directamente ST_X/ST_Y de PostGIS
        // y necesitamos las coordenadas numéricas en la respuesta del endpoint.
        const sql = `
            SELECT
                p.id_pedido,
                p.id_cliente,
                c.nombre_cliente,
                c.direccion,
                CASE WHEN c.ubicacion IS NULL THEN NULL ELSE ST_Y(c.ubicacion::geometry) END AS latitud,
                CASE WHEN c.ubicacion IS NULL THEN NULL ELSE ST_X(c.ubicacion::geometry) END AS longitud,
                p.total,
                p.peso_total,
                p.volumen_total,
                p.prioridad,
                p.hora_pedido
            FROM pedidos p
            INNER JOIN clientes c ON c.id_cliente = p.id_cliente
            WHERE p.descripcion_status = 'EN_COLA'
              AND p.id_region = $1
            ORDER BY
                CASE p.prioridad WHEN 'ALTA' THEN 0 ELSE 1 END ASC,
                p.hora_pedido ASC
        `;
        const raw: unknown[] = await this.dataSource.query(sql, [this.regionId]);
        return raw as PedidoColaRaw[];
    }
}

/**
 * Distancia aproximada entre dos coordenadas WGS84 usando fórmula Haversine.
 * Usada solo para el agrupamiento en memoria; para consultas filtradas por BD
 * se debería usar ST_DWithin directamente. Esta aproximación es suficiente
 * (error < 0.5%) dentro del radio de operación (decenas de km).
 */
const distanciaMetros = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371000; // radio de la Tierra en metros
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

export const buildColaService = (): ColaService => {
    return new ColaService({
        dataSource: AppDataSource,
        regionId: process.env.REGION_ID || 'LOCAL'
    });
};
