/**
 * CAPA DE APLICACIÓN — Caso de uso
 * Orquesta: busca el viaje activo, persiste la lectura y la publica en tiempo real.
 * Si hay anomalía, la registra en BD y notifica al administrador.
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
        const id_viaje = await this.repo.buscarViajeActivoPorCamion(lectura.id_camion);
        await this.repo.guardarLectura(lectura, id_viaje);
        this.publisher.publicar(lectura);

        if (lectura.anomalia) {
            const id_anomalia = await this.repo.registrarAnomalia(lectura, id_viaje);
            this.publisher.publicarAnomalia({
                id_anomalia,
                id_viaje,
                id_camion: lectura.id_camion,
                latitud: lectura.latitud,
                longitud: lectura.longitud,
                temperatura: lectura.temperatura,
                fecha: lectura.fecha.toISOString(),
                region: lectura.region,
            });
        }
    }
}
