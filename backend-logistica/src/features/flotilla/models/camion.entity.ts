import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('camiones')
export class CamionEntity {
    @PrimaryGeneratedColumn('uuid')
    id_camion!: string;

    @Column({ type: 'varchar' })
    marca!: string;

    @Column({ type: 'varchar' })
    modelo!: string;

    @Column({ type: 'varchar', unique: true })
    numero_de_serie!: string;

    @Column({ type: 'varchar', unique: true })
    placas!: string;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    capacidad_carga!: number;

    @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
    capacidad_volumen!: number | null;

    @Column({ type: 'decimal', precision: 5, scale: 2 })
    temperatura_minima_soportada!: number;

    @Column({ type: 'decimal', precision: 5, scale: 2 })
    temperatura_maxima_soportada!: number;

    @Column({ type: 'date' })
    fecha_ingreso!: Date;

    @Column({ type: 'boolean', default: true })
    activo!: boolean;

    // Relación "Suave" hacia la tabla de Regiones
    @Column({ type: 'varchar', nullable: true })
    id_region!: string | null;

    @UpdateDateColumn({ type: 'timestamp' })
    fecha_actualizacion!: Date;
}