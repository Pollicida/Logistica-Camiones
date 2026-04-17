import { Request, Response } from 'express';
import { AppDataSource } from '../../../core/database';
import { ClienteEntity } from '../models/cliente.entity';

export class ClientesController {

    // POST /api/flotilla/clientes
    static async registrarCliente(req: Request, res: Response): Promise<void> {
        try {
            const repo = AppDataSource.getRepository(ClienteEntity);

            const data = Array.isArray(req.body) ? req.body : [req.body];
            let nuevosClientes = repo.create(data);

            for (let cliente of nuevosClientes) {
                if (!cliente.fecha_ingreso) {
                    cliente.fecha_ingreso = new Date();
                }
            }

            await repo.save(nuevosClientes);

            res.status(201).json({
                mensaje: 'Cliente(s) registrado(s) exitosamente',
                clientes: nuevosClientes
            });

        } catch (error: any) {
            console.error('Error registrando cliente:', error);
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    }

    // GET /api/flotilla/clientes
    static async listarClientes(req: Request, res: Response): Promise<void> {
        try {
            const repo = AppDataSource.getRepository(ClienteEntity);
            const clientes = await repo.find({ where: { activo: true } });

            res.json(clientes);
        } catch (error) {
            res.status(500).json({ error: 'Error obteniendo la lista de clientes' });
        }
    }

    // DELETE /api/flotilla/clientes/:id
    static async eliminarCliente(req: Request, res: Response): Promise<void> {
        try {
            const repo = AppDataSource.getRepository(ClienteEntity);
            const { id } = req.params;

            const cliente = await repo.findOne({ where: { id_cliente: id as string } });

            if (!cliente) {
                res.status(404).json({ error: 'Cliente no encontrado' });
                return;
            }

            await repo.remove(cliente);
            res.json({ mensaje: 'Cliente eliminado exitosamente' });
        } catch (error) {
            res.status(500).json({ error: 'Error eliminando el cliente' });
        }
    }

    // UPDATE /api/flotilla/clientes/:id
    static async actualizarCliente(req: Request, res: Response): Promise<void> {
        try {
            const repo = AppDataSource.getRepository(ClienteEntity);
            const { id } = req.params;

            const cliente = await repo.findOne({ where: { id_cliente: id as string } });

            if (!cliente) {
                res.status(404).json({ error: 'Cliente no encontrado' });
                return;
            }

            await repo.update(id as string, req.body);
            res.json({ mensaje: 'Cliente actualizado exitosamente' });
        } catch (error) {
            res.status(500).json({ error: 'Error actualizando el cliente' });
        }
    }

    // GET /api/flotilla/clientes/:id
    static async obtenerCliente(req: Request, res: Response): Promise<void> {
        try {
            const repo = AppDataSource.getRepository(ClienteEntity);
            const { id } = req.params;

            const cliente = await repo.findOne({ where: { id_cliente: id as string } });

            if (!cliente) {
                res.status(404).json({ error: 'Cliente no encontrado' });
                return;
            }

            res.json(cliente);
        } catch (error) {
            res.status(500).json({ error: 'Error obteniendo el cliente' });
        }
    }
}