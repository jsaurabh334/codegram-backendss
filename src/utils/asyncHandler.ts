import { Request, Response, NextFunction } from 'express';

/**
 * A utility function to wrap asynchronous Express route handlers.
 * It catches any errors that occur in the async function and passes them
 * to the next middleware (usually the global error handler), eliminating
 * the need for repetitive try-catch blocks in controllers.
 *
 * @param {Function} fn - The asynchronous route handler function to be executed.
 * @returns {Function} An Express route handler that executes the async function and handles errors.
 */
const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => 
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

export { asyncHandler };
