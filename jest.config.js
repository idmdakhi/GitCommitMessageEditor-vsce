/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  moduleNameMapper: {
    "^vscode$": "<rootDir>/__mocks__/vscode.ts",
  },
  clearMocks: true,
};
