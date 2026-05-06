import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

export type ViajeStatus =
    | 'CARGANDO'
    | 'EN_CAMINO'
    | 'EN_ENTREGA'
    | 'COMPLETADO'
    | 'CANCELADO';

@Entity('viajes')
export class ViajeEntity {
    @PrimaryGeneratedColumn('uuid')
    id_viaje!: string;

    @Column({ type: 'uuid', nullable: true })
    id_conductor!: string | null;

    @Column({ type: 'uuid' })
    id_camion!: string;

    @Column({ type: 'uuid', nullable: true })
    id_ruta!: string | null;

    @Column({ type: 'varchar', nullable: true })
    numero_guia!: string | null;

    @Column({ type: 'timestamp', nullable: true })
    hora_salida!: Date | null;

    @Column({ type: 'timestamp', nullable: true })
    hora_llegada!: Date | null;

    @Column({ type: 'varchar' })
    status!: ViajeStatus;

    @Column({ type: 'varchar', nullable: true })
    id_region!: string | null;

    @UpdateDateColumn({ type: 'timestamp' })
    fecha_actualizacion!: Date;
}
