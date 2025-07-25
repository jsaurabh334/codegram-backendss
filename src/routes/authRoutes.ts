// #swagger.tags = ['Auth']
import { Router } from 'express';
import passport from 'passport';
import { githubAuth, githubCallback, getMe, logout } from '../controllers/authController';

const router = Router();

router.get('/github', githubAuth);


router.get('/github/callback',
    passport.authenticate('github', { failureRedirect: '/login' }),
    githubCallback
);

router.get('/me', getMe);

router.post('/logout', logout);

export default router;