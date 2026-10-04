import { Request, Response, NextFunction } from 'express';
import { sanitizeInputs } from './sanitize';

function makeReq(body: unknown): Request {
  return { body } as unknown as Request;
}

const res = {} as Response;

describe('sanitizeInputs middleware', () => {
  it('escapes < and > in a simple string field', () => {
    const req = makeReq({ title: '<script>alert(1)</script>' });
    sanitizeInputs(req, res, (() => {}) as NextFunction);
    expect(req.body.title).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('escapes & in strings', () => {
    const req = makeReq({ name: 'A & B' });
    sanitizeInputs(req, res, (() => {}) as NextFunction);
    expect(req.body.name).toBe('A &amp; B');
  });

  it('escapes double-quotes', () => {
    const req = makeReq({ value: '"quoted"' });
    sanitizeInputs(req, res, (() => {}) as NextFunction);
    expect(req.body.value).toBe('&quot;quoted&quot;');
  });

  it("escapes single-quotes", () => {
    const req = makeReq({ value: "it's here" });
    sanitizeInputs(req, res, (() => {}) as NextFunction);
    expect(req.body.value).toBe('it&#x27;s here');
  });

  it('recursively sanitizes nested objects', () => {
    const req = makeReq({ outer: { inner: '<b>bold</b>' } });
    sanitizeInputs(req, res, (() => {}) as NextFunction);
    expect(req.body.outer.inner).toBe('&lt;b&gt;bold&lt;/b&gt;');
  });

  it('recursively sanitizes arrays of strings', () => {
    const req = makeReq({ tags: ['<one>', '<two>'] });
    sanitizeInputs(req, res, (() => {}) as NextFunction);
    expect(req.body.tags).toEqual(['&lt;one&gt;', '&lt;two&gt;']);
  });

  it('leaves numbers and booleans untouched', () => {
    const req = makeReq({ count: 42, active: true });
    sanitizeInputs(req, res, (() => {}) as NextFunction);
    expect(req.body.count).toBe(42);
    expect(req.body.active).toBe(true);
  });

  it('leaves null values untouched', () => {
    const req = makeReq({ field: null });
    sanitizeInputs(req, res, (() => {}) as NextFunction);
    expect(req.body.field).toBeNull();
  });

  it('calls next()', () => {
    const req = makeReq({});
    const next = jest.fn();
    sanitizeInputs(req, res, next as NextFunction);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('handles undefined body gracefully', () => {
    const req = makeReq(undefined);
    const next = jest.fn();
    sanitizeInputs(req, res, next as NextFunction);
    expect(next).toHaveBeenCalled();
    expect(req.body).toBeUndefined();
  });

  it('handles null body gracefully', () => {
    const req = makeReq(null);
    const next = jest.fn();
    sanitizeInputs(req, res, next as NextFunction);
    expect(next).toHaveBeenCalled();
    expect(req.body).toBeNull();
  });
});
