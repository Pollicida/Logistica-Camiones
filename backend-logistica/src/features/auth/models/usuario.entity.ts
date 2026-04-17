import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('usuarios') // Minúsculas: CockroachDB/PG almacena los nombres sin comillas en lowercase
export class UsuarioEntity {
    @PrimaryGeneratedColumn('uuid')
    id_usuario!: string;

    @Column({ type: 'varchar', unique: true })
    correo!: string;

    // Aquí guardaremos la contraseña encriptada, NUNCA en texto plano
    @Column({ type: 'varchar' })
    password_hash!: string;

    @Column({ type: 'varchar' })
    rol!: string; 

    // MAGIA DE MICROSERVICIOS/MONOLITO MODULAR:
    // Solo guardamos el string del ID. No hacemos un @ManyToOne hacia ConductorEntity 
    // para mantener este módulo 100% independiente del módulo de Flotilla.
    @Column({ type: 'uuid', nullable: true })
    id_conductor!: string | null;

    @Column({ type: 'boolean', default: true })
    activo!: boolean;

    @CreateDateColumn({ type: 'timestamp' })
    fecha_creacion!: Date;
}