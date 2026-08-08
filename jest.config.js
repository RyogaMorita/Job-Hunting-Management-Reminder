// ロジック（lib/）だけを対象にした軽量なテスト構成。
// UIコンポーネントのレンダリングテストは含めていないので jest-expo は不要。
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['babel-jest', { presets: ['babel-preset-expo'] }],
  },
  collectCoverageFrom: ['lib/**/*.ts'],
};
