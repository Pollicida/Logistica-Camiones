/**
 * CAPA DE APLICACIÓN — Caso de uso
 * Orquesta: busca el viaje activo, persiste la lectura y la publica en tiempo real.
 * Solo depende de puertos (interfaces), nunca de implementaciones concretas.
 */
import { LecturaTelemetria } from '../domain/models/LecturaTelemetria';
import { ITelemetriaRepository } from '../domain/ports/ITelemetriaRepository';
import { ITelemetriaPublisher } from '../domain/ports/ITelemetriaPublisher';

export class ProcesarTelemetriaUseCase {
    constructor(
        private readonly repo: ITelemetriaRepository,
        private readonly publisher: ITelemetriaPublisher
    ) {}

    async ejecutar(lectura: LecturaTelemetria): Promise<void> {
        // 1. Buscar el viaje activo del camión (comunicación vía repositorio)
        const id_viaje = await this.repo.buscarViajeActivoPorCamion(lectura.id_camion);

        // 2. Persistir la lectura cruda en Telemetria_Camiones
        await this.repo.guardarLectura(lectura, id_viaje);

        // 3. Publicar la lectura procesada hacia los clientes web (WebSocket)
        this.publisher.publicar(lectura);
    }
}
