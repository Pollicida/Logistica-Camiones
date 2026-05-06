import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('puntos_ruta')
export class PuntoRutaEntity {
    @PrimaryGeneratedColumn('uuid')
    id_punto!: string;

    @Column({ type: 'uuid' })
    id_ruta!: string;

    @Column({ type: 'decimal', precision: 10, scale: 6 })
    latitud!: number;

    @Column({ type: 'decimal', precision: 10, scale: 6 })
    longitud!: number;

    // ubicacion_punto es GEOMETRY — se gestiona con SQL raw.

    @Column({ type: 'int' })
    orden_parada!: number;
}
