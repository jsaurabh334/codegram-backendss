import { Strategy as GitHubStrategy, Profile } from 'passport-github2';
import { prisma } from './db';
import { PassportStatic } from 'passport';
import { VerifyCallback } from 'passport-oauth2';
import { z } from 'zod';
import { logger } from '../utils/logger';
import { env } from './environment';

// GitHub profile validation schema
const githubProfileSchema = z.object({
  id: z.string(),
  username: z.string().min(1).max(39), // GitHub username limits
  displayName: z.string().nullable(),
  emails: z.array(z.object({
    value: z.string().email(),
    verified: z.boolean().optional(),
  })).optional(),
  profileUrl: z.string().url().optional(),
  _json: z.object({
    avatar_url: z.string().url().optional(),
    bio: z.string().nullable(),
    blog: z.string().nullable(),
    location: z.string().nullable(),
    twitter_username: z.string().nullable(),
    company: z.string().nullable(),
    public_repos: z.number().optional(),
    followers: z.number().optional(),
    following: z.number().optional(),
    created_at: z.string().optional(),
  }),
});

export const configurePassport = (passport: PassportStatic) => {
    passport.use(new GitHubStrategy({
        clientID: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
        callbackURL: '/api/auth/github/callback',
        scope: ['user:email'],
    }, async (accessToken: string, refreshToken: string, profile: Profile, done: VerifyCallback) => {
        try {
            // Validate GitHub profile data
            const validationResult = githubProfileSchema.safeParse(profile);
            if (!validationResult.success) {
                logger.error('Invalid GitHub profile data:', validationResult.error);
                return done(new Error('Invalid profile data from GitHub'));
            }

            const validatedProfile = validationResult.data;
            const githubProfile = (profile as any)._json;

            // Sanitize and validate user data
            let user = await prisma.user.findUnique({
                where: { githubId: validatedProfile.id },
            });

            const userData = {
                githubId: validatedProfile.id,
                username: validatedProfile.username,
                name: validatedProfile.displayName || validatedProfile.username,
                email: validatedProfile.emails?.[0]?.value ?? '',
                avatar: githubProfile.avatar_url,
                githubUrl: validatedProfile.profileUrl,
                bio: githubProfile.bio ?? '',
                website: githubProfile.blog ?? '',
                location: githubProfile.location ?? '',
                twitterUsername: githubProfile.twitter_username ?? null,
                company: githubProfile.company ?? null,
                publicRepos: githubProfile.public_repos ?? 0,
                followersCount: githubProfile.followers ?? 0,
                followingCount: githubProfile.following ?? 0,
                githubCreatedAt: githubProfile.created_at ? new Date(githubProfile.created_at) : null,
            };

            // Additional validation for user data
            if (!userData.email) {
                return done(new Error('Email is required from GitHub profile'));
            }

            if (!user) {
                user = await prisma.user.create({
                    data: userData,
                });
                logger.info('New user created:', { userId: user.id, username: user.username });
            } else {
                user = await prisma.user.update({
                    where: { id: user.id },
                    data: {
                        ...userData,
                        email: validatedProfile.emails?.[0]?.value ?? user.email,
                    }
                });
                logger.info('User updated:', { userId: user.id, username: user.username });
            }

            return done(null, user);
        } catch (error) {
            logger.error('GitHub OAuth error:', error);
            return done(error as Error);
        }
    }));

    passport.serializeUser((user: any, done) => {
        done(null, user.id);
    });

    passport.deserializeUser(async (id: string, done) => {
        try {
            const user = await prisma.user.findUnique({
                where: { id },
            });
            done(null, user || false);
        } catch (error) {
            logger.error('User deserialization error:', error);
            done(error, false);
        }
    });