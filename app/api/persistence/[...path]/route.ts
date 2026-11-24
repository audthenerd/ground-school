/**
 * Embedded persistence HTTP surface. Implementation lives in `./handler` so
 * tests can call `handlePersistenceRequest` without exporting helpers from
 * this Next.js route module (typed routes forbid non-handler exports).
 */
import { handlePersistenceRequest } from './handler';

export const runtime = 'nodejs';

export const GET = (request: Request) => handlePersistenceRequest(request);
export const POST = (request: Request) => handlePersistenceRequest(request);
export const PUT = (request: Request) => handlePersistenceRequest(request);
export const PATCH = (request: Request) => handlePersistenceRequest(request);
export const DELETE = (request: Request) => handlePersistenceRequest(request);
