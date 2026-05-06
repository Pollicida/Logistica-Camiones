import * as https from 'https';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import { AppDataSource } from '../../../core/database';

export interface RuteoParams {
    id_viaje: string;
    id_region: string;
    id_camion: string;
    id_pedidos: string[];
}

interface ClienteCoords {
    id_pedido: string;
    latitud: number | null;
    longitud: number | null;
}

interface GoogleMapsLeg {
    distance: { value: number };  // metros
    duration: { value: number };  // segundos
    end_location: { lat: number; lng: number };
}

interface GoogleMapsRoute {
    legs: GoogleMapsLeg[];
    waypoint_order: number[];
    overview_polyline?: { points: string };
}

interface GoogleMapsResponse {
    status: string;
    routes: GoogleMapsRoute[];
}

export class RuteoService {
    private readonly dataSource: DataSource;
    private readonly apiKey: string | undefined;

    constructor(dataSource: DataSource, apiKey?: string) {
        this.dataSource = dataSource;
        this.apiKey = apiKey;
    }

    /**
     * Calcula la ruta óptima para el viaje vía Google Maps Directions API,
     * persiste Rutas + Puntos_Ruta y actualiza viajes.id_ruta.
     * Devuelve el id_ruta generado, o null si no hay API key o Google Maps falla.
     */
    async calcularYAsignarRuta(params: RuteoParams): Promise<string | null> {
        console.log('\n--- 🗺️ INICIANDO CÁLCULO DE RUTA ---');
        console.log(`[Ruteo] Viaje: ${params.id_viaje} | Pedidos a procesar: ${params.id_pedidos.length}`);

        if (!this.apiKey) {
            console.error('❌ ERROR: GOOGLE_MAPS_API_KEY no está configurada en tu archivo .env');
            return null;
        }

        const puntosEntrega = await this.consultarCoordenadasClientes(params.id_pedidos);
        const entregasConCoords = puntosEntrega.filter(p => p.latitud !== null && p.longitud !== null) as
            Array<{ id_pedido: string; latitud: number; longitud: number }>;

        console.log(`[Ruteo] Coordenadas encontradas en BD: ${entregasConCoords.length} de ${params.id_pedidos.length} pedidos.`);

        const primerPunto = entregasConCoords[0];
        if (entregasConCoords.length === 0 || !primerPunto) {
            console.error('❌ ERROR: Ningún cliente tiene coordenadas válidas (lat/lng) en la base de datos.');
            return null;
        }
        // 1. Separar el origen por defecto para que Google calcule una ruta real
        // Si no hay telemetría, fingimos que sale de un almacén central un poco más lejos
        const origen = await this.consultarOrigenCamion(params.id_camion) ?? {
            latitud: 25.6682,  // Coordenada distinta para forzar una ruta
            longitud: -100.3126
        };

        console.log(`[Ruteo] Origen definido: [${origen.latitud}, ${origen.longitud}]`);
        console.log(`[Ruteo] Llamando a Google Maps API...`);

        const mapsResp = await this.llamarGoogleMaps(origen, entregasConCoords);
        if (!mapsResp || mapsResp.status !== 'OK' || !mapsResp.routes[0]) {
            console.warn('[Ruteo] Falla en Google Maps. Status:', mapsResp?.status);
            return null;
        }

        const ruta = mapsResp.routes[0];
        console.log('✅ Ruta calculada con éxito por Google Maps. Procesando waypoints...');

        const puntosOrdenados = this.ordenarPuntosPorWaypointOrder(entregasConCoords, ruta.waypoint_order);

        // 2. ¡EL ARREGLO ESTÁ AQUÍ! Unimos el origen con los puntos de entrega
        const puntosCompletos = [origen, ...puntosOrdenados];

        const distanciaKm = ruta.legs.reduce((acc, l) => acc + l.distance.value, 0) / 1000;
        const tiempoMin = Math.round(ruta.legs.reduce((acc, l) => acc + l.duration.value, 0) / 60);

        console.log(`[Ruteo] Guardando ruta de ${distanciaKm.toFixed(2)} km y ${tiempoMin} minutos.`);

        try {
            return await this.persistirRuta({
                id_viaje: params.id_viaje,
                id_region: params.id_region,
                distanciaKm,
                tiempoMin,
                puntos: puntosCompletos // Pasamos el arreglo completo (mínimo 2 puntos)
            });
        } catch (error) {
            console.error('❌ ERROR AL GUARDAR EN BD:', error);
            return null;
        }
    }

