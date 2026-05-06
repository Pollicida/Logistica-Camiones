import { Request, Response } from 'express';
import { ColaService, buildColaService, MAX_PEDIDOS_POR_GRUPO, RADIO_PROXIMIDAD_METROS_DEFAULT } from '../services/cola.service';
import { ValidationError } from '../../../core/errors/AppError';

export class ColaController {
    private readonly service: ColaService;

    constructor(service?: ColaService) {
        this.service = service ?? buildColaService();
    }

    listar = async (_req: Request, res: Response): Promise<void> => {
        const cola = await this.service.listarCola();
        res.status(200).json({ total: cola.length, pedidos: cola });
    };

    listarGrupos = async (req: Request, res: Response): Promise<void> => {
        const radioMetros = parsearEnteroPositivo(req.query['radio_metros'], 'radio_metros');
        const maxPorGrupo = parsearEnteroPositivo(req.query['max_por_grupo'], 'max_por_grupo');

        if (maxPorGrupo !== undefined && maxPorGrupo > MAX_PEDIDOS_POR_GRUPO) {
            throw new ValidationError(`max_por_grupo no puede ser mayor a ${MAX_PEDIDOS_POR_GRUPO}`);
        }

        const grupos = await this.service.listarGruposSugeridos({
            ...(radioMetros !== undefined ? { radioMetros } : {}),
            ...(maxPorGrupo !== undefined ? { maxPedidosPorGrupo: maxPorGrupo } : {})
        });
        res.status(200).json({
            total_grupos: grupos.length,
            radio_metros: radioMetros ?? RADIO_PROXIMIDAD_METROS_DEFAULT,
            max_por_grupo: maxPorGrupo ?? MAX_PEDIDOS_POR_GRUPO,
            grupos
        });
    };
}

const parsearEnteroPositivo = (raw: unknown, nombre: string): number | undefined => {
    if (raw === undefined) return undefined;
    if (typeof raw !== 'string') {
        throw new ValidationError(`${nombre} debe ser un entero positivo`);
    }
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0) {
        throw new ValidationError(`${nombre} debe ser un entero positivo`);
    }
    return n;
};
