import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('rutas')
export class RutaEntity {
    @PrimaryGeneratedColumn('uuid')
    id_ruta!: string;

    @Column({ type: 'varchar' })
    nombre_ruta!: string;

    @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
    distancia_km!: number | null;

    @Column({ type: 'int', nullable: true })
    tiempo_estimado_minutos!: number | null;

    // ruta_espacial es GEOMETRY — se gestiona con SQL raw, no con TypeORM column.

    @Column({ type: 'varchar', nullable: true })
    id_region!: string | null;

    @UpdateDateColumn({ type: 'timestamp' })
    fecha_actualizacion!: Date;
}
