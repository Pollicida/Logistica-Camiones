/**
 * PUNTO DE ENTRADA DEL MÓDULO — Telemetría
 *
 * Responsabilidades:
 *  1. Composition root: cablea las dependencias (DI manual).
 *  2. Expone inicializarTelemetria() para que main.ts lo llame.
 *  3. Registra los eventos WebSocket de suscripción/desuscripción de clientes.
 *  4. Exporta TelemetriaFacade para que otros módulos consulten datos sin
 *     romper el encapsulamiento (patrón Fachada inter-módulos).
 */
import { wsServer } from '../../core/server';
import { AppDataSource } from '../../core/database';
import { FlotillaFacade } from '../flotilla';

import { ProcesarTelemetriaUseCase } from './application/ProcesarTelemetriaUseCase';
import { TelemetriaTypeORMRepository } from './infrastructure/persistence/TelemetriaTypeORMRepository';
import { TelemetriaWSAdapter } from './infrastructure/websocket/TelemetriaWSAdapter';
import { TelemetriaMQTTAdapter } from './infrastructure/mqtt/TelemetriaMQTTAdapter';

// ==========================================
// INICIALIZACIÓN DEL MÓDULO
// ==========================================
export const inicializarTelemetria = (): void => {

    // --- Composition Root (Inyección de Dependencias manual) ---
    const repo      = new TelemetriaTypeORMRepository();
    const publisher = new TelemetriaWSAdapter(wsServer);
    const useCase   = new ProcesarTelemetriaUseCase(repo, publisher);
    const mqttAdapter = new TelemetriaMQTTAdapter(useCase);

    // 1. Activar la escucha de mensajes MQTT
    mqttAdapter.iniciar();

    // 2. Registrar eventos de suscripción para clientes WebSocket
    wsServer.on('connection', (socket) => {

        // Cliente solicita el feed global (todos los camiones de la región)
        socket.on('suscribir:telemetria', () => {
            socket.join('telemetria');
        });

        // Cliente solicita el feed de un camión específico
        socket.on('suscribir:camion', (id_camion: string) => {
            if (typeof id_camion === 'string' && id_camion.trim()) {
                socket.join(`camion:${id_camion}`);
            }
        });

        // Cliente deja de seguir un camión
        socket.on('desuscribir:camion', (id_camion: string) => {
            socket.leave(`camion:${id_camion}`);
        });
    });

    console.log('✅ [Telemetría] Módulo inicializado y escuchando MQTT.');
};

// ==========================================
// FACHADA PÚBLICA (API interna inter-módulos)
// Permite que otros módulos consulten datos de telemetría sin
// acceder directamente a la BD ni conocer los detalles de implementación.
// ==========================================
export const TelemetriaFacade = {

    /**
     * Devuelve la última lectura conocida de un camión.
     * Útil para el módulo de Operaciones al verificar la posición actual.
     */
    obtenerUltimaLectura: async (id_camion: string): Promise<{
        latitud: number;
        longitud: number;
        temperatura: number;
        estatus: boolean;
        fecha: Date;
    } | null> => {
        const rows: Array<{
            latitud: string;
            longitud: string;
            temperatura_caja: string;
            fecha_registro: Date;
        }> = await AppDataSource.query(
            `SELECT
                ST_Y(ubicacion_actual::geometry) AS latitud,
                ST_X(ubicacion_actual::geometry) AS longitud,
                temperatura_caja,
                fecha_registro
             FROM telemetria_camiones
             WHERE id_camion = $1
             ORDER BY fecha_registro DESC
             LIMIT 1`,
            [id_camion]
        );

        if (!rows[0]) return null;
        const row = rows[0];
        return {
            latitud:     parseFloat(row.latitud),
            longitud:    parseFloat(row.longitud),
            temperatura: parseFloat(row.temperatura_caja),
            estatus:     true, // Proyección: si hay lectura reciente, el camión estaba activo
            fecha:       row.fecha_registro,
        };
    },

    /**
     * Usa la Fachada de Flotilla para validar que el camión exista y esté activo
     * antes de procesar su telemetría (ejemplo de comunicación inter-módulos).
     */
    validarCamionActivo: async (id_camion: string): Promise<boolean> => {
        const capacidad = await FlotillaFacade.obtenerCapacidadCamion(id_camion);
        return capacidad !== null;
    },
};
