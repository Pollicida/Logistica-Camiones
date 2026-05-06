import { ProcesarTelemetriaUseCase } from './ProcesarTelemetriaUseCase';
import { LecturaTelemetria, LecturaTelemetriaDTO } from '../domain/models/LecturaTelemetria';
import { ITelemetriaRepository } from '../domain/ports/ITelemetriaRepository';
import { ITelemetriaPublisher, AnomaliaPayload } from '../domain/ports/ITelemetriaPublisher';

const buildLectura = (overrides: Partial<LecturaTelemetriaDTO> = {}): LecturaTelemetria =>
    new LecturaTelemetria({
        id_camion: 'cam-001',
        latitud: 19.43,
        longitud: -99.13,
        temperatura: 20,
        estatus: true,
        anomalia: false,
        fecha: '2026-04-23T10:00:00.000Z',
        ...overrides,
    }, 'NORTE');

const buildRepo = (id_viaje: string | null = 'viaje-uuid'): jest.Mocked<ITelemetriaRepository> => ({
    buscarViajeActivoPorCamion: jest.fn().mockResolvedValue(id_viaje),
    guardarLectura: jest.fn().mockResolvedValue(undefined),
    registrarAnomalia: jest.fn().mockResolvedValue('anomalia-uuid'),
});

const buildPublisher = (): jest.Mocked<ITelemetriaPublisher> => ({
    publicar: jest.fn(),
    publicarAnomalia: jest.fn(),
});

describe('ProcesarTelemetriaUseCase', () => {
    describe('lectura normal (sin anomalía)', () => {
        it('guarda lectura y publica, no toca anomalías', async () => {
            const repo = buildRepo();
            const publisher = buildPublisher();
            const useCase = new ProcesarTelemetriaUseCase(repo, publisher);
            const lectura = buildLectura({ anomalia: false });

            await useCase.ejecutar(lectura);

            expect(repo.buscarViajeActivoPorCamion).toHaveBeenCalledWith('cam-001');
            expect(repo.guardarLectura).toHaveBeenCalledWith(lectura, 'viaje-uuid');
            expect(publisher.publicar).toHaveBeenCalledWith(lectura);
            expect(repo.registrarAnomalia).not.toHaveBeenCalled();
            expect(publisher.publicarAnomalia).not.toHaveBeenCalled();
        });

        it('funciona cuando el camión no tiene viaje activo', async () => {
            const repo = buildRepo(null);
            const publisher = buildPublisher();
            const useCase = new ProcesarTelemetriaUseCase(repo, publisher);

            await useCase.ejecutar(buildLectura());

            expect(repo.guardarLectura).toHaveBeenCalledWith(expect.anything(), null);
        });
    });

    describe('lectura con anomalía', () => {
        it('registra anomalía y notifica al administrador', async () => {
            const repo = buildRepo('viaje-uuid');
            const publisher = buildPublisher();
            const useCase = new ProcesarTelemetriaUseCase(repo, publisher);
            const lectura = buildLectura({ anomalia: true });

            await useCase.ejecutar(lectura);

            expect(repo.registrarAnomalia).toHaveBeenCalledWith(lectura, 'viaje-uuid');
            expect(publisher.publicarAnomalia).toHaveBeenCalledTimes(1);

            const payload: AnomaliaPayload = (publisher.publicarAnomalia as jest.Mock).mock.calls[0][0];
            expect(payload.id_anomalia).toBe('anomalia-uuid');
            expect(payload.id_viaje).toBe('viaje-uuid');
            expect(payload.id_camion).toBe('cam-001');
            expect(payload.latitud).toBe(19.43);
            expect(payload.longitud).toBe(-99.13);
            expect(payload.region).toBe('NORTE');
        });

        it('notifica anomalía aunque no haya viaje activo', async () => {
            const repo = buildRepo(null);
            const publisher = buildPublisher();
            const useCase = new ProcesarTelemetriaUseCase(repo, publisher);
            const lectura = buildLectura({ anomalia: true });

            await useCase.ejecutar(lectura);

            expect(repo.registrarAnomalia).toHaveBeenCalledWith(lectura, null);

            const payload: AnomaliaPayload = (publisher.publicarAnomalia as jest.Mock).mock.calls[0][0];
            expect(payload.id_viaje).toBeNull();
        });

        it('también guarda la lectura y la publica normalmente', async () => {
            const repo = buildRepo();
            const publisher = buildPublisher();
            const useCase = new ProcesarTelemetriaUseCase(repo, publisher);
            const lectura = buildLectura({ anomalia: true });

            await useCase.ejecutar(lectura);

            expect(repo.guardarLectura).toHaveBeenCalled();
            expect(publisher.publicar).toHaveBeenCalledWith(lectura);
        });
    });
});
