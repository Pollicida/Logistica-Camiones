import { ValidationError } from '../../../core/errors/AppError';

export interface SugerirAsignacionDTO {
    id_pedidos: string[];
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Tope físico por viaje (RF-04). Se valida también en el service, pero rechazar
// temprano aquí ahorra una round-trip a BD cuando el body es claramente inválido.
export const MAX_PEDIDOS_POR_ASIGNACION = 9;

export const validarSugerirAsignacionDTO = (raw: unknown): SugerirAsignacionDTO => {
    if (typeof raw !== 'object' || raw === null) {
        throw new ValidationError('El cuerpo de la petición debe ser un objeto');
    }
    const obj = raw as Record<string, unknown>;
    const ids = obj['id_pedidos'];

    if (!Array.isArray(ids) || ids.length === 0) {
        throw new ValidationError('id_pedidos debe ser un arreglo no vacío');
    }
    if (ids.length > MAX_PEDIDOS_POR_ASIGNACION) {
        throw new ValidationError(
            `id_pedidos no puede tener más de ${MAX_PEDIDOS_POR_ASIGNACION} elementos (límite físico por viaje)`
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

    return { id_pedidos: ids as string[] };
};
