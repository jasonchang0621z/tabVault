import '@testing-library/jest-dom/vitest';
import { fakeBrowser } from 'wxt/testing';
import { beforeEach } from 'vitest';

beforeEach(() => {
  fakeBrowser.reset();
});
