import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

const decimalTransformer = {
    to: (value: number | null | undefined): number | null | undefined => value,
    from: (value: string | null): number | null => (value === null ? null : Number(value))
};

@Entity('productos')
export class ProductoEntity {
    @PrimaryGeneratedColumn('uuid')
    id_producto!: string;

    @Column({ type: 'varchar' })
    nombre_producto!: string;

    @Column({ type: 'int', default: 0 })
    stock!: number;

    @Column({ type: 'decimal', precision: 10, scale: 2, transformer: decimalTransformer })
    precio_unitario!: number;

    @Column({ type: 'decimal', precision: 8, scale: 3, default: 0, transformer: decimalTransformer })
    peso_kg!: number;

    @Column({ type: 'decimal', precision: 8, scale: 4, default: 0, transformer: decimalTransformer })
    volumen_m3!: number;

    @Column({ type: 'decimal', precision: 5, scale: 2, transformer: decimalTransformer })
    temperatura_minima!: number;

    @Column({ type: 'decimal', precision: 5, scale: 2, transformer: decimalTransformer })
    temperatura_maxima!: number;

    @Column({ type: 'uuid', nullable: true })
    id_proveedor!: string | null;

    @Column({ type: 'boolean', default: true })
    activo!: boolean;

    @Column({ type: 'varchar', nullable: true })
    id_region!: string | null;

    @UpdateDateColumn({ type: 'timestamp' })
    fecha_actualizacion!: Date;
}
