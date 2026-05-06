import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

const decimalTransformer = {
    to: (value: number | null | undefined): number | null | undefined => value,
    from: (value: string | null): number | null => (value === null ? null : Number(value))
};

export type PedidoStatus = 'CREADO' | 'EN_COLA' | 'ASIGNADO' | 'EN_RUTA' | 'ENTREGADO';
export type PedidoPrioridad = 'NORMAL' | 'ALTA';

@Entity('pedidos')
export class PedidoEntity {
    @PrimaryGeneratedColumn('uuid')
    id_pedido!: string;

    @Column({ type: 'uuid', nullable: true })
    id_cliente!: string | null;

    @Column({ type: 'decimal', precision: 12, scale: 2, transformer: decimalTransformer })
    total!: number;

    @Column({ type: 'timestamp' })
    hora_pedido!: Date;

    @Column({ type: 'varchar' })
    descripcion_status!: PedidoStatus;

    @Column({ type: 'timestamp', nullable: true })
    hora_entrega!: Date | null;

    @Column({ type: 'text', nullable: true })
    descripcion!: string | null;

    @Column({ type: 'uuid', nullable: true })
    id_viaje!: string | null;

    @Column({ type: 'varchar', nullable: true })
    id_region!: string | null;

    @Column({ type: 'varchar', default: 'NORMAL' })
    prioridad!: PedidoPrioridad;

    @Column({ type: 'decimal', precision: 10, scale: 3, default: 0, transformer: decimalTransformer })
    peso_total!: number;

    @Column({ type: 'decimal', precision: 10, scale: 4, default: 0, transformer: decimalTransformer })
    volumen_total!: number;

    @UpdateDateColumn({ type: 'timestamp' })
    fecha_actualizacion!: Date;
}
