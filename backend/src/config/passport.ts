import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { env } from './environment';
import { TokenService, GoogleTokens } from '../services/tokenService';
import { User } from '../types';

export const configurePassport = (): void => {
  passport.use(
    new GoogleStrategy(
      {
        clientID: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        callbackURL: '/api/v1/auth/google/callback',
        scope: [
          'profile',
          'email',
          'https://www.googleapis.com/auth/calendar',
          'https://www.googleapis.com/auth/calendar.events'
        ]
      },
      async (accessToken: string, refreshToken: string, profile: any, done: any) => {
        try {
          console.log('Google OAuth callback received for user:', profile.id);
          
          const tokens: GoogleTokens = {
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_at: profile._json.expires_in 
              ? new Date(Date.now() + profile._json.expires_in * 1000)
              : undefined,
            scope: profile._json.scope
          };

          let user = await TokenService.getUserFromGoogleProfile(profile);
          
          if (user) {
            user = await TokenService.updateUserFromGoogleProfile(user, profile, tokens);
            console.log('Existing user updated:', user.email);
          } else {
            user = await TokenService.createUserFromGoogleProfile(profile, tokens);
            console.log('New user created:', user.email);
          }

          return done(null, user);
        } catch (error) {
          console.error('Google OAuth strategy error:', error);
          return done(error, null);
        }
      }
    )
  );

  passport.serializeUser((user: any, done) => {
    try {
      console.log('Serializing user:', user.id);
      done(null, user.id);
    } catch (error) {
      console.error('User serialization error:', error);
      done(error, null);
    }
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      console.log('Deserializing user:', id);
      
      const user = await TokenService.getUserById(id);
      if (!user) {
        console.warn('User not found during deserialization:', id);
        return done(null, false);
      }

      done(null, user);
    } catch (error) {
      console.error('User deserialization error:', error);
      done(error, null);
    }
  });

  console.log('✅ Passport.js configured successfully');
};

export default passport;