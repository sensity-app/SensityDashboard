module.exports = {
    testEnvironment: 'node',
    coverageDirectory: 'coverage',
    collectCoverageFrom: [
        'src/**/*.js',
        '!src/**/*.test.js',
        '!src/**/__tests__/**'
    ],
    testMatch: [
        '**/__tests__/**/*.js',
        '**/*.test.js'
    ],
    coverageThreshold: {
        global: {
            branches: 70,
            functions: 70,
            lines: 70,
            statements: 70
        }
    },
    setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.js'],
    testTimeout: 10000,
    verbose: true
};
