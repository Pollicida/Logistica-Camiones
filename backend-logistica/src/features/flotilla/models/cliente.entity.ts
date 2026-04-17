import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('clientes')
export class ClienteEntity {
    @PrimaryGeneratedColumn('uuid')
    id_cliente!: string;

    @Column({ type: 'varchar' })
    nombre_cliente!: string;

    @Column({ type: 'varchar' })
    direccion!: string;

    // Columna espacial para PostGIS
    @Column({
        type: 'geometry',
        spatialFeatureType: 'Point',
        srid: 4326,
        nullable: true
    })
    ubicacion!: string | null; // TypeORM lo maneja como string WKT o GeoJSON en la entrada/salida

    @Column({ type: 'varchar', nullable: true })
    telefono!: string | null;

    @Column({ type: 'varchar', nullable: true })
    correo!: string | null;

    @Column({ type: 'varchar', nullable: true })
    encargado!: string | null;

    @Column({ type: 'date' })
    fecha_ingreso!: Date;

    @Column({ type: 'boolean', default: true })
    activo!: boolean;

    @Column({ type: 'varchar', nullable: true })
    id_region!: string | null;

    @UpdateDateColumn({ type: 'timestamp' })
    fecha_actualizacion!: Date;
}