import { ValidationError } from '../../../core/errors/AppError';
import { ItemPedidoDTO, validarItemPedidoDTO } from './item-pedido.dto';

export interface CrearPedidoDTO {
    id_cliente: string;
    items: ItemPedidoDTO[];
    descripcion?: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const validarCrearPedidoDTO = (raw: unknown): CrearPedidoDTO => {
    if (typeof raw !== 'object' || raw === null) {
        throw new ValidationError('El cuerpo de la petición debe ser un objeto');
    }
    const obj = raw as Record<string, unknown>;

    const id_cliente = obj['id_cliente'];
    if (typeof id_cliente !== 'string' || !UUID_REGEX.test(id_cliente)) {
        throw new ValidationError('id_cliente debe ser un UUID válido');
    }

    const items = obj['items'];
    if (!Array.isArray(items) || items.length === 0) {
        throw new ValidationError('items debe ser un arreglo no vacío');
    }
    const parsedItems: ItemPedidoDTO[] = items.map((raw, i) => validarItemPedidoDTO(raw, i));

    const descripcionRaw = obj['descripcion'];
    if (descripcionRaw !== undefined && typeof descripcionRaw !== 'string') {
        throw new ValidationError('descripcion debe ser string');
    }

    const dto: CrearPedidoDTO = { id_cliente, items: parsedItems };
    if (typeof descripcionRaw === 'string') {
        dto.descripcion = descripcionRaw;
    }
    return dto;
};
