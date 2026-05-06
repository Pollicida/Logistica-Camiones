import { Request, Response } from 'express';
import { AsignacionService, buildAsignacionService } from '../services/asignacion.service';
import { validarSugerirAsignacionDTO } from '../dto/sugerir-asignacion.dto';

export class AsignacionController {
    private readonly service: AsignacionService;

    constructor(service?: AsignacionService) {
        this.service = service ?? buildAsignacionService();
    }

    sugerir = async (req: Request, res: Response): Promise<void> => {
        const dto = validarSugerirAsignacionDTO(req.body);
        const sugerencia = await this.service.sugerir(dto);
        res.status(200).json(sugerencia);
    };
}
