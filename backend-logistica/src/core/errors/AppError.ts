/**
 * Patrón estandarizado de errores del dominio.
 * Cualquier error de negocio/aplicación extiende AppError y define su código HTTP.
 * El errorHandler middleware los traduce a respuestas consistentes.
 */
export class AppError extends Error {
    public readonly statusCode: number;
    public readonly code: string;
    public readonly details: unknown;
    public readonly isOperational: boolean;

    constructor(message: string, statusCode: number, code: string, details?: unknown) {
        super(message);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        this.isOperational = true;
        Error.captureStackTrace?.(this, this.constructor);
    }
}

export class ValidationError extends AppError {
    constructor(message: string, details?: unknown) {
        super(message, 400, 'VALIDATION_ERROR', details);
    }
}

export class StockInsuficienteError extends AppError {
    constructor(message: string, details?: unknown) {
        super(message, 400, 'STOCK_INSUFICIENTE', details);
    }
}

export class CapacidadExcedidaError extends AppError {
    constructor(message: string, details?: unknown) {
        super(message, 422, 'CAPACIDAD_EXCEDIDA', details);
    }
}

export class NotFoundError extends AppError {
    constructor(message: string, details?: unknown) {
        super(message, 404, 'NOT_FOUND', details);
    }
}

export class UnauthorizedError extends AppError {
    constructor(message = 'No autorizado') {
        super(message, 401, 'UNAUTHORIZED');
    }
}

export class ForbiddenError extends AppError {
    constructor(message = 'Privilegios insuficientes') {
        super(message, 403, 'FORBIDDEN');
    }
}

export class ConflictError extends AppError {
    constructor(message: string, details?: unknown) {
        super(message, 409, 'CONFLICT', details);
    }
}

export class InternalError extends AppError {
    constructor(message = 'Error interno del servidor', details?: unknown) {
        super(message, 500, 'INTERNAL_ERROR', details);
    }
}
