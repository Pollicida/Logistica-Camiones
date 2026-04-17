import { Request, Response } from 'express';
import { AppDataSource } from '../../../core/database';
import { ConductorEntity } from '../models/conductor.entity';

export class ConductoresController {

    // POST /api/flotilla/conductores
    static async registrarConductor(req: Request, res: Response): Promise<void> {
        try {
            const repo = AppDataSource.getRepository(ConductorEntity);

            // Limpieza de los datos
            const data: any[] = Array.isArray(req.body) ? req.body : [req.body];

            // FIX: Usamos .map()
            let nuevosConductores = data.map(item => repo.create(item)) as unknown as ConductorEntity[];

            // Asignamos la fecha de ingreso
            for (let conductor of nuevosConductores) {
                if (!conductor.fecha_ingreso) {
                    conductor.fecha_ingreso = new Date();
                }
            }

            await repo.save(nuevosConductores);

            res.status(201).json({
                mensaje: 'Conductor(es) registrado(s) exitosamente',
                conductores: nuevosConductores
            });

        } catch (error: any) {
            console.error('Error registrando conductor:', error);
            if (error.code === '23505') {
                res.status(409).json({ error: 'El número de licencia ya está registrado en el sistema' });
                return;
            }
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    }

    // GET /api/flotilla/conductores
    static async listarConductores(req: Request, res: Response): Promise<void> {
        try {
            const repo = AppDataSource.getRepository(ConductorEntity);
            const conductores = await repo.find({ where: { activo: true } });
            res.json(conductores);
        } catch (error) {
            res.status(500).json({ error: 'Error obteniendo la lista de conductores' });
        }
    }

    // DELETE /api/flotilla/conductores/:id
    static async eliminarConductor(req: Request, res: Response): Promise<void> {
        try {
            const repo = AppDataSource.getRepository(ConductorEntity);
            const { id } = req.params;
            const conductor = await repo.findOne({ where: { id_conductor: id as string } });

            if (!conductor) {
                res.status(404).json({ error: 'Conductor no encontrado' });
                return;
            }
            await repo.remove(conductor);
            res.json({ mensaje: 'Conductor eliminado exitosamente' });
        } catch (error) {
            res.status(500).json({ error: 'Error eliminando el conductor' });
        }
    }

    // UPDATE /api/flotilla/conductores/:id
    static async actualizarConductor(req: Request, res: Response): Promise<void> {
        try {
            const repo = AppDataSource.getRepository(ConductorEntity);
            const { id } = req.params;
            const conductor = await repo.findOne({ where: { id_conductor: id as string } });

            if (!conductor) {
                res.status(404).json({ error: 'Conductor no encontrado' });
                return;
            }
            await repo.update(id as string, req.body);
            res.json({ mensaje: 'Conductor actualizado exitosamente' });
        } catch (error) {
            res.status(500).json({ error: 'Error actualizando el conductor' });
        }
    }

    // GET /api/flotilla/conductores/:id
    static async obtenerConductor(req: Request, res: Response): Promise<void> {
        try {
            const repo = AppDataSource.getRepository(ConductorEntity);
            const { id } = req.params;
            const conductor = await repo.findOne({ where: { id_conductor: id as string } });

            if (!conductor) {
                res.status(404).json({ error: 'Conductor no encontrado' });
                return;
            }
            res.json(conductor);
        } catch (error) {
            res.status(500).json({ error: 'Error obteniendo el conductor' });
        }
    }
}