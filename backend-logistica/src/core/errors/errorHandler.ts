import { Request, Response, NextFunction } from 'express';
import { AppError, InternalError, NotFoundError } from './AppError';

interface ErrorResponseBody {
    error: {
        code: string;
        message: string;
        details?: unknown;
    };
}

export const errorHandler = (
    err: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction
): void => {
    const appError: AppError = err instanceof AppError
        ? err
        : new InternalError(
            err instanceof Error ? err.message : 'Error desconocido',
            err instanceof Error && process.env.NODE_ENV !== 'production' ? { stack: err.stack } : undefined
        );

    if (!appError.isOperational || appError.statusCode >= 500) {
        console.error('[ErrorHandler]', err);
    }

    const body: ErrorResponseBody = {
        error: {
            code: appError.code,
            message: appError.message,
            ...(appError.details !== undefined ? { details: appError.details } : {})
        }
    };

    res.status(appError.statusCode).json(body);
};

export const notFoundHandler = (req: Request, _res: Response, next: NextFunction): void => {
    next(new NotFoundError(`Ruta no encontrada: ${req.method} ${req.originalUrl}`));
};

/**
 * Envuelve handlers async para que los errores lleguen al errorHandler
 * sin necesidad de try/catch en cada controlador.
 */
export const asyncHandler = <T>(
    fn: (req: Request, res: Response, next: NextFunction) => Promise<T>
) => {
    return (req: Request, res: Response, next: NextFunction): void => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};
