/**
 * CAPA DE DOMINIO — Modelo
 * Objeto de valor que representa una lectura de telemetría validada.
 * No tiene dependencias de ningún framework.
 */

export interface LecturaTelemetriaDTO {
    latitud: number;
    longitud: number;
    temperatura: number;
    id_camion: string;
    estatus: boolean;   // true = camión operativo
    anomalia: boolean;  // true = se detectó una anomalía
    fecha: string;      // ISO 8601 timestamp
}

export class LecturaTelemetria {
    readonly id_camion: string;
    readonly latitud: number;
    readonly longitud: number;
    readonly temperatura: number;
    readonly estatus: boolean;
    readonly anomalia: boolean;
    readonly fecha: Date;
    readonly region: string;

    constructor(dto: LecturaTelemetriaDTO, region: string) {
        if (!dto.id_camion?.trim()) {
            throw new Error('id_camion es requerido');
        }
        if (dto.latitud < -90 || dto.latitud > 90) {
            throw new Error(`latitud inválida: ${dto.latitud}`);
        }
        if (dto.longitud < -180 || dto.longitud > 180) {
            throw new Error(`longitud inválida: ${dto.longitud}`);
        }

        this.id_camion = dto.id_camion;
        this.latitud = dto.latitud;
        this.longitud = dto.longitud;
        this.temperatura = dto.temperatura;
        this.estatus = dto.estatus;
        this.anomalia = dto.anomalia;
        this.fecha = new Date(dto.fecha);
        this.region = region;

        if (isNaN(this.fecha.getTime())) {
            throw new Error(`fecha inválida: ${dto.fecha}`);
        }
    }
}
