/** @type {import('jest').Config} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    rootDir: './src',
    testMatch: ['**/*.spec.ts'],
    moduleFileExtensions: ['ts', 'js', 'json'],
    clearMocks: true,
    collectCoverageFrom: [
        '**/*.ts',
        '!**/*.spec.ts',
        '!**/models/*.entity.ts',
        '!main.ts'
    ],
    coverageDirectory: '../coverage',
    transform: {
        '^.+\\.ts$': ['ts-jest', {
            tsconfig: {
                module: 'commonjs',
                moduleResolution: 'node',
                esModuleInterop: true,
                experimentalDecorators: true,
                emitDecoratorMetadata: true,
                strict: true,
                skipLibCheck: true,
                target: 'es2020',
                isolatedModules: true,
                ignoreDeprecations: '6.0'
            }
        }]
    }
};
