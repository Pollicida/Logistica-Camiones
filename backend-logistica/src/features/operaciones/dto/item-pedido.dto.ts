import { ValidationError } from '../../../core/errors/AppError';

export interface ItemPedidoDTO {
    id_producto: string;
    cantidad: number;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const validarItemPedidoDTO = (raw: unknown, index: number): ItemPedidoDTO => {
    if (typeof raw !== 'object' || raw === null) {
        throw new ValidationError(`items[${index}] debe ser un objeto`);
    }
    const obj = raw as Record<string, unknown>;

    const id_producto = obj['id_producto'];
    if (typeof id_producto !== 'string' || !UUID_REGEX.test(id_producto)) {
        throw new ValidationError(`items[${index}].id_producto debe ser un UUID válido`);
    }

    const cantidad = obj['cantidad'];
    if (typeof cantidad !== 'number' || !Number.isInteger(cantidad) || cantidad <= 0) {
        throw new ValidationError(`items[${index}].cantidad debe ser un entero > 0`);
    }

    return { id_producto, cantidad };
};
