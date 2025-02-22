const fs = require('fs');

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  promises: {
    access: jest.fn(),
    appendFile: jest.fn(),
    writeFile: jest.fn(),
  },
  readFileSync: jest.fn(),
}));

process.env.GITHUB_WORKSPACE = '/github/workspace';
process.env.GITHUB_EVENT_PATH = '/github/workflow/event.json';
