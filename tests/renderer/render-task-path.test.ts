import { expect, it } from 'vitest';
import { RenderTaskSchema } from '../../src/contracts/render-task';
import { assertDocumentScope } from '../../src/worker/network/url-scope';

it('keeps top-level navigation below the path prefix', () => {
  const base = { scope: ['github.com'], pathPrefix: '/wunderay' };
  expect(RenderTaskSchema.safeParse({ ...base, url: 'https://github.com/wunderay/repo' }).success).toBe(true);
  expect(RenderTaskSchema.safeParse({ ...base, url: 'https://github.com/other' }).success).toBe(false);
  expect(() => assertDocumentScope('https://github.com/wunderay-other', base.scope, base.pathPrefix)).toThrow();
  expect(assertDocumentScope('https://github.com/anything', base.scope)).toBe('https://github.com/anything');
});
