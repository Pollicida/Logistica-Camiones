import { Request, Response } from 'express';
import { spawn } from 'child_process';
import * as path from 'path';
import { ValidationError } from '../../../core/errors/AppError';
import { ViajeService, buildViajeService } from '../services/viaje.service';
import { validarCrearViajeDTO } from '../dto/crear-viaje.dto';
import { ViajeStatus } from '../models/viaje.entity';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS_VALIDOS: readonly ViajeStatus[] = [
    'CARGANDO', 'EN_CAMINO', 'EN_ENTREGA', 'COMPLETADO', 'CANCELADO'
];

/** Viajes con simulacion Python actualmente en curso (clave = id_viaje). */
const simulacionesActivas = new Set<string>();

export class ViajeController {
    private readonly service: ViajeService;

    constructor(service?: ViajeService) {
        this.service = service ?? buildViajeService();
    }

    crear = async (req: Request, res: Response): Promise<void> => {
        const dto = validarCrearViajeDTO(req.body);
        const viaje = await this.service.crear(dto);
        res.status(201).json(viaje);
    };

    listar = async (req: Request, res: Response): Promise<void> => {
        const statusRaw = req.query['status'];
        const filtros: { status?: ViajeStatus } = {};
        if (statusRaw !== undefined) {
            if (typeof statusRaw !== 'string' || !STATUS_VALIDOS.includes(statusRaw as ViajeStatus)) {
                throw new ValidationError(
                    `status debe ser uno de: ${STATUS_VALIDOS.join(', ')}`
                );
            }
            filtros.status = statusRaw as ViajeStatus;
        }
        const viajes = await this.service.listar(filtros);
        res.status(200).json({ viajes });
    };

    obtener = async (req: Request, res: Response): Promise<void> => {
        const id = this.parseId(req.params['id']);
        const viaje = await this.service.obtener(id);
        res.status(200).json(viaje);
    };

    iniciar = async (req: Request, res: Response): Promise<void> => {
        const id = this.parseId(req.params['id']);
        const viaje = await this.service.iniciar(id);
        res.status(200).json(viaje);
    };

    completar = async (req: Request, res: Response): Promise<void> => {
        const id = this.parseId(req.params['id']);
        const viaje = await this.service.completar(id);
        res.status(200).json(viaje);
    };

    listarPedidos = async (req: Request, res: Response): Promise<void> => {
        const id = this.parseId(req.params['id']);
        const pedidos = await this.service.listarPedidosViaje(id);
        res.status(200).json({ id_viaje: id, total: pedidos.length, pedidos });
    };

    simular = async (req: Request, res: Response): Promise<void> => {
        const id    = this.parseId(req.params['id']);
        const token = (req.headers['authorization'] ?? '').replace(/^Bearer\s+/i, '');

        if (!token) {
            throw new ValidationError('Se requiere token de autenticacion para iniciar la simulacion');
        }

        // Evitar simulaciones duplicadas para el mismo viaje
        if (simulacionesActivas.has(id)) {
            res.status(409).json({
                error: { message: `Ya hay una simulacion activa para el viaje ${id}` },
            });
            return;
        }

        // Ruta absoluta al script Python (funciona tanto en dev como en dist/)
        const scriptPath = path.resolve(__dirname, '../../../../simulador_viaje.py');

        const mqttUrl = process.env['MQTT_BROKER_URL'] ?? 'mqtt://localhost:1883';
        const port    = process.env['PORT'] ?? '3000';
        const apiUrl  = `http://localhost:${port}`;

        // Orden de preferencia: variable de entorno -> py (launcher Windows) -> python3 -> python
        const candidatos: string[] = process.env['PYTHON_BIN']
            ? [process.env['PYTHON_BIN'] as string]
            : ['py', 'python3', 'python'];

        const args = [
            scriptPath,
            '--viaje-id', id,
            '--api-url',  apiUrl,
            '--mqtt-url', mqttUrl,
            '--token',    token,
        ];

        // Probar cada candidato hasta que uno entregue un PID valido
        let child: ReturnType<typeof spawn> | null = null;
        let pythonBin = '';

        for (const bin of candidatos) {
            const attempt = spawn(bin, args, { detached: true, stdio: 'ignore' });
            if (attempt.pid) {
                child     = attempt;
                pythonBin = bin;
                break;
            }
            // Sin PID: ese binario no existe, continuar con el siguiente
        }

        if (!child || !child.pid) {
            res.status(500).json({
                error: {
                    message: `No se encontro Python en el sistema. Instalalo o define PYTHON_BIN en el .env (probados: ${candidatos.join(', ')}).`,
                }
            });
            return;
        }

        // Registrar simulacion activa; limpiar cuando el proceso termine
        const pid = child.pid;
        simulacionesActivas.add(id);
        child.once('exit', (code) => {
            simulacionesActivas.delete(id);
            console.log(`[Simulador] PID ${pid} viaje ${id} termino (codigo ${code})`);
        });

        child.unref();  // desacopla el proceso: el servidor puede cerrar sin matarlo

        console.log(`[Simulador] ${pythonBin} PID ${pid} viaje ${id} iniciado`);

        res.status(200).json({
            mensaje:   `Simulacion iniciada para el viaje ${id}`,
            pid:       pid,
            id_viaje:  id,
            python:    pythonBin,
        });
    };

    private parseId(raw: string | string[] | undefined): string {
        if (typeof raw !== 'string' || !UUID_REGEX.test(raw)) {
            throw new ValidationError('El parametro :id debe ser un UUID valido');
        }
        return raw;
    }
}
