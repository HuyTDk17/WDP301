import { AuthenticatedUser } from '../services/session.service';

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export {};
