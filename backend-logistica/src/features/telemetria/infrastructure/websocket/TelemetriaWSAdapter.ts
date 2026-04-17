/**
 * CAPA DE INFRAESTRUCTURA — Adaptador de publicación en tiempo real (WebSocket)
 * Implementa ITelemetriaPublisher usando Socket.io.
 *
 * Canales disponibles para los clientes:
 *  - 'telemetria'          → recibe actualizaciones de TODOS los camiones
 *  - 'camion:{id_camion}'  → recibe solo las de ese camión específico
 *
 * Eventos que el cliente debe escuchar:
 *  - 'telemetria:update'   → payload con la lectura procesada
 *
 * Eventos que el cliente emite para suscribirse:
 *  - 'suscribir:telemetria'           → se une al canal general
 *  - 'suscribir:camion', id_camion    → se une al canal de un camión
 *  - 'desuscribir:camion', id_camion  → sale del canal de un camión
 */
import { Server } from 'socket.io';
import { ITelemetriaPublisher } from '../../domain/ports/ITelemetriaPublisher';
import { LecturaTelemetria } from '../../domain/models/LecturaTelemetria';

export interface TelemetriaPayload {
    id_camion: string;
    latitud: number;
    longitud: number;
    temperatura: number;
    estatus: boolean;
    anomalia: boolean;
    fecha: string;
    region: string;
}

export class TelemetriaWSAdapter implements ITelemetriaPublisher {
    constructor(private readonly io: Server) {}

    publicar(lectura: LecturaTelemetria): void {
        const payload: TelemetriaPayload = {
            id_camion:   lectura.id_camion,
            latitud:     lectura.latitud,
            longitud:    lectura.longitud,
            temperatura: lectura.temperatura,
            estatus:     lectura.estatus,
            anomalia:    lectura.anomalia,
            fecha:       lectura.fecha.toISOString(),
            region:      lectura.region,
        };

        // Canal general: clientes de dashboard que ven todos los camiones
        this.io.to('telemetria').emit('telemetria:update', payload);

        // Canal específico: clientes que siguen un camión puntual
        this.io.to(`camion:${lectura.id_camion}`).emit('telemetria:update', payload);
    }
}
