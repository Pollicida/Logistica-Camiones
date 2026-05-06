import { ValidationError } from '../../../core/errors/AppError';

export interface CrearViajeDTO {
    id_pedidos: string[];
    id_camion: string;
    id_conductor: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Tope físico por viaje (RF-04 / sec 7.2). Se reivalida en el service.
export const MAX_PEDIDOS_POR_VIAJE = 9;

export const validarCrearViajeDTO = (raw: unknown): CrearViajeDTO => {
    if (typeof raw !== 'object' || raw === null) {
        throw new ValidationError('El cuerpo de la petición debe ser un objeto');
    }
    const obj = raw as Record<string, unknown>;

    const ids = obj['id_pedidos'];
    if (!Array.isArray(ids) || ids.length === 0) {
        throw new ValidationError('id_pedidos debe ser un arreglo no vacío');
    }
    if (ids.length > MAX_PEDIDOS_POR_VIAJE) {
        throw new ValidationError(
            `id_pedidos no puede tener más de ${MAX_PEDIDOS_POR_VIAJE} elementos (límite físico por viaje)`
        );
    }

    const vistos = new Set<string>();
    ids.forEach((v, i) => {
        if (typeof v !== 'string' || !UUID_REGEX.test(v)) {
            throw new ValidationError(`id_pedidos[${i}] debe ser un UUID válido`);
        }
        if (vistos.has(v)) {
            throw new ValidationError(`id_pedidos[${i}] está duplicado`);
        }
        vistos.add(v);
    });

    const id_camion = obj['id_camion'];
    if (typeof id_camion !== 'string' || !UUID_REGEX.test(id_camion)) {
        throw new ValidationError('id_camion debe ser un UUID válido');
    }

    const id_conductor = obj['id_conductor'];
    if (typeof id_conductor !== 'string' || !UUID_REGEX.test(id_conductor)) {
        throw new ValidationError('id_conductor debe ser un UUID válido');
    }

    return {
        id_pedidos: ids as string[],
        id_camion,
        id_conductor
    };
};
