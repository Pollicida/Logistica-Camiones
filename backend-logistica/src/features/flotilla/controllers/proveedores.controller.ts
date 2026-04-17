import { Request, Response } from 'express';
import { AppDataSource } from '../../../core/database';
import { ProveedorEntity } from '../models/proveedor.entity';

export class ProveedoresController {

    // POST /api/flotilla/proveedores
    static async registrarProveedor(req: Request, res: Response): Promise<void> {
        try {
            const repo = AppDataSource.getRepository(ProveedorEntity);

            // Limpieza de los datos para soportar bulk insert
            const data = Array.isArray(req.body) ? req.body : [req.body];

            let nuevosProveedores = repo.create(data);

            // Asignamos la fecha de ingreso como el día de hoy si no la mandan
            for (let proveedor of nuevosProveedores) {
                if (!proveedor.fecha_ingreso) {
                    proveedor.fecha_ingreso = new Date();
                }
            }

            await repo.save(nuevosProveedores);

            res.status(201).json({
                mensaje: 'Proveedor(es) registrado(s) exitosamente',
                proveedores: nuevosProveedores
            });

        } catch (error: any) {
            console.error('Error registrando proveedor:', error);
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    }

    // GET /api/flotilla/proveedores
    static async listarProveedores(req: Request, res: Response): Promise<void> {
        try {
            const repo = AppDataSource.getRepository(ProveedorEntity);
            const proveedores = await repo.find({ where: { activo: true } });

            res.json(proveedores);
        } catch (error) {
            res.status(500).json({ error: 'Error obteniendo la lista de proveedores' });
        }
    }

    // DELETE /api/flotilla/proveedores/:id
    static async eliminarProveedor(req: Request, res: Response): Promise<void> {
        try {
            const repo = AppDataSource.getRepository(ProveedorEntity);
            const { id } = req.params;

            const proveedor = await repo.findOne({ where: { id_proveedor: id as string } });

            if (!proveedor) {
                res.status(404).json({ error: 'Proveedor no encontrado' });
                return;
            }

            await repo.remove(proveedor);
            res.json({ mensaje: 'Proveedor eliminado exitosamente' });
        } catch (error) {
            res.status(500).json({ error: 'Error eliminando el proveedor' });
        }
    }

    // UPDATE /api/flotilla/proveedores/:id
    static async actualizarProveedor(req: Request, res: Response): Promise<void> {
        try {
            const repo = AppDataSource.getRepository(ProveedorEntity);
            const { id } = req.params;

            const proveedor = await repo.findOne({ where: { id_proveedor: id as string } });

            if (!proveedor) {
                res.status(404).json({ error: 'Proveedor no encontrado' });
                return;
            }

            await repo.update(id as string, req.body);
            res.json({ mensaje: 'Proveedor actualizado exitosamente' });
        } catch (error) {
            res.status(500).json({ error: 'Error actualizando el proveedor' });
        }
    }

    // GET /api/flotilla/proveedores/:id
    static async obtenerProveedor(req: Request, res: Response): Promise<void> {
        try {
            const repo = AppDataSource.getRepository(ProveedorEntity);
            const { id } = req.params;

            const proveedor = await repo.findOne({ where: { id_proveedor: id as string } });

            if (!proveedor) {
                res.status(404).json({ error: 'Proveedor no encontrado' });
                return;
            }

            res.json(proveedor);
        } catch (error) {
            res.status(500).json({ error: 'Error obteniendo el proveedor' });
        }
    }
}