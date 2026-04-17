import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('conductores')
export class ConductorEntity {
    @PrimaryGeneratedColumn('uuid')
    id_conductor!: string;

    @Column({ type: 'varchar' })
    nombres!: string;

    @Column({ type: 'varchar' })
    apellido_paterno!: string;

    @Column({ type: 'varchar', nullable: true })
    apellido_materno!: string | null;

    @Column({ type: 'varchar', nullable: true })
    telefono!: string | null;

    @Column({ type: 'varchar', unique: true })
    numero_licencia!: string;

    @Column({ type: 'boolean', default: true })
    activo!: boolean;

    @Column({ type: 'date' })
    fecha_ingreso!: Date;

    // Relación suave con la región
    @Column({ type: 'varchar', nullable: true })
    id_region!: string | null;

    @UpdateDateColumn({ type: 'timestamp' })
    fecha_actualizacion!: Date;
}