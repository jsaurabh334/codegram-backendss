import { Strategy as GitHubStrategy, Profile } from 'passport-github2';
import { prisma } from './db';
import { PassportStatic } from 'passport';
import { VerifyCallback } from 'passport-oauth2';

export const configurePassport = (passport: PassportStatic) => {
    passport.use(new GitHubStrategy({
        clientID: process.env.GITHUB_CLIENT_ID!,
        clientSecret: process.env.GITHUB_CLIENT_SECRET!,
        callbackURL: '/api/auth/github/callback',
        scope: ['user:email'],
    }, async (accessToken: string, refreshToken: string, profile: Profile, done: VerifyCallback) => {
        try {
            const githubProfile = (profile as any)._json;

            let user = await prisma.user.findUnique({
                where: { githubId: profile.id },
            });

            const userData = {
                githubId: profile.id,
                username: profile.username!,
                name: profile.displayName,
                email: profile.emails?.[0]?.value ?? '',
                avatar: githubProfile.avatar_url,
                githubUrl: profile.profileUrl,
                bio: githubProfile.bio ?? '',
                website: githubProfile.blog ?? '',
                location: githubProfile.location ?? '',
                // --- ADDED NEW FIELDS ---
                twitterUsername: githubProfile.twitter_username ?? null,
                company: githubProfile.company ?? null,
                publicRepos: githubProfile.public_repos ?? 0,
                followersCount: githubProfile.followers ?? 0,
                followingCount: githubProfile.following ?? 0,
                githubCreatedAt: githubProfile.created_at ? new Date(githubProfile.created_at) : null,
            };

            if (!user) {
                user = await prisma.user.create({
                    data: userData,
                });
            } else {
                user = await prisma.user.update({
                    where: { id: user.id },
                    data: {
                        ...userData,
                        email: profile.emails?.[0]?.value ?? user.email,
                    }
                });
            }

            return done(null, user);
        } catch (error) {
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
            done(error, false);
        }
    });
}