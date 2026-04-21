import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

const decimalTransformer = {
    to: (value: number | null | undefined): number | null | undefined => value,
    from: (value: string | null): number | null => (value === null ? null : Number(value))
};

@Entity('detalle_pedidos')
export class DetallePedidoEntity {
    @PrimaryGeneratedColumn('uuid')
    id_detalle!: string;

    @Column({ type: 'uuid' })
    id_pedido!: string;

    @Column({ type: 'uuid' })
    id_producto!: string;

    @Column({ type: 'int' })
    cantidad!: number;

    @Column({ type: 'decimal', precision: 10, scale: 2, transformer: decimalTransformer })
    precio_unitario!: number;
}
