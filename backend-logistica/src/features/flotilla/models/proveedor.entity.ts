import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('proveedores')
export class ProveedorEntity {
    @PrimaryGeneratedColumn('uuid')
    id_proveedor!: string;

    @Column({ type: 'varchar' })
    nombre_proveedor!: string;

    @Column({ type: 'varchar', nullable: true })
    telefono!: string | null;

    @Column({ type: 'varchar', nullable: true })
    correo!: string | null;

    @Column({ type: 'boolean', default: true })
    activo!: boolean;

    @Column({ type: 'date' })
    fecha_ingreso!: Date;

    @Column({ type: 'varchar', nullable: true })
    id_region!: string | null;

    @UpdateDateColumn({ type: 'timestamp' })
    fecha_actualizacion!: Date;
}