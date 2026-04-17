/**
 * CAPA DE INFRAESTRUCTURA — Adaptador MQTT (driving adapter)
 * Escucha mensajes del broker MQTT y los traduce al dominio para que
 * el caso de uso los procese.
 *
 * Tópico de suscripción: telemetria/camiones/#
 *
 * Formato esperado del payload JSON:
 * {
 *   "latitud": float,
 *   "longitud": float,
 *   "temperatura": float,
 *   "id_camion": string,
 *   "estatus": boolean,
 *   "anomalia": boolean,
 *   "fecha": string (ISO 8601)
 * }
 */
import { mqttClient } from '../../../../core/mqtt';
import { LecturaTelemetria, LecturaTelemetriaDTO } from '../../domain/models/LecturaTelemetria';
import { ProcesarTelemetriaUseCase } from '../../application/ProcesarTelemetriaUseCase';

const TOPICO_BASE = 'telemetria/camiones';
const TOPICO_SUSCRIPCION = `${TOPICO_BASE}/#`;

export class TelemetriaMQTTAdapter {
    private readonly region: string;

    constructor(private readonly useCase: ProcesarTelemetriaUseCase) {
        this.region = process.env.REGION_ID ?? 'LOCAL';
    }

    iniciar(): void {
        mqttClient.subscribe(TOPICO_SUSCRIPCION, (err) => {
            if (err) {
                console.error(`❌ [Telemetría] Error al suscribirse a '${TOPICO_SUSCRIPCION}':`, err.message);
                return;
            }
            console.log(`✅ [Telemetría] Suscrito a tópico: '${TOPICO_SUSCRIPCION}'`);
        });

        // Un solo listener global al mqttClient; filtramos por tópico dentro del handler.
        // Esto es correcto porque mqttClient es compartido con otros módulos que también
        // pueden tener sus propias suscripciones en el futuro.
        mqttClient.on('message', (topic: string, payload: Buffer) => {
            if (!topic.startsWith(TOPICO_BASE)) return;
            this.procesarMensaje(topic, payload);
        });
    }

    private procesarMensaje(topic: string, payload: Buffer): void {
        let dto: LecturaTelemetriaDTO;

        try {
            dto = JSON.parse(payload.toString()) as LecturaTelemetriaDTO;
        } catch {
            console.warn(`⚠️ [Telemetría] Payload no es JSON válido en tópico '${topic}'`);
            return;
        }

        let lectura: LecturaTelemetria;
        try {
            lectura = new LecturaTelemetria(dto, this.region);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`⚠️ [Telemetría] Dato inválido descartado (${topic}): ${msg}`);
            return;
        }

        this.useCase.ejecutar(lectura).catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`❌ [Telemetría] Error procesando lectura del camión '${lectura.id_camion}': ${msg}`);
        });
    }
}