    private async consultarCoordenadasClientes(id_pedidos: string[]): Promise<ClienteCoords[]> {
        const sql = `
            SELECT p.id_pedido,
                   CASE WHEN c.ubicacion IS NULL THEN NULL ELSE ST_Y(c.ubicacion::geometry) END AS latitud,
                   CASE WHEN c.ubicacion IS NULL THEN NULL ELSE ST_X(c.ubicacion::geometry) END AS longitud
            FROM pedidos p
            INNER JOIN clientes c ON c.id_cliente = p.id_cliente
            WHERE p.id_pedido = ANY($1::uuid[])
        `;
        const rows: Array<{ id_pedido: string; latitud: string | null; longitud: string | null }>
            = await this.dataSource.query(sql, [id_pedidos]);
        return rows.map(r => ({
            id_pedido: r.id_pedido,
            latitud: r.latitud === null ? null : Number(r.latitud),
            longitud: r.longitud === null ? null : Number(r.longitud)
        }));
    }

    private async consultarOrigenCamion(id_camion: string): Promise<{ latitud: number; longitud: number } | null> {
        const sql = `
            SELECT ST_Y(ubicacion_actual::geometry) AS latitud,
                   ST_X(ubicacion_actual::geometry) AS longitud
            FROM telemetria_camiones
            WHERE id_camion = $1
            ORDER BY fecha_registro DESC
            LIMIT 1
        `;
        const rows: Array<{ latitud: string | number; longitud: string | number }>
            = await this.dataSource.query(sql, [id_camion]);
        const r = rows[0];
        if (!r) return null;
        return { latitud: Number(r.latitud), longitud: Number(r.longitud) };
    }

    private llamarGoogleMaps(
        origen: { latitud: number; longitud: number },
        entregas: Array<{ latitud: number; longitud: number }>
    ): Promise<GoogleMapsResponse | null> {
        const dest = entregas.at(-1);
        if (!dest) return Promise.resolve(null);
        const waypoints = entregas.slice(0, -1)
            .map(p => `${p.latitud},${p.longitud}`)
            .join('|');

        const params = new URLSearchParams({
            origin: `${origen.latitud},${origen.longitud}`,
            destination: `${dest.latitud},${dest.longitud}`,
            key: this.apiKey!
        });
        if (waypoints) {
            params.set('waypoints', `optimize:true|${waypoints}`);
        }

        const url = `https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`;

        return new Promise((resolve) => {
            https.get(url, (res) => {
                let data = '';
                res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data) as GoogleMapsResponse);
                    } catch {
                        resolve(null);
                    }
                });
            }).on('error', () => resolve(null));
        });
    }

    private ordenarPuntosPorWaypointOrder(
        entregas: Array<{ latitud: number; longitud: number }>,
        waypointOrder: number[]
    ): Array<{ latitud: number; longitud: number }> {
        if (!waypointOrder || waypointOrder.length === 0) return entregas;
        const ultimo = entregas.at(-1);
        if (!ultimo) return entregas;
        const intermedios = waypointOrder
            .map(i => entregas[i])
            .filter((p): p is { latitud: number; longitud: number } => p !== undefined);
        // El destino original pasa a ser el último punto en el orden optimizado
        return [...intermedios, ultimo];
    }

    private async persistirRuta(params: {
        id_viaje: string;
        id_region: string;
        distanciaKm: number;
        tiempoMin: number;
        puntos: Array<{ latitud: number; longitud: number }>;
    }): Promise<string> {
        const id_ruta = randomUUID();
        const nombre_ruta = `RUTA-VIAJE-${params.id_viaje.substring(0, 8)}`;

        // LineString requiere mínimo 2 puntos
        const linestring = params.puntos.length >= 2
            ? `LINESTRING(${params.puntos.map(p => `${p.longitud} ${p.latitud}`).join(', ')})`
            : null;

        await this.dataSource.query(
            `INSERT INTO rutas (id_ruta, nombre_ruta, distancia_km, tiempo_estimado_minutos, ruta_espacial, id_region)
             VALUES ($1, $2, $3, $4, ${linestring ? `ST_SetSRID(ST_GeomFromText($5), 4326)` : 'NULL'}, ${linestring ? '$6' : '$5'})`,
            linestring
                ? [id_ruta, nombre_ruta, params.distanciaKm, params.tiempoMin, linestring, params.id_region]
                : [id_ruta, nombre_ruta, params.distanciaKm, params.tiempoMin, params.id_region]
        );

        for (let i = 0; i < params.puntos.length; i++) {
            const p = params.puntos[i];
            if (!p) continue;
            await this.dataSource.query(
                // ¡AQUÍ ESTÁ LA MAGIA! Le agregamos ::float a los parámetros dentro de ST_MakePoint
                `INSERT INTO puntos_ruta (id_punto, id_ruta, latitud, longitud, ubicacion_punto, orden_parada)
                 VALUES ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($4::float, $3::float), 4326), $5)`,
                [randomUUID(), id_ruta, p.latitud, p.longitud, i + 1]
            );
        }

        await this.dataSource.query(
            `UPDATE viajes SET id_ruta = $1 WHERE id_viaje = $2`,
            [id_ruta, params.id_viaje]
        );

        return id_ruta;
    }
}

export const buildRuteoService = (): RuteoService =>
    new RuteoService(AppDataSource, process.env.GOOGLE_MAPS_API_KEY);
